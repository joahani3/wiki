const express = require('express')
const router = express.Router()
const _ = require('lodash')
const multer = require('multer')
const path = require('path')
const sanitize = require('sanitize-filename')

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

// 본문 등록용 문서 업로드 (hwp/pdf/doc/docx/txt/md) - 1단계: 업로드만 받고 실제 파싱은 다음 단계에서 구현
const docBodyAllowedExt = ['.hwp', '.pdf', '.doc', '.docx', '.txt', '.md']
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

  // TODO: 다음 단계에서 확장자별로 실제 파싱(mammoth/pdf-parse/hwp.js 등)을 붙여
  // req.file.buffer로부터 실제 변환된 HTML/마크다운을 content로 채운다.
  res.json({
    succeeded: true,
    filename: originalName,
    content: `<blockquote><p>📄 <strong>${_.escape(originalName)}</strong> 업로드됨 — 문서 파싱 기능은 다음 업데이트에서 제공될 예정입니다.</p></blockquote>`
  })
})

module.exports = router
