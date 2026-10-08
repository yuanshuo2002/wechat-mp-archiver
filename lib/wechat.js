// lib/wechat.js — 微信公众号免凭证接口封装
//
// 关键发现（本工具的核心）：以下三个接口**无需登录凭证**即可访问，
// 借此可以枚举出公众号的「合集(album)」及其全部历史文章（含下载必需的 sn）。
//
//   1. getappmsgext  — 给定 mid/idx，返回文章所属合集 ID 及前后篇带 sn 链接
//   2. appmsgalbum   — 给定合集 ID，分页枚举合集内全部文章（每篇带完整 sn URL）
//   3. getainfo      — 给定 mid/idx，探测文章存在性/标题（用于盲扫 mid 空间）
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 NetType/WIFI MicroMessenger/7.0.20.1781(0x6700143B) WindowsWechat(0x63090a13) UnifiedPCWindowsWechat(0xf2541f0d) XWEB/25715';

const HEADERS = { 'User-Agent': UA, Referer: 'https://mp.weixin.qq.com/' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * getappmsgext：给定文章的 mid/idx，返回合集信息与前/后篇链接。
 * @returns {{ albumId: string|null, preLink: string|null, nextLink: string|null, raw: object }}
 */
async function getAppmsgExt(biz, mid, idx) {
  const qs = new URLSearchParams({ __biz: biz, mid: String(mid), idx: String(idx), scene: '0', f: 'json', x5: '0' });
  const res = await fetch('https://mp.weixin.qq.com/mp/getappmsgext?' + qs.toString(), { headers: HEADERS });
  const j = await res.json();
  const ext = (j && j.appmsg_album_extinfo) || {};
  const clean = (u) => (u ? String(u).replace(/&amp;/g, '&').replace(/^http:/, 'https:') : null);
  return {
    albumId: ext.album_id_str || null,
    preLink: clean(ext.pre_article_link),
    nextLink: clean(ext.next_article_link),
    raw: j,
  };
}

/**
 * appmsgalbum：分页枚举某个合集的全部文章。
 * @returns {Promise<Array<{mid,idx,title,url,createTime,posNum}>>}
 */
async function getAlbumArticles(biz, albumId, { onPage } = {}) {
  const all = [];
  let cursor = null;
  let page = 0;
  while (page < 1000) {
    page++;
    const params = { __biz: biz, action: 'getalbum', album_id: String(albumId), count: '20', f: 'json' };
    if (cursor) { params.begin_msgid = cursor.msgid; params.begin_itemidx = cursor.itemidx; }
    const qs = new URLSearchParams(params);
    const res = await fetch('https://mp.weixin.qq.com/mp/appmsgalbum?' + qs.toString(), { headers: HEADERS });
    const j = await res.json();
    if (!j || !j.getalbum_resp) break;
    const resp = j.getalbum_resp;
    const list = Array.isArray(resp.article_list) ? resp.article_list : [];
    for (const a of list) {
      all.push({
        mid: a.msgid,
        idx: a.itemidx,
        title: a.title || '',
        url: (a.url || '').replace(/&amp;/g, '&').replace(/^http:/, 'https:'),
        createTime: Number(a.create_time || 0),
        posNum: Number(a.pos_num || 0),
      });
    }
    if (onPage) onPage({ page, list: list.map((a) => ({ mid: a.msgid, idx: a.itemidx, title: a.title })), continueFlag: String(resp.continue_flag || '0') });
    const cont = String(resp.continue_flag || '0');
    if (list.length) { const last = list[list.length - 1]; cursor = { msgid: last.msgid, itemidx: last.itemidx }; }
    if (cont !== '1') break;
    await sleep(600 + Math.floor(Math.random() * 400));
  }
  return all;
}

/**
 * getainfo：批量探测 mid/idx 是否存在（返回标题）。用于盲扫 mid 空间定位文章。
 * @param {string} biz
 * @param {Array<{mid,idx}>} targets
 * @returns {Promise<Array<{mid,idx,title,url}>>}
 */
async function getArticleInfo(biz, targets) {
  const urls = targets.map((t) => `https://mp.weixin.qq.com/s?__biz=${biz}&mid=${t.mid}&idx=${t.idx}`);
  const qs = new URLSearchParams({
    fasttmplajax: '1', f: 'json', wxtoken: '', devicetype: 'UnifiedPCWindows',
    clientversion: 'f2541f0d', version: 'f2541f0d', __biz: biz,
    enterid: String(Date.now()), appmsg_token: '', x5: '0', user_article_role: '0',
  });
  const res = await fetch('https://mp.weixin.qq.com/mp/getainfo?' + qs.toString(), {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'req=' + encodeURIComponent(JSON.stringify({ url: urls })),
  });
  const j = await res.json();
  if (!j || !j.base_resp || j.base_resp.ret !== 0) return [];
  const ainfos = j.ainfos || [];
  return ainfos.map((a) => {
    const m = String(a.url || '').match(/mid=(\d+)&idx=(\d+)/);
    return m
      ? { mid: m[1], idx: m[2], title: a.title || '', url: String(a.url || '') }
      : null;
  }).filter(Boolean);
}

module.exports = { getAppmsgExt, getAlbumArticles, getArticleInfo, sleep };
