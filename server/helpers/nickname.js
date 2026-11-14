const _ = require('lodash')
const crypto = require('crypto')

/* global WIKI */

/**
 * 별명(닉네임) 기반 무로그인 사용
 *
 * 접속자 IP 하나당 Wiki.js 사용자 계정 하나를 자동으로 만들어 두고(이메일 = ip-<IP>@nickname.local),
 * 같은 IP에서 로그인 없이 들어오면 그 계정으로 자동 로그인시킨다. 별명은 계정의 name 필드에 저장되므로
 * 문서 작성자/수정 이력/댓글에 별명이 그대로 표시된다.
 *
 * 권한은 '별명 사용자' 그룹으로 부여한다 (없으면 자동 생성). 그룹 권한은 이후 관리자 화면
 * (관리 > 그룹)에서 자유롭게 조정할 수 있고, 여기서 다시 덮어쓰지 않는다.
 */

const EMAIL_DOMAIN = 'nickname.local'
const GROUP_NAME = '별명 사용자'
const GROUP_PERMISSIONS = [
  'read:pages', 'read:assets', 'read:comments', 'read:history', 'read:source',
  'write:pages', 'write:assets', 'write:comments'
]
const NAME_MAX = 30
const CACHE_TTL_MS = 30 * 1000

// IP -> { userId | null, exp } : 비로그인 요청마다 DB를 치지 않도록 짧게 캐시
const ipCache = new Map()

module.exports = {
  EMAIL_DOMAIN,
  GROUP_NAME,

  /**
   * '::ffff:192.168.0.10' -> '192.168.0.10', '::1' -> '127.0.0.1'
   */
  normalizeIp (ip) {
    let val = _.toString(ip).trim()
    if (val.startsWith('::ffff:')) { val = val.substring(7) }
    if (val === '::1') { val = '127.0.0.1' }
    return val || 'unknown'
  },

  ipToEmail (ip) {
    const norm = this.normalizeIp(ip).toLowerCase().replace(/[^0-9a-z]/g, '-')
    return `ip-${norm}@${EMAIL_DOMAIN}`
  },

  isNicknameEmail (email) {
    return _.isString(email) && email.endsWith(`@${EMAIL_DOMAIN}`)
  },

  /**
   * 이 요청의 IP에 해당하는 별명 계정이 아닌 별명 계정 JWT인가? (DHCP로 IP가 바뀐 경우 등)
   */
  isForeignNicknameToken (email, req) {
    return this.isNicknameEmail(email) && email !== this.ipToEmail(req.ip)
  },

  clearCache (ip) {
    if (ip) {
      ipCache.delete(this.normalizeIp(ip))
    } else {
      ipCache.clear()
    }
  },

  /**
   * IP에 등록된 별명 계정 id (없으면 null)
   */
  async findUserIdByIp (ip) {
    const key = this.normalizeIp(ip)
    const cached = ipCache.get(key)
    if (cached && cached.exp > Date.now()) {
      return cached.userId
    }
    const usr = await WIKI.models.users.query()
      .findOne({ email: this.ipToEmail(ip), providerKey: 'local' })
      .select('id', 'isActive')
    const userId = (usr && usr.isActive) ? usr.id : null
    ipCache.set(key, { userId, exp: Date.now() + CACHE_TTL_MS })
    return userId
  },

  /**
   * '별명 사용자' 그룹 id (없으면 생성)
   */
  async ensureGroupId () {
    const existing = await WIKI.models.groups.query().findOne({ name: GROUP_NAME }).select('id')
    if (existing) { return existing.id }

    const grp = await WIKI.models.groups.query().insertAndFetch({
      name: GROUP_NAME,
      permissions: JSON.stringify(GROUP_PERMISSIONS),
      pageRules: JSON.stringify([
        { id: 'nickname', roles: GROUP_PERMISSIONS, match: 'START', deny: false, path: '', locales: [] }
      ]),
      isSystem: false
    })
    await WIKI.auth.reloadGroups()
    WIKI.events.outbound.emit('reloadGroups')
    WIKI.logger.info(`Nickname: '${GROUP_NAME}' 그룹 생성 (id ${grp.id})`)
    return grp.id
  },

  validateName (name) {
    const val = _.toString(name).replace(/\s+/g, ' ').trim()
    if (val.length < 1) {
      throw new Error('별명을 입력해주세요.')
    }
    if (val.length > NAME_MAX) {
      throw new Error(`별명은 ${NAME_MAX}자 이내로 입력해주세요.`)
    }
    if (/[<>"'`\\]/.test(val)) {
      throw new Error('별명에 < > " \' ` \\ 문자는 쓸 수 없습니다.')
    }
    return val
  },

  /**
   * 요청 IP의 별명을 등록/변경하고 해당 사용자 모델을 반환
   */
  async setNickname (ip, rawName) {
    const name = this.validateName(rawName)
    const email = this.ipToEmail(ip)

    // 다른 사람이 이미 쓰는 별명이면 거부 (작성자 표시가 헷갈리지 않도록)
    const dup = await WIKI.models.users.query()
      .where('name', name)
      .whereNot('email', email)
      .whereNot('id', 2)
      .first()
    if (dup) {
      throw new Error('이미 다른 사람이 사용 중인 별명입니다.')
    }

    const groupId = await this.ensureGroupId()
    let usr = await WIKI.models.users.query().findOne({ email, providerKey: 'local' })

    if (usr) {
      if (!usr.isActive) {
        throw new Error('이 IP의 별명 계정은 관리자에 의해 비활성화되었습니다.')
      }
      await WIKI.models.users.query().patch({ name }).findById(usr.id)
    } else {
      usr = await WIKI.models.users.query().insert({
        providerKey: 'local',
        email,
        name,
        // 비밀번호 로그인은 쓰지 않음 - 추측 불가능한 임의 값 (bcrypt 해시되어 저장)
        password: crypto.randomBytes(32).toString('hex'),
        localeCode: _.get(WIKI.config, 'lang.code', 'en'),
        defaultEditor: 'markdown',
        timezone: 'Asia/Seoul',
        tfaIsActive: false,
        isSystem: false,
        isActive: true,
        isVerified: true,
        mustChangePwd: false
      })
      await usr.$relatedQuery('groups').relate(groupId)
      WIKI.logger.info(`Nickname: 새 별명 계정 생성 - ${this.normalizeIp(ip)} = ${name} (id ${usr.id})`)
    }

    this.clearCache(ip)
    // 이전에 발급된 토큰(옛 별명이 담긴 JWT)이 다음 요청 때 새로 발급되도록 무효화
    WIKI.auth.revokeUserTokens({ id: usr.id, kind: 'u' })
    WIKI.events.outbound.emit('addAuthRevoke', { id: usr.id, kind: 'u' })
    return usr.id
  },

  /**
   * JWT 발급 + 쿠키/헤더 설정 후, req.user로 쓸 수 있는 사용자 객체 반환
   */
  async issueToken (userId, req, res) {
    const newToken = await WIKI.models.users.refreshToken(userId)
    const user = newToken.user
    user.permissions = user.getGlobalPermissions()
    user.groups = user.getGroups()

    if (req.get('content-type') === 'application/json') {
      res.set('new-jwt', newToken.token)
    }
    res.cookie('jwt', newToken.token, require('./common').getCookieOpts())
    res.set('Cache-Control', 'no-store')
    return { user, token: newToken.token }
  }
}
