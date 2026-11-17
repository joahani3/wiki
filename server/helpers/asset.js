const crypto = require('crypto')
const path = require('path')
const sanitize = require('sanitize-filename')

module.exports = {
  /**
   * Generate unique hash from page
   */
  generateHash(assetPath) {
    return crypto.createHash('sha1').update(assetPath).digest('hex')
  },

  /**
   * 업로드 파일명을 자산 저장용 이름으로 변환
   * - 공백(띄어쓰기)과 , ; # 는 _ 로 (URL에서 깨지거나 404 나는 것 방지, 예: '인사 규정.hwp' -> '인사_규정.hwp')
   * - 소문자화 (자산 조회 getPathInfo가 경로를 소문자로 찾음)
   * - 파일명에 쓸 수 없는 문자 제거 (sanitize-filename)
   * 화면 표시/다운로드 이름은 원래 이름을 그대로 쓰고, 저장 경로에만 이 이름을 쓴다.
   */
  toAssetFilename(filename) {
    return sanitize(String(filename || '').toLowerCase().replace(/[\s,;#]+/g, '_'))
  },

  getPathInfo(assetPath) {
    return path.parse(assetPath.toLowerCase())
  }
}
