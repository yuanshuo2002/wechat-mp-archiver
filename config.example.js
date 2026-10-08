// config.example.js — 复制为 config.js 并按需修改
module.exports = {
  // 公众号 __biz（必填）。从任意一篇该号文章的链接里取 `__biz=...` 参数
  biz: 'MzUyNjk4NjM1MA==',

  // 公众号名称（可选，用于 docx 内作者署名 fallback）
  name: '华为计算',

  // 输出目录（docx 落地位置）
  outputDir: './output',

  // 每篇文章下载间隔（毫秒，避免触发风控）
  delayMin: 1500,
  delayMax: 3500,
};
