# 海外 App 竞品调研工具

一个可运行的本地 Web 工具：创建海外 App 调研任务后，系统采集公开官网、定价页和 Apple App Store 信息，记录每个来源的状态，并生成可查看、下载的 HTML 调研报告。

## 功能

- 创建、查看和重试调研任务
- 采集官网介绍、功能和官方推广页面
- 采集官网定价页，按套餐展示月付价格和年付价格
- 使用 `app-store-scraper` 采集 Apple App Store 应用信息与评分分布
- 使用 `@perttu/app-store-scraper` 采集 App Store 最近评论，最多重试 3 次
- 支持通过 Meta Ad Library API 采集公开广告素材
- 保存来源链接、采集时间和失败原因
- 在线查看或下载 HTML 调研报告

## 环境要求

- Node.js 20 或更高版本
- npm 10 或更高版本
- `sqlite3` 命令行工具，仅在首次需要手动初始化数据库时使用

## 快速启动

在项目目录执行：

```bash
cd "/Users/sibu/Documents/竞研工具"
npm install
cp .env.example .env
npx prisma generate
npm run dev -- -H 127.0.0.1 -p 3000
```

打开：<http://127.0.0.1:3000>

开发服务器会持续占用当前终端。结束服务时按 `Ctrl+C`。

## 首次数据库初始化

项目使用 SQLite，连接配置在 `.env`：

```env
DATABASE_URL="file:./dev.db"
```

如果 `prisma/dev.db` 不存在，先用已有迁移创建它：

```bash
sqlite3 prisma/dev.db ".read prisma/migrations/20260714000000_init/migration.sql"
npx prisma generate
```

随后正常启动项目即可。开发过程中若调整 Prisma Schema，先重新生成客户端：

```bash
npx prisma generate
```

## 使用流程

1. 打开首页，填写 App 名称，推荐同时填写官网 URL 和 App Store URL。
2. 创建任务后会自动开始采集，可进入任务详情查看实时状态和每个来源的结果。
3. 任务完成后点击“查看报告”。
4. 报告中的定价表分别展示月付价格与年付价格，均保留官网的原始币种和计价单位。
5. 某个公开来源不可访问或无评论时，任务会标记为“部分完成”，报告会保留真实失败说明，不会用推测内容补齐。

## DeepSeek 评价总结

在首页的 `DeepSeek API` 区域输入并保存 API Key。密钥仅保存在本地 SQLite 数据库中，页面和报告不会显示或返回其内容。

配置完成后，新建任务或重试已有任务时，系统会翻译并压缩报告中的基础信息和定价核心权益，并在成功采集 App Store 评论后对最多 30 条最新评论生成“主要好评、主要问题、产品机会”总结。报告页的“更新 AI 总结”只处理已有数据，不会重新采集。未配置 Key、没有可用评论或模型请求失败时，任务仍会正常完成，报告保留原始采集内容。

## Meta 广告来源

首页的 `Meta Ad Library` 区域可保存 Meta Developer Access Token。任务会按 App 名称检索 Meta 广告资料库，默认投放国家为 `US`；可用环境变量 `META_AD_LIBRARY_COUNTRY` 修改。未配置 Token 时，Meta 广告来源会显示为待配置，不影响其他来源的完成状态。

实现参考 Facebook Research 的 [Ad-Library-API-Script-Repository](https://github.com/facebookresearch/Ad-Library-API-Script-Repository)，使用其 `ads_archive` 查询参数与字段。Meta 的数据可用范围和权限会随 Token、地区及平台政策变化。

## 常用命令

```bash
# TypeScript 类型检查
npm run typecheck

# 构建生产包
npm run build

# 启动已构建的生产服务
npm run start -- -H 127.0.0.1 -p 3000
```

## 上传到 GitHub

先在 GitHub 网页创建一个新的空仓库。创建时不要勾选 README、`.gitignore` 或 License，因为本地项目已经包含这些文件。

回到项目目录，依次执行以下命令，将 `<GitHub 用户名>` 和 `<仓库名>` 替换为实际值：

```bash
git add .
git status
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<GitHub 用户名>/<仓库名>.git
git push -u origin main
```

首次使用 HTTPS 推送时，GitHub 可能要求浏览器登录或输入 Personal Access Token。不要把 Token、DeepSeek API Key 或 `.env` 文件提交到仓库；它们已在 `.gitignore` 中排除。上传前可再次运行：

```bash
git status
```

确认输出中不包含 `.env`、`prisma/dev.db`、`vendor/` 或其他本地数据后再推送。

## 端口被占用

默认端口是 `3000`。若启动日志显示端口已被占用，先检查占用进程：

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

确认是本项目遗留的进程后，使用输出中的 PID 关闭它：

```bash
kill <PID>
```

也可以临时换用 `3001`：

```bash
npm run dev -- -H 127.0.0.1 -p 3001
```

然后访问 <http://127.0.0.1:3001>。

## 已知限制

- 任务 worker 运行在 Next.js 进程内，重启开发服务会中断正在采集的任务。
- Apple 的公开评论接口可能返回空数据；这不会影响应用信息和评分分布的采集。
- 当前定价解析针对官网公开文本，复杂动态定价页、地区差异和登录后价格仍可能需要人工复核。
- 当前未接入 Google Play 评论和广告资料库；DeepSeek 总结需要用户先在首页配置有效 API Key。

## 项目结构

```text
app/                    页面与 API 路由
components/             任务表单、状态与进度组件
lib/research/           采集器、分析和报告生成器
prisma/                 SQLite Schema 与迁移
types/                  第三方库类型声明
agent.md                后续开发交接与环境排查记录
```
