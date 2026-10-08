# wechat-mp-archiver

微信公众号文章**全量归档**工具：免登录、免凭证，枚举公众号历史文章并导出为 **docx**（正文 + 图片内嵌）。

> 本工具源于一次真实爬取实践：成功归档某公众号 **695 篇**文章（2022-04 → 2026-10），全程零付费、零凭证。

## 它能做什么

输入公众号的 `__biz`（或任意一篇文章链接），输出：

- 全部历史文章的 **docx**（正文 + 图片内嵌，文件名 `{mid}-{idx}_{标题}.docx`）
- 一份 **文档清单 xlsx**（序号 / 发布日期 / mid / idx / 标题 / 大小 / 文件名）

## 核心原理（免凭证的关键）

微信公众号文章**不提供**公开的"历史消息列表"接口（`getmsg` 需登录会话，且对多数账号返回空）。本工具绕过了这个限制，利用三个**无需登录凭证**即可访问的接口：

| 接口 | 作用 |
|---|---|
| `getappmsgext` | 给定文章的 `mid`/`idx`，返回它所属**合集(album) ID** |
| `appmsgalbum` | 给定合集 ID，**分页枚举合集内全部文章**，每篇带完整 `sn` URL |
| `getainfo` | 给定 `mid`/`idx`，探测文章是否存在（返回标题），用于盲扫 mid 空间 |

关键点：公众号会把文章归入若干「合集 / 话题」(album)。只要拿到一个合集 ID，就能枚举出该合集内的全部文章，而**文章下载所需的 `sn` 参数就藏在合集枚举结果里**。

```
任意一篇种子文章(mid/idx)
   └─ getappmsgext ──→ 合集 ID
                        └─ appmsgalbum ──→ 全部文章(带 sn URL)
                                             └─ 下载 HTML ──→ 转 docx
```

## 安装

```bash
git clone <本仓库地址>
cd wechat-mp-archiver
npm install
```

依赖：Node.js ≥ 18（内置 `fetch`）。

## 使用

### 1. 准备

找到目标公众号的 `__biz`：打开任意一篇该号文章，从链接里取 `__biz=...` 参数（形如 `MzUyNjk4NjM1MA==`）。

（可选）复制 `config.example.js` 为 `config.js` 并填入默认值。

### 2. 运行

**方式 A：已知合集 ID**（最快，推荐）

```bash
node cli.js --biz MzUyNjk4NjM1MA== --album 2435696454431604738
```

**方式 B：从一篇种子文章自动发现合集**

```bash
node cli.js --biz MzUyNjk4NjM1MA== --mid 2247729797 --idx 1
```

**方式 C：多个种子**（会合并所有发现到的合集）

```bash
node cli.js --biz MzUyNjk4NjM1MA== --mid 2247729797 --idx 1 --mid 2247729879 --idx 2
```

### 3. 可选参数

| 参数 | 说明 |
|---|---|
| `--biz` | 公众号 `__biz`（必填） |
| `--album` | 合集 ID（方式 A） |
| `--mid` / `--idx` | 种子文章的 mid/idx（方式 B/C，可多次） |
| `--name` | 公众号名（写入 docx 署名） |
| `--out` | 输出目录（默认 `./output`） |
| `--no-manifest` | 不生成清单 xlsx |

## 输出

```
output/
├── 2247688426-1_软通动力启动鲲鹏原生应用开发合作.docx
├── 2247688426-2_软通智慧启动鲲鹏原生应用开发合作.docx
├── ...
└── archive-metadata.json   # 文章元数据（mid/idx/标题/发布时间）
文档清单.xlsx               # 清单（在 output 同级目录）
```

## 如何找到合集 ID / 种子

1. **从任意一篇文章链接**取 `mid`/`idx`，用方式 B 自动发现合集；
2. 一个公众号通常有**多个合集**（按主题划分）。发现一个合集后，其文章里又藏着其他文章的 mid/idx，可继续喂给 `--mid` 去发现更多合集；
3. 也可用 `lib/wechat.js` 的 `getArticleInfo`（getainfo）盲扫 mid 空间，找出存在的文章作为种子（mid 递增，近似时间顺序）。

## 已知局限（诚实说明）

1. **孤儿文章拿不到**：既不属于任何合集、也不被其它文章"推荐"引用的文章，其 `sn` 无法通过免费接口获得（`getainfo` 只回标题不回 `sn`）。这类文章通常需付费 API（如 TikHub `fetch_account_articles`）或手动搜索补全。
2. **已删除文章**无法恢复（服务端已删）。
3. **视频等多媒体**不会被保留——转换时主动移除了视频号卡片 / iframe / svg 等元素（否则会导致 docx 无法打开）。正文文字和图片完整保留。
4. 请遵守目标平台的条款与版权，仅用于个人备份、研究等合规用途。

## 目录结构

```
wechat-mp-archiver/
├── cli.js               # 命令行入口
├── config.example.js    # 配置示例
├── lib/
│   ├── wechat.js        # 免凭证接口封装（getappmsgext / appmsgalbum / getainfo）
│   ├── crawl.js         # 爬取编排（发现合集 → 枚举 → 下载）
│   ├── convert.js       # HTML → docx（图片内嵌 + 移除问题元素）
│   └── manifest.js      # 生成清单 xlsx
└── package.json
```

## License

MIT
