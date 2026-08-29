const express = require('express')
const router = express.Router()
const _ = require('lodash')
const multer = require('multer')
const path = require('path')
const sanitize = require('sanitize-filename')
const { convertPdfToHtml } = require('../helpers/pdfConvert')
const { convertOfficeToHtml, convertLegacyDocToHtml, convertLegacyXlsToHtml } = require('../helpers/officeConvert')

/* global WIKI */

/**
 * Upload files
 */
router.post('/u', (req, res, next) => {
  multer({
    dest: path.resolve(WIKI.ROOTPATH, WIKI.config.dataPath, 'uploads'),
    limits: {
      fileSize: WIKI.config.uploads.maxFileSize,
      files: WIKI.config.uploads.maxFiles
    }
  }).array('mediaUpload')(req, res, next)
}, async (req, res, next) => {
  if (!_.some(req.user.permissions, pm => _.includes(['write:assets', 'manage:system'], pm))) {
    return res.status(403).json({
      succeeded: false,
      message: 'You are not authorized to upload files.'
    })
  } else if (req.files.length < 1) {
    return res.status(400).json({
      succeeded: false,
      message: 'Missing upload payload.'
    })
  } else if (req.files.length > 1) {
    return res.status(400).json({
      succeeded: false,
      message: 'You cannot upload multiple files within the same request.'
    })
  }
  const fileMeta = _.get(req, 'files[0]', false)
  if (!fileMeta) {
    return res.status(500).json({
      succeeded: false,
      message: 'Missing upload file metadata.'
    })
  }

  // Get folder Id
  let folderId = null
  try {
    const folderRaw = _.get(req, 'body.mediaUpload', false)
    if (folderRaw) {
      folderId = _.get(JSON.parse(folderRaw), 'folderId', null)
      if (folderId === 0) {
        folderId = null
      }
    } else {
      throw new Error('Missing File Metadata')
    }
  } catch (err) {
    return res.status(400).json({
      succeeded: false,
      message: 'Missing upload folder metadata.'
    })
  }

  // Build folder hierarchy
  let hierarchy = []
  if (folderId) {
    try {
      hierarchy = await WIKI.models.assetFolders.getHierarchy(folderId)
    } catch (err) {
      return res.status(400).json({
        succeeded: false,
        message: 'Failed to fetch folder hierarchy.'
      })
    }
  }

  // Sanitize filename
  fileMeta.originalname = sanitize(fileMeta.originalname.toLowerCase().replace(/[\s,;#]+/g, '_'))

  // Check if user can upload at path
  const assetPath = (folderId) ? hierarchy.map(h => h.slug).join('/') + `/${fileMeta.originalname}` : fileMeta.originalname
  if (!WIKI.auth.checkAccess(req.user, ['write:assets'], { path: assetPath })) {
    return res.status(403).json({
      succeeded: false,
      message: 'You are not authorized to upload files to this folder.'
    })
  }

  // Process upload file
  await WIKI.models.assets.upload({
    ...fileMeta,
    mode: 'upload',
    folderId: folderId,
    assetPath,
    user: req.user
  })
  res.send('ok')
})

router.get('/u', async (req, res, next) => {
  res.json({
    ok: true
  })
})

// 본문 등록용 문서 업로드 (hwp/hwpx/pdf/doc/docx/xls/xlsx/pptx/txt/md)
// txt/md만 아직 안내 문구만 반환 (다음 단계에서 구현 예정). 나머지는 모두 실제 변환됨.
// 구버전 바이너리 .ppt는 지원 가능한 순수 JS 라이브러리가 없어 제외됨.
const docBodyAllowedExt = ['.hwp', '.hwpx', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.pptx', '.txt', '.md']

// Buffer/Uint8Array -> 정확한 범위의 ArrayBuffer (Buffer는 풀링된 더 큰 ArrayBuffer를 공유할 수 있어 슬라이스 필요)
function toArrayBuffer (buf) {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

// hwp/hwpx -> 본문 HTML 변환 (@ssabrojs/hwpxjs, ESM 전용이라 동적 import 사용)
async function convertHwpFamilyToHtml (buf, ext) {
  const hwpxjs = await import('@ssabrojs/hwpxjs')
  const {
    HwpxReader,
    hwpToHwpx,
    HwpxEncryptedDocumentError,
    InvalidHwpxFormatError,
    HwpEncryptedError,
    HwpUnsupportedError,
    HwpInvalidFormatError
  } = hwpxjs

  try {
    let hwpxArrayBuffer
    if (ext === '.hwpx') {
      hwpxArrayBuffer = toArrayBuffer(buf)
    } else {
      // .hwp -> hwpx 바이트로 변환 후 HTML 추출 (표/글자 모양 등 보존)
      const hwpxBytes = await hwpToHwpx(new Uint8Array(buf))
      hwpxArrayBuffer = toArrayBuffer(hwpxBytes)
    }

    const reader = new HwpxReader()
    await reader.loadFromArrayBuffer(hwpxArrayBuffer)
    return await reader.extractHtml({
      paragraphTag: 'p',
      renderTables: true,
      renderStyles: true,
      renderImages: false, // 이미지 자산 연동은 다음 단계
      embedImages: false
    })
  } catch (err) {
    if (err instanceof HwpxEncryptedDocumentError || err instanceof HwpEncryptedError) {
      throw new Error('암호화된 문서는 지원하지 않습니다.')
    } else if (err instanceof InvalidHwpxFormatError || err instanceof HwpInvalidFormatError) {
      throw new Error('올바른 hwp/hwpx 파일이 아닙니다.')
    } else if (err instanceof HwpUnsupportedError) {
      throw new Error('지원하지 않는 hwp 문서 버전입니다.')
    }
    throw err
  }
}

// 문서 업로드는 일반 자산 업로드보다 큰 파일(특히 스캔본 PDF)이 많아 별도의 넉넉한 상한을 둠
const DOC_UPLOAD_MAX_SIZE = 50 * 1024 * 1024 // 50MB

router.post('/u/parse-document', (req, res, next) => {
  multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: DOC_UPLOAD_MAX_SIZE
    }
  }).single('document')(req, res, err => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? `파일 용량이 너무 큽니다. 최대 ${Math.floor(DOC_UPLOAD_MAX_SIZE / 1024 / 1024)}MB까지 업로드할 수 있습니다.`
        : `업로드 처리 중 오류가 발생했습니다: ${err.message}`
      return res.status(400).json({ succeeded: false, message })
    }
    next()
  })
}, async (req, res, next) => {
  if (!_.some(req.user.permissions, pm => _.includes(['write:pages', 'manage:pages', 'manage:system'], pm))) {
    return res.status(403).json({
      succeeded: false,
      message: 'You are not authorized to upload documents.'
    })
  }
  if (!req.file) {
    return res.status(400).json({
      succeeded: false,
      message: 'Missing upload payload.'
    })
  }

  const originalName = sanitize(req.file.originalname)
  const ext = path.extname(originalName).toLowerCase()
  if (!_.includes(docBodyAllowedExt, ext)) {
    return res.status(400).json({
      succeeded: false,
      message: `Unsupported file type: ${ext || 'unknown'}. Allowed: ${docBodyAllowedExt.join(', ')}`
    })
  }

  // 변환에 시간이 걸릴 수 있어(특히 OCR) NDJSON 스트림으로 진행 상황을 클라이언트에 실시간 전달.
  // 이 지점부터는 응답이 이미 시작될 수 있으므로 실패도 HTTP 상태 코드가 아니라 {type:'error'} 이벤트로 알림.
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
  const send = obj => { res.write(JSON.stringify(obj) + '\n') }
  const onProgress = (current, total, label) => send({ type: 'progress', current, total, label })

  let content
  try {
    if (ext === '.hwp' || ext === '.hwpx') {
      onProgress(0, null, '문서 변환 중...')
      content = await convertHwpFamilyToHtml(req.file.buffer, ext)
    } else if (ext === '.pdf') {
      content = await convertPdfToHtml({ buffer: req.file.buffer, originalName, user: req.user, onProgress })
    } else if (ext === '.docx' || ext === '.pptx') {
      onProgress(0, null, '문서 변환 중...')
      content = await convertOfficeToHtml(req.file.buffer, ext.slice(1))
    } else if (ext === '.doc') {
      onProgress(0, null, '문서 변환 중...')
      content = await convertLegacyDocToHtml(req.file.buffer)
    } else if (ext === '.xlsx') {
      onProgress(0, null, '문서 변환 중...')
      content = await convertOfficeToHtml(req.file.buffer, 'xlsx')
    } else if (ext === '.xls') {
      onProgress(0, null, '문서 변환 중...')
      content = convertLegacyXlsToHtml(req.file.buffer)
    } else {
      // TODO: 다음 단계에서 txt/md 변환 구현
      content = `<blockquote><p>📄 <strong>${_.escape(originalName)}</strong> 업로드됨 — 이 형식의 파싱 기능은 다음 업데이트에서 제공될 예정입니다.</p></blockquote>`
    }

    if (!content || !content.trim()) {
      content = `<blockquote><p>📄 <strong>${_.escape(originalName)}</strong> 문서에서 추출된 내용이 없습니다.</p></blockquote>`
    }

    send({ type: 'complete', succeeded: true, filename: originalName, content })
  } catch (err) {
    WIKI.logger.warn(`문서 변환 실패 (${originalName}): ${err.message}`)
    send({ type: 'error', message: `문서 변환에 실패했습니다: ${err.message}` })
  } finally {
    res.end()
  }
})

module.exports = router
