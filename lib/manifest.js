// lib/manifest.js — 从输出目录的 docx 生成 xlsx 清单（含发布日期，取自 archive-metadata.json）
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function colLetter(n) {
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/**
 * 生成文档清单 xlsx。
 * @param {string} outputDir docx 所在目录
 * @param {string} outFile   xlsx 输出路径
 */
async function buildManifest(outputDir, outFile) {
  const files = fs.readdirSync(outputDir).filter((f) => f.endsWith('.docx'));
  // 尝试读取下载阶段保存的元数据（含 createTime）
  const meta = {};
  try {
    const m = JSON.parse(fs.readFileSync(path.join(outputDir, 'archive-metadata.json'), 'utf8'));
    for (const a of m) meta[`${a.mid}-${a.idx}`] = a;
  } catch (e) {}

  const rows = [];
  for (const f of files) {
    const m = f.match(/^(\d+)-(\d+)_(.*)\.docx$/);
    if (!m) continue;
    const mid = m[1], idx = m[2], title = m[3];
    const tag = `${mid}-${idx}`;
    const sz = fs.statSync(path.join(outputDir, f)).size;
    const info = meta[tag];
    let date = '';
    if (info && info.createTime) date = new Date(info.createTime * 1000).toISOString().slice(0, 10);
    rows.push({ mid, idx, title, date, size: sz, filename: f });
  }
  rows.sort((a, b) => (a.date || '9').localeCompare(b.date || '9') || a.mid.localeCompare(b.mid));
  rows.forEach((r, i) => { r.no = i + 1; });

  const headers = ['序号', '发布日期', 'mid', 'idx', '标题', '大小(KB)', '文件名'];
  let xmlRows = `<row r="1">${headers.map((h, i) => `<c r="${colLetter(i + 1)}" t="inlineStr" s="1"><is><t xml:space="preserve">${esc(h)}</t></is></c>`).join('')}</row>`;
  for (const r of rows) {
    const cells = [
      `<c r="A${r.no + 1}"><v>${r.no}</v></c>`,
      `<c r="B${r.no + 1}" t="inlineStr"><is><t>${esc(r.date)}</t></is></c>`,
      `<c r="C${r.no + 1}" t="inlineStr"><is><t>${esc(r.mid)}</t></is></c>`,
      `<c r="D${r.no + 1}"><v>${r.idx}</v></c>`,
      `<c r="E${r.no + 1}" t="inlineStr"><is><t xml:space="preserve">${esc(r.title)}</t></is></c>`,
      `<c r="F${r.no + 1}"><v>${Math.round(r.size / 1024)}</v></c>`,
      `<c r="G${r.no + 1}" t="inlineStr"><is><t xml:space="preserve">${esc(r.filename)}</t></is></c>`,
    ];
    xmlRows += `<row r="${r.no + 1}">${cells.join('')}</row>`;
  }
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<cols><col min="1" max="1" width="6"/><col min="2" max="2" width="12"/><col min="3" max="3" width="12"/><col min="4" max="4" width="5"/><col min="5" max="5" width="72"/><col min="6" max="6" width="10"/><col min="7" max="7" width="72"/></cols>
<sheetData>${xmlRows}</sheetData></worksheet>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="2"><xf fontId="0"/><xf fontId="1"/></cellXfs></styleSheet>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="文档清单" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypes);
  zip.file('_rels/.rels', rootRels);
  zip.file('xl/workbook.xml', workbook);
  zip.file('xl/_rels/workbook.xml.rels', workbookRels);
  zip.file('xl/worksheets/sheet1.xml', sheet);
  zip.file('xl/styles.xml', styles);
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(outFile, buf);
  return { rows: rows.length };
}

module.exports = { buildManifest };
