#!/usr/bin/env node
// cli.js — 命令行入口
//
// 用法：
//   1) 已知合集 ID，直接归档：
//      node cli.js --biz MzUyNjk4NjM1MA== --album 2435696454431604738
//   2) 给定一篇种子文章的 mid/idx，自动发现合集后归档：
//      node cli.js --biz MzUyNjk4NjM1MA== --mid 2247729797 --idx 1
//   3) 多个种子（会合并发现到的所有合集）：
//      node cli.js --biz ... --mid 2247729797 --idx 1 --mid 2247729879 --idx 2
//
// 可选参数：--name 公众号名、--out 输出目录、--manifest 生成清单 xlsx
const fs = require('fs');
const path = require('path');
const { discoverAlbums, archiveAlbum } = require('./lib/crawl');
const { buildManifest } = require('./lib/manifest');

function parseArgs(argv) {
  const a = { seeds: [], album: null, biz: null, name: '', out: './output', manifest: true };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === '--biz') { a.biz = v; i++; }
    else if (k === '--album') { a.album = v; i++; }
    else if (k === '--mid') { const m = v; i++; const idx = (argv[i + 1] === '--idx' ? argv[i + 2] : '1'); if (argv[i + 1] === '--idx') i += 2; a.seeds.push({ mid: m, idx }); }
    else if (k === '--name') { a.name = v; i++; }
    else if (k === '--out') { a.out = v; i++; }
    else if (k === '--no-manifest') { a.manifest = false; }
  }
  return a;
}

(async () => {
  const a = parseArgs(process.argv.slice(2));

  let config;
  try { config = require(path.resolve('./config.js')); } catch (e) { config = {}; }
  const biz = a.biz || config.biz;
  const name = a.name || config.name || '';
  const outputDir = path.resolve(a.out || config.outputDir || './output');
  const delayMin = config.delayMin || 1500;
  const delayMax = config.delayMax || 3500;

  if (!biz) {
    console.error('缺少 __biz。用法：node cli.js --biz <__biz> [--album <id> | --mid <mid> --idx <idx>]');
    process.exit(1);
  }

  const cfg = { biz, name, outputDir, delayMin, delayMax };
  console.log(`biz=${biz} name="${name}" output=${outputDir}`);

  let albumIds = [];
  if (a.album) {
    albumIds = [a.album];
  } else if (a.seeds.length) {
    console.log('发现合集中…（seed=' + a.seeds.map((s) => `${s.mid}-${s.idx}`).join(',') + '）');
    const found = await discoverAlbums(biz, a.seeds);
    albumIds = found.map((f) => f.albumId);
    if (!albumIds.length) {
      console.error('未能从种子发现任何合集。请确认 mid/idx 正确，或直接用 --album 指定合集 ID。');
      process.exit(1);
    }
    console.log('发现合集：' + albumIds.join(', '));
  } else {
    console.error('请提供 --album <合集ID> 或 --mid <mid> --idx <idx>');
    process.exit(1);
  }

  let total = { ok: 0, fail: 0, skip: 0 };
  for (const albumId of albumIds) {
    const r = await archiveAlbum(biz, albumId, cfg);
    total.ok += r.ok; total.fail += r.fail; total.skip += r.skip;
  }
  console.log(`完成：新增 ${total.ok} 篇，失败 ${total.fail} 篇，跳过(已存在) ${total.skip} 篇`);

  if (a.manifest) {
    const manifestFile = path.join(path.dirname(outputDir), '文档清单.xlsx');
    const { rows } = await buildManifest(outputDir, manifestFile);
    console.log(`已生成清单：${manifestFile}（${rows} 篇）`);
  }
})();
