const fs = require('fs-extra')
const path = require('path')
const os = require('os')
const { execFile } = require('child_process')
const { promisify } = require('util')
const _ = require('lodash')
const sanitize = require('sanitize-filename')

const execFileAsync = promisify(execFile)

/* global WIKI */

const RASTER_DPI = 150
const MIN_TEXT_LENGTH = 10 // 이보다 짧으면 스캔본으로 간주하고 OCR 시도

async function loadPdfjs () {
  return import('pdfjs-dist/legacy/build/pdf.mjs')
}

/**
 * pdfjs textContent.items를 y좌표 기준으로 줄 단위로 묶어 읽기 순서에 가깝게 재구성
 */
function reconstructPageText (textContent) {
  const items = textContent.items || []
  if (items.length === 0) {
    return ''
  }

  const Y_TOLERANCE = 2
  const sorted = [...items].sort((a, b) => {
    const ay = a.transform[5]
    const by = b.transform[5]
    if (Math.abs(ay - by) > Y_TOLERANCE) {
      return by - ay // PDF 좌표계는 y가 클수록 위쪽 -> 위에서 아래로 정렬
    }
    return a.transform[4] - b.transform[4] // 왼쪽에서 오른쪽으로
  })

  const lines = []
  let currentLine = null
  for (const item of sorted) {
    if (!item.str) {
      continue
    }
    const y = item.transform[5]
    if (!currentLine || Math.abs(currentLine.y - y) > Y_TOLERANCE) {
      currentLine = { y, parts: [item.str] }
      lines.push(currentLine)
    } else {
      currentLine.parts.push(item.str)
    }
  }

  return lines.map(l => l.parts.join(' ').replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n')
}

/**
 * poppler-utils(pdftoppm)로 한 페이지를 PNG로 래스터화
 */
async function rasterizePage (pdfPath, pageNum, tmpDir) {
  const prefix = path.join(tmpDir, `page${pageNum}`)
  await execFileAsync('pdftoppm', ['-png', '-r', String(RASTER_DPI), '-f', String(pageNum), '-l', String(pageNum), pdfPath, prefix])
  const base = path.basename(prefix)
  const files = await fs.readdir(tmpDir)
  const match = files.find(f => f.startsWith(base + '-') && f.toLowerCase().endsWith('.png'))
  if (!match) {
    throw new Error(`페이지 ${pageNum} 렌더링 결과 파일을 찾을 수 없습니다.`)
  }
  return path.join(tmpDir, match)
}

/**
 * tesseract-ocr로 이미지에서 텍스트 추출 (한국어+영어)
 */
async function ocrImage (imgPath) {
  const { stdout } = await execFileAsync('tesseract', [imgPath, 'stdout', '-l', 'kor+eng'], {
    maxBuffer: 1024 * 1024 * 20
  })
  return stdout.trim()
}

/**
 * 렌더링된 페이지 PNG를 Wiki.js 자산으로 업로드하고 접근 경로를 반환
 */
async function uploadPageImage ({ imgPath, assetBaseName, pageNum, user }) {
  const originalname = `${assetBaseName}-p${pageNum}.png`
  const assetPath = originalname

  if (!WIKI.auth.checkAccess(user, ['write:assets'], { path: assetPath })) {
    throw new Error('페이지 이미지를 자산으로 업로드할 권한이 없습니다.')
  }

  const stat = await fs.stat(imgPath)
  await WIKI.models.assets.upload({
    originalname,
    mimetype: 'image/png',
    size: stat.size,
    path: imgPath,
    folderId: null,
    assetPath,
    mode: 'upload',
    user
  })
  return `/${assetPath}`
}

/**
 * PDF 버퍼를 페이지별 (텍스트 or OCR 텍스트) + 원본 페이지 스크린샷이 함께 있는 HTML로 변환
 */
async function convertPdfToHtml ({ buffer, originalName, user }) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wiki-pdf-'))
  const pdfPath = path.join(tmpDir, 'input.pdf')
  await fs.writeFile(pdfPath, buffer)

  const assetBaseName = sanitize(path.basename(originalName, path.extname(originalName)))
    .toLowerCase().replace(/[\s,;#]+/g, '_') || 'document'

  // 페이지 스크린샷을 자산으로 저장해야 하므로 미리 권한을 확인 (실패 시 조용히 이미지만 빠지는 대신 명확히 에러)
  if (!WIKI.auth.checkAccess(user, ['write:assets'], { path: `${assetBaseName}-p1.png` })) {
    await fs.remove(tmpDir)
    throw new Error('페이지 이미지를 자산으로 업로드할 권한이 없습니다.')
  }

  try {
    const pdfjsLib = await loadPdfjs()
    let pdfDocument
    try {
      pdfDocument = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise
    } catch (err) {
      if (err instanceof pdfjsLib.PasswordException) {
        throw new Error('암호로 보호된 PDF는 지원하지 않습니다.')
      } else if (err instanceof pdfjsLib.InvalidPDFException) {
        throw new Error('올바른 PDF 파일이 아닙니다.')
      }
      throw err
    }

    const numPages = pdfDocument.numPages
    const pageBlocks = []

    for (let i = 1; i <= numPages; i++) {
      let pageText = ''
      try {
        const page = await pdfDocument.getPage(i)
        const textContent = await page.getTextContent()
        pageText = reconstructPageText(textContent)
      } catch (err) {
        WIKI.logger.warn(`PDF 페이지 ${i} 텍스트 추출 실패: ${err.message}`)
      }

      let imgUrl = null
      try {
        const imgPath = await rasterizePage(pdfPath, i, tmpDir)

        if (_.isEmpty(_.trim(pageText)) || _.trim(pageText).length < MIN_TEXT_LENGTH) {
          try {
            const ocrText = await ocrImage(imgPath)
            if (!_.isEmpty(_.trim(ocrText))) {
              pageText = ocrText
            }
          } catch (err) {
            WIKI.logger.warn(`PDF 페이지 ${i} OCR 실패: ${err.message}`)
          }
        }

        imgUrl = await uploadPageImage({ imgPath, assetBaseName, pageNum: i, user })
      } catch (err) {
        WIKI.logger.warn(`PDF 페이지 ${i} 이미지 처리 실패: ${err.message}`)
      }

      const trimmedText = _.trim(pageText)
      const textHtml = trimmedText
        ? trimmedText.split('\n').map(l => _.trim(l)).filter(Boolean).map(l => `<p>${_.escape(l)}</p>`).join('')
        : '<p><em>(이 페이지에서 텍스트를 추출하지 못했습니다)</em></p>'
      const imgHtml = imgUrl ? `<p><img src="${imgUrl}" alt="페이지 ${i} 원본"></p>` : ''

      pageBlocks.push(`<h3>페이지 ${i}</h3>${textHtml}${imgHtml}`)
    }

    return pageBlocks.join('<hr>')
  } finally {
    await fs.remove(tmpDir)
  }
}

module.exports = {
  convertPdfToHtml
}
