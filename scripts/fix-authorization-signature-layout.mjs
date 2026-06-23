import fs from 'node:fs'
import PizZip from 'pizzip'

const templatePath = 'public/templates/GIAY_UY_QUYEN_CA_NHAN_TEMPLATE.docx'

const signatureTable = `<w:tbl>
  <w:tblPr>
    <w:tblW w:w="5000" w:type="pct"/>
    <w:tblBorders>
      <w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/>
      <w:insideH w:val="nil"/><w:insideV w:val="nil"/>
    </w:tblBorders>
    <w:tblLayout w:type="fixed"/>
  </w:tblPr>
  <w:tblGrid>
    <w:gridCol w:w="4678"/>
    <w:gridCol w:w="4678"/>
  </w:tblGrid>
  <w:tr>
    <w:tc>
      <w:tcPr><w:tcW w:w="2500" w:type="pct"/></w:tcPr>
      <w:p>
        <w:pPr><w:jc w:val="left"/></w:pPr>
        <w:r>
          <w:rPr>
            <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/>
            <w:sz w:val="24"/><w:szCs w:val="24"/>
          </w:rPr>
          <w:t>{{authorized_person_name}}</w:t>
        </w:r>
      </w:p>
    </w:tc>
    <w:tc>
      <w:tcPr><w:tcW w:w="2500" w:type="pct"/></w:tcPr>
      <w:p>
        <w:pPr><w:jc w:val="center"/></w:pPr>
        <w:r>
          <w:rPr>
            <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/>
            <w:sz w:val="24"/><w:szCs w:val="24"/>
          </w:rPr>
          <w:t>{{farmer_name}}</w:t>
        </w:r>
      </w:p>
    </w:tc>
  </w:tr>
</w:tbl>`

const zip = new PizZip(fs.readFileSync(templatePath))
let xml = zip.file('word/document.xml').asText()

// Chỉ thay dòng ký tên cuối — không đụng đoạn nội dung có cả 2 placeholder trong cùng câu.
const signaturePatterns = [
  /<w:p[^>]*w14:paraId="00000024"[\s\S]*?<\/w:p>/,
  /<w:p[^>]*>[\s\S]*?<w:t[^>]*>\s*\{\{authorized_person_name\}\}[\s\t]*\{\{farmer_name\}\}\s*<\/w:t>[\s\S]*?<\/w:p>/,
]

const signatureParagraph = signaturePatterns.find((pattern) => pattern.test(xml))
if (!signatureParagraph) {
  console.error('Không tìm thấy đoạn ký tên cuối tài liệu')
  process.exit(1)
}

xml = xml.replace(signatureParagraph, signatureTable)
zip.file('word/document.xml', xml)
fs.writeFileSync(
  templatePath,
  zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }),
)
console.log('Đã thay dòng ký tên bằng bảng 2 cột')
