const _ = require('lodash')
const { convert: officeConvert } = require('officeparser')
const WordExtractor = require('word-extractor')
const XLSX = require('xlsx')

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
  convertLegacyXlsToHtml
}
