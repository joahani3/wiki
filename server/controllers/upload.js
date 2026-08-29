const express = require('express')
const router = express.Router()
const _ = require('lodash')
const multer = require('multer')
const path = require('path')
const sanitize = require('sanitize-filename')
const { convertPdfToHtml } = require('../helpers/pdfConvert')

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

// 본문 등록용 문서 업로드 (hwp/pdf/doc/docx/txt/md)
// hwp/hwpx는 실제 변환 구현됨. pdf/doc/docx/txt/md는 다음 단계에서 구현 예정 (현재는 안내 문구만 반환)
const docBodyAllowedExt = ['.hwp', '.hwpx', '.pdf', '.doc', '.docx', '.txt', '.md']

// Buffer/Uint8Array -> 정확한 범위의 ArrayBuffer (Buffer는 풀링된 더 큰 ArrayBuffer를 공유할 수 있어 슬라이스 필요)
function toArrayBuffer (buf) {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

// hwp/hwpx -> 본문 HTML 변환 (@ssabrojs/hwpxjs, ESM 전용이라 동적 import 사용)
async function convertHwpFamilyToHtml (buf, ext) {
  const hwpxjs = await import('@ssabrojs/hwpxjs')
  const {
    default: HwpxReader,
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

router.post('/u/parse-document', (req, res, next) => {
  multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: WIKI.config.uploads.maxFileSize
    }
  }).single('document')(req, res, next)
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

  let content
  try {
    if (ext === '.hwp' || ext === '.hwpx') {
      content = await convertHwpFamilyToHtml(req.file.buffer, ext)
      if (!content || !content.trim()) {
        content = `<blockquote><p>📄 <strong>${_.escape(originalName)}</strong> 문서에서 추출된 내용이 없습니다.</p></blockquote>`
      }
    } else if (ext === '.pdf') {
      content = await convertPdfToHtml({ buffer: req.file.buffer, originalName, user: req.user })
      if (!content || !content.trim()) {
        content = `<blockquote><p>📄 <strong>${_.escape(originalName)}</strong> 문서에서 추출된 내용이 없습니다.</p></blockquote>`
      }
    } else {
      // TODO: 다음 단계에서 doc/docx/txt/md 변환 구현
      content = `<blockquote><p>📄 <strong>${_.escape(originalName)}</strong> 업로드됨 — 이 형식의 파싱 기능은 다음 업데이트에서 제공될 예정입니다.</p></blockquote>`
    }
  } catch (err) {
    WIKI.logger.warn(`문서 변환 실패 (${originalName}): ${err.message}`)
    return res.status(422).json({
      succeeded: false,
      message: `문서 변환에 실패했습니다: ${err.message}`
    })
  }

  res.json({
    succeeded: true,
    filename: originalName,
    content
  })
})

module.exports = router
