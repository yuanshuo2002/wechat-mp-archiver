// lib/convert.js — 微信公众号文章 HTML → DOCX（正文 + 图片内嵌）
//
// 核心要点：
//   1. 图片从 data-src 下载后转 base64 data URI 内嵌，避免 docx 依赖外链图片。
//   2. 移除会导致 docx 无法打开的多媒体/交互元素（视频号卡片、iframe、svg、小程序等）。
//      —— 这是实践中踩过的坑：微信文章里的 <mp-common-videosnap> 视频号卡片会
//         让 html-to-docx 生成无效 XML，导致 Word 报「发现无法读取的内容」。
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const HTMLtoDOCX = require('html-to-docx');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

function pick(html, re) {
  const m = html.match(re);
  return m ? m[1] : '';
}
function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}
async function urlToDataUri(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: 'https://mp.weixin.qq.com/' } });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || 'image/jpeg';
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${ct.split(';')[0]};base64,${buf.toString('base64')}`;
  } catch (e) {
    return null;
  }
}

async function htmlToDocx(raw, { titleOverride = '', authorFallback = '' } = {}) {
  const title =
    titleOverride ||
    decodeEntities(
      pick(raw, /var msg_title = ['"]([^'"]*)['"]/) ||
        pick(raw, /<meta property="og:title" content="([^"]*)"/)
    ) ||
    'untitled';
  const author = decodeEntities(
    pick(raw, /var author = ['"]([^'"]*)['"]/) || pick(raw, /var nickname = htmlDecode\("([^"]*)"\)/)
  );
  const ctMatch = raw.match(/var ct = ['"](\d+)['"]/) || raw.match(/var ct="(\d+)"/);
  const dateStr = ctMatch ? new Date(parseInt(ctMatch[1], 10) * 1000) : null;

  const $ = cheerio.load(raw);
  let content = $('#js_content');
  if (!content.length) content = $('.rich_media_content');
  if (!content.length) content = $('body');

  const imgs = content.find('img').toArray();
  let imgOk = 0;
  for (const el of imgs) {
    let src = $(el).attr('data-src') || $(el).attr('src') || '';
    if (!src || src.startsWith('data:')) continue;
    if (src.startsWith('//')) src = 'https:' + src;
    if (!/^https?:/.test(src)) continue;
    const dataUri = await urlToDataUri(src);
    if (dataUri) {
      $(el).attr('src', dataUri);
      $(el).removeAttr('data-src');
      imgOk++;
    } else {
      $(el).remove();
    }
  }

  // 移除会导致 docx 无效的多媒体/交互/自定义组件
  content.find('iframe, svg, video, audio, embed, object, script, style').remove();
  content.find(
    'mp-common-videosnap, mpvoice, mpvideo, mpcps, mp-miniprogram, mp-common-product, ' +
    'mp-common-mpaudio, mp-common-qqmusic, mp-common-cps, mp-common-profile, mp-common-topnav, ' +
    'mp-common-bottomnav, mp-common-search, mp-common-questionscheck, mp-common-comment, mp-common-redpacket'
  ).remove();
  content.find('[class*="video_iframe"], [class*="videosnap"], [class*="channels_iframe"], [class*="appmsg_card"], [class*="weapp_card"], [class*="qqmusic"]').remove();

  content.find('*').removeAttr('style').removeAttr('class').removeAttr('id');

  const bodyHtml = content.html() || '';
  const fullHtml =
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head><body>` +
    `<h1>${title}</h1>` +
    `<p>作者：${author || authorFallback || ''}　发布时间：${dateStr ? dateStr.toLocaleString('zh-CN') : ''}</p>` +
    bodyHtml +
    `</body></html>`;

  const buf = await HTMLtoDOCX(fullHtml, null, {
    table: { row: { cantSplit: true } },
    footer: false,
    pageNumber: false,
    font: '宋体',
  });
  return { buf, title, author, date: dateStr, images: { ok: imgOk, total: imgs.length } };
}

// 文件名安全化（去除非法字符）
function safeName(s) {
  return String(s || 'untitled')
    .replace(/[\\/:*?"<>|\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

module.exports = { htmlToDocx, safeName };
