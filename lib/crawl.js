// lib/crawl.js — 爬取编排：发现合集 → 枚举文章 → 下载转 docx
const fs = require('fs');
const path = require('path');
const { getAppmsgExt, getAlbumArticles, sleep } = require('./wechat');
const { htmlToDocx, safeName } = require('./convert');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

/**
 * 从若干「种子文章」(mid/idx) 发现其所属合集 ID（去重）。
 * 种子来源：任意一篇该公众号的文章链接里 mid/idx 参数，或 getainfo 盲扫得到。
 */
async function discoverAlbums(biz, seeds) {
  const albums = new Set();
  const details = [];
  for (const s of seeds) {
    try {
      const ext = await getAppmsgExt(biz, s.mid, s.idx);
      if (ext.albumId && !albums.has(ext.albumId)) {
        albums.add(ext.albumId);
        details.push({ albumId: ext.albumId, seed: `${s.mid}-${s.idx}` });
      }
    } catch (e) {
      // 单个种子失败不阻断
    }
    await sleep(500 + Math.floor(Math.random() * 400));
  }
  return details;
}

/**
 * 下载单篇文章 HTML 并转 docx。
 */
async function downloadArticle(url, config, { titleOverride } = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: 'https://mp.weixin.qq.com/' } });
  const html = await res.text();
  if (html.length < 50000 || (!html.includes('js_content') && !html.includes('rich_media_content'))) {
    throw new Error('not-content len=' + html.length);
  }
  return htmlToDocx(html, { titleOverride: titleOverride || '', authorFallback: config.name || '' });
}

/**
 * 枚举并归档一个合集：下载全部文章转 docx。
 * @param {object} config  { biz, name, outputDir, delayMin, delayMax }
 * @returns {{ok, fail, skip, articles}}
 */
async function archiveAlbum(biz, albumId, config) {
  fs.mkdirSync(config.outputDir, { recursive: true });
  const articles = await getAlbumArticles(biz, albumId, {
    onPage: ({ page, continueFlag }) => console.log(`  [album ${albumId}] page ${page} (+${page === 1 ? '' : ''}) continue=${continueFlag}`),
  });
  console.log(`  [album ${albumId}] 共 ${articles.length} 篇文章，开始下载…`);
  let ok = 0, fail = 0, skip = 0;
  for (const a of articles) {
    const tag = `${a.mid}-${a.idx}`;
    const existing = fs.readdirSync(config.outputDir).find((f) => f.startsWith(tag + '_'));
    if (existing) { skip++; continue; }
    try {
      const { buf, title, images } = await downloadArticle(a.url, config, { titleOverride: a.title });
      fs.writeFileSync(path.join(config.outputDir, `${tag}_${safeName(title)}.docx`), buf);
      ok++;
      console.log(`  OK ${tag} "${String(title).slice(0, 24)}" img=${images.ok}/${images.total}`);
    } catch (e) {
      fail++;
      console.log(`  FAIL ${tag} :: ${e.message}`);
    }
    await sleep(config.delayMin + Math.floor(Math.random() * (config.delayMax - config.delayMin)));
  }
  // 保存元数据（含 createTime），供生成清单时带日期
  const metaFile = path.join(config.outputDir, 'archive-metadata.json');
  let meta = [];
  try { meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')); } catch (e) {}
  const seen = new Set(meta.map((m) => `${m.mid}-${m.idx}`));
  for (const a of articles) {
    const k = `${a.mid}-${a.idx}`;
    if (!seen.has(k)) { meta.push({ mid: a.mid, idx: a.idx, title: a.title, createTime: a.createTime }); seen.add(k); }
  }
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2), 'utf8');
  return { ok, fail, skip, articles };
}

module.exports = { discoverAlbums, downloadArticle, archiveAlbum };
