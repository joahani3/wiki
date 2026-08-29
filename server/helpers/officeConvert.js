const _ = require('lodash')
const { convert: officeConvert } = require('officeparser')
const WordExtractor = require('word-extractor')
const XLSX = require('xlsx')
const iconv = require('iconv-lite')
const MarkdownIt = require('markdown-it')
const mdAttrs = require('markdown-it-attrs')
const mdDecorate = require('markdown-it-decorate')
const mdMultimdTable = require('markdown-it-multimd-table')
const mdTaskLists = require('markdown-it-task-lists')
const mdFootnote = require('markdown-it-footnote')

// Wiki.js 자체 페이지 렌더러(markdown-core)와 동일한 기본 옵션 + 표/체크박스/각주 플러그인.
// 새 의존성 없이 이미 설치된 markdown-it 플러그인만 재사용
const md = new MarkdownIt({
  html: false, // 업로드된 파일의 raw HTML을 그대로 통과시키지 않음 (CKEditor 스키마/보안)
  linkify: true,
  typographer: true
})
  .use(mdAttrs, { allowedAttributes: ['id', 'class', 'target'] })
  .use(mdDecorate)
  .use(mdMultimdTable)
  .use(mdTaskLists)
  .use(mdFootnote)

/**
 * 텍스트 파일 버퍼를 문자열로 디코딩. BOM이 있으면 그에 따라, 없으면 UTF-8로
 * 시도해보고 치환문자(�)가 많이 섞이면 한국어 Windows에서 흔한 CP949(EUC-KR)로
 * 재시도한다 (메모장 등에서 "ANSI"로 저장한 한글 txt 파일 대응).
 */
function decodeTextBuffer (buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return buffer.slice(3).toString('utf8')
  }
  if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
    return buffer.slice(2).toString('utf16le')
  }
  if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) {
    return iconv.decode(buffer.slice(2), 'utf16be')
  }

  const utf8Text = buffer.toString('utf8')
  const replacementCount = (utf8Text.match(/�/g) || []).length
  if (replacementCount === 0 || replacementCount / Math.max(utf8Text.length, 1) < 0.01) {
    return utf8Text
  }
  return iconv.decode(buffer, 'cp949')
}

/**
 * .txt -> 줄바꿈 기준 문단으로 감싼 HTML
 */
function convertTxtToHtml (buffer) {
  const text = decodeTextBuffer(buffer)
  const paragraphs = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (paragraphs.length === 0) {
    return ''
  }
  return paragraphs.map(p => `<p>${_.escape(p)}</p>`).join('')
}

/**
 * .md -> HTML (markdown-it, Wiki.js가 이미 쓰는 라이브러리 재사용)
 */
function convertMarkdownToHtml (buffer) {
  const text = decodeTextBuffer(buffer)
  return md.render(text)
}

/**
 * docx/pptx/xlsx (OOXML) -> HTML. officeparser가 표/서식을 보존해서 변환해줌.
 */
async function convertOfficeToHtml (buffer, fileType) {
  const result = await officeConvert(buffer, 'html', {
    parseConfig: { fileType },
    generatorConfig: {
      htmlConfig: {
        standalone: false // 본문에 바로 삽입할 조각만 필요, <html>/<head> 래핑 불필요
      }
    }
  })
  return result.value
}

/**
 * 구버전 바이너리 .doc -> 텍스트만 추출해 문단으로 감싼 HTML (표/서식 없음)
 */
async function convertLegacyDocToHtml (buffer) {
  const extractor = new WordExtractor()
  const doc = await extractor.extract(buffer)
  const body = doc.getBody() || ''
  const paragraphs = body.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (paragraphs.length === 0) {
    return ''
  }
  return paragraphs.map(p => `<p>${_.escape(p)}</p>`).join('')
}

/**
 * 구버전 바이너리 .xls -> 시트별 HTML 표
 */
function convertLegacyXlsToHtml (buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const blocks = workbook.SheetNames.map(name => {
    const sheet = workbook.Sheets[name]
    const table = XLSX.utils.sheet_to_html(sheet, { header: '', footer: '' })
    return `<h3>${_.escape(name)}</h3>${table}`
  })
  return blocks.join('<hr>')
}

module.exports = {
  convertOfficeToHtml,
  convertLegacyDocToHtml,
  convertLegacyXlsToHtml,
  convertTxtToHtml,
  convertMarkdownToHtml
}
