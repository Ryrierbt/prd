# 海外 App 竞品调研工具

一个可运行的本地 Web 工具：创建海外 App 调研任务后，系统先采集官网、定价页、应用商店、社区和广告等公开来源，记录每个来源的状态，再在用户确认后使用 DeepSeek 生成可查看、下载的 HTML 调研报告。

## 功能

- 创建、查看、定向重新采集和删除调研任务
- 采集官网介绍、功能和官方推广页面
- 采集官网定价页，按套餐展示月付价格和年付价格
- 使用 GitHub 依赖 `git@github.com:Ryrierbt/app-store-scraper.git` 采集 Apple App Store 应用信息、评分分布与评论
- 使用 `google-play-scraper` 采集 Google Play 应用信息、评分分布与评论
- 内置 `tools/social-agent` 社媒采集 agent，统一采集 YouTube、Reddit、TikTok 的公开视频、帖子和评论，生成社区热议分析
- 首页提供“社媒专属浏览器”按钮，macOS 上可一键打开带固定 CDP 端口和独立 profile 的 Chrome，后续社媒采集默认复用该浏览器
- App Store 评论端由独立 `app-store-scraper` 包统一处理，带浏览器请求头、多区域和每区域 3 次重试
- 支持通过本地 Playwright 浏览器采集 Facebook Ads Library 公开广告素材
- 支持通过 `google-ads-transparency-mcp` 采集 Google Ads Transparency Center 公开广告素材
- 使用 DeepSeek 综合官网、应用商店、广告素材、社区讨论和视频字幕生成可点击功能标签，并展开综合能力判断、用户好评和风险问题
- 使用 DeepSeek 将目标客户群体拆成行业、细分行业、组织类型、部门、岗位、场景、痛点、购买动机和证据来源
- 保存来源链接、采集时间和失败原因
- 采集阶段与 AI 分析阶段分离；如果存在失败来源，任务会暂停等待用户选择“采集缺失内容”或“继续 AI 分析”
- 同名任务复用时会同步用户新填写的官网、App Store、Google Play 和关键词，避免旧任务继续使用空地址
- 历史任务页支持按来源定向重新采集，也支持删除任务及其对应报告和采集数据
- 报告概览展示采集来源、定价方案、应用商店评价样本、推广素材、YouTube 视频/评论、TikTok 视频/评论、Reddit 帖子/评论和 AI 分析模型
- 在线查看或下载 HTML 调研报告

## 环境要求

- Node.js 20 或更高版本
- npm 10 或更高版本
- 社媒采集子项目 `tools/social-agent` 推荐 Node.js 24 或更高版本；当前 Node 22 可完成类型检查和构建，但安装时会出现引擎版本警告
- Python 3.10 或更高版本，或可运行该库本体的 Python 3.9 环境，仅 Google 广告来源需要
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

如果 `prisma/dev.db` 不存在，使用当前 Schema 初始化它：

```bash
npx prisma db push
npx prisma generate
```

随后正常启动项目即可。开发过程中若调整 Prisma Schema，先重新生成客户端：

```bash
npx prisma generate
```

## 使用流程

1. 打开首页，填写 App 名称，推荐同时填写官网 URL、App Store URL 和 Google Play URL，避免同名应用自动匹配错误。
2. 创建任务后会自动开始采集，可进入任务详情查看实时状态和每个来源的结果。
3. 系统会先完成全部采集，再检查失败来源。
4. 如果没有失败来源，任务会自动进入 DeepSeek 分析并生成报告。
5. 如果存在失败来源，任务会暂停在“采集完成，等待确认”状态。此时可以选择“采集缺失内容”，或直接选择“继续 AI 分析”。
6. 报告中的定价表分别展示月付价格与年付价格，均保留官网的原始币种和计价单位。
7. 某个公开来源不可访问或无评论时，报告会保留真实失败说明，不会用推测内容补齐。

## 历史任务管理

历史任务页按应用分组展示任务。每条任务支持：

- `查看`：进入任务详情页，查看采集进度、成功来源、失败来源和跳过来源。
- `报告`：打开已生成的 HTML 调研报告。
- `重新采集`：弹出来源选择，可单独重新采集苹果商城、谷歌应用商城、谷歌广告、Meta 广告、TikTok、YouTube 或 Reddit。
- `删除`：删除该任务，同时删除对应报告、采集数据、用户评价、广告素材、社区内容、定价数据和 AI 分析结果。

删除前页面会二次确认。删除后不会影响其他任务。

## 报告概览

报告顶部会汇总本次调研覆盖范围，包括：

- 采集来源成功数 / 总数
- 定价方案数量
- 应用商店评价样本数量
- 推广素材数量
- YouTube 视频数 / 评论数
- TikTok 视频数 / 评论数
- Reddit 帖子数 / 评论数
- AI 分析模型

如果 YouTube、TikTok 或 Reddit 没有采集到内容，对应卡片会显示 `0/0`，报告仍会保留其他来源结果。

### 采集失败后的处理

任务进入“采集完成，等待确认”时，不会立即消耗 DeepSeek API，也不会生成报告。你可以根据失败项决定下一步：

- `采集缺失内容`：只重新采集失败来源，成功后自动继续；如果仍有失败，会再次暂停等待选择。
- `继续 AI 分析`：忽略失败来源，直接用已经采集到的数据进行 DeepSeek 分析和报告生成。

如果你在首页重新提交同名 App，并补充了新的官网、App Store 或 Google Play 地址，系统会更新等待中的旧任务字段。之后点击“采集缺失内容”会使用新地址，而不是继续用旧的空地址或错误搜索结果。

## 应用商店评论采集

App Store 应用搜索、详情、评分分布和最近评论统一通过 GitHub 依赖 `app-store-scraper` 处理：

```json
"app-store-scraper": "git+ssh://git@github.com/Ryrierbt/app-store-scraper.git"
```

该独立包内部合并了 `@perttu/app-store-scraper` 的搜索/详情/评分能力，以及 Apple Customer Reviews RSS 的评论抓取逻辑。如果首页填写了 App Store 链接，系统会优先提取链接中的 `id`，避免只靠应用名搜索选错结果。

最近评论使用 Apple 公开 Customer Reviews RSS 链路，并显式携带浏览器请求头。当前项目默认只抓取美国区评论：

```env
APP_STORE_REVIEW_COUNTRIES="us"
```

如果需要恢复多区域，可手动把 `.env` 改成逗号分隔的国家代码。当前默认兜底也是 `us`，不会在未配置时自动尝试其他国家。

默认读取最近评论最多 3 页，请求最多 200 条最新评论，并从中筛选 60 条信息量更高的评价写入报告。页数可在 `.env` 中配置，最大 3 页：

```env
APP_STORE_REVIEW_PAGES="3"
```

如果 Apple RSS 与开源库在当前网络下都返回空，也可以配置一个兼容 `{search}` / `{country}` / `{id}` 参数的评论代理作为最后兜底。默认不配置，系统不会访问第三方代理：

```env
APP_STORE_REVIEW_PROXY_URL=""
# 示例：
# APP_STORE_REVIEW_PROXY_URL="https://apppan.pangjiong.com/api/reviews?search={search}&country={country}"
```

Google Play 评论通过 `google-play-scraper` 抓取美国区最新评价。每个平台都最多抓取 200 条最新评论，并以相同的高质量规则筛选最多 60 条写入报告；两端都成功时，DeepSeek 会同时分析最多 120 条评论。Google Play 摘要会保存商店简介、完整描述、最近更新、分类、评分和评分数量，用于后续功能分析。可在 `.env` 中调整 Google Play 地区与语言：

```env
GOOGLE_PLAY_COUNTRY="us"
GOOGLE_PLAY_LANGUAGE="en"
```

Apple App Store 或 Google Play 任一评论端失败时，任务会先暂停等待确认。你可以重试缺失评论来源，也可以继续分析；继续分析时报告仍会保留另一端的评论与分析，并显示失败原因。

Google Play 自动搜索可能遇到同名应用或仿冒应用。为避免误采，建议填写明确的 Google Play URL。若目标应用没有官方 Google Play 应用，或该应用评分分布为 0、评论接口返回空，系统会记录为评论来源失败，不会用相似应用评论硬凑。

## App Store 版本历史

项目会尝试采集 App Store 版本历史，并写入 `APP_STORE_VERSION_HISTORY` 来源和同名分析结果。采集顺序为：

1. 优先调用 `@perttu/app-store-scraper` 的 `versionHistory()`。
2. 如果返回空，再解析 `apps.apple.com/{country}/app/id...` 页面中的 `script#serialized-server-data`。
3. 如果完整历史仍不可用，至少保留当前版本，并在结果中标记 `fullHistory: false`。

需要注意：Apple 商品页存在地区跳转和访问限制。`itunes.apple.com/lookup` 通常能稳定返回当前版本、发布日期和更新说明，但它不提供完整历史版本；完整历史依赖对应国家的 `apps.apple.com` 商品页可访问。

## 社区热议

社区热议现在由内置子项目 `tools/social-agent` 统一负责。它会先读取官网上下文，再用 DeepSeek 生成 YouTube、Reddit、TikTok 各自的搜索计划，搜索意图覆盖品牌评价、替代品推荐和竞品对比，不只搜索 App 品牌名。

首次运行前，需要安装子项目依赖：

```bash
cd "/Users/sibu/Documents/竞研工具/tools/social-agent"
npm install
npm run build
```

YouTube 采集会使用子项目内的 Python 脚本和 `youtube-comment-downloader`。首次运行 YouTube 前安装 Python 依赖到子项目本地目录：

```bash
cd "/Users/sibu/Documents/竞研工具/tools/social-agent"
python3 -m pip install --target .python-packages -r requirements-youtube.txt
```

社媒采集 agent 会复用本项目保存的 DeepSeek API Key。YouTube 通常不需要登录；Reddit 和 TikTok 会优先读取公开页面。首页的“社媒专属浏览器”按钮会在 macOS 上调用 `tools/social-agent/scripts/open-browser.sh`，打开独立 Chrome profile，并预打开 YouTube、Reddit、TikTok。后续社媒采集默认连接 `127.0.0.1:9333` 复用这个浏览器。

也可以手动启动带 CDP 端口的浏览器：

```bash
open -na "Google Chrome" --args \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9333 \
  --user-data-dir="/Users/sibu/.social-agent-chrome" \
  "https://www.youtube.com/" \
  "https://www.reddit.com/" \
  "https://www.tiktok.com/"
```

默认无需额外配置。若需要修改端口，可在 `.env` 中设置：

```env
SOCIAL_AGENT_BROWSER_MODE="existing"
SOCIAL_AGENT_CDP_ENDPOINT="9333"
```

如果要临时关闭专属浏览器复用，可设置：

```env
SOCIAL_AGENT_BROWSER_MODE="isolated"
```

可在 `.env` 中调整每个搜索词组保存的内容数量和每条内容精选评论数量；受子项目校验限制，当前最大分别为 5 和 10：

```env
SOCIAL_AGENT_COUNTRY="US"
SOCIAL_AGENT_LANGUAGE="en"
SOCIAL_AGENT_MAX_ITEMS_PER_PLATFORM="5"
SOCIAL_AGENT_MAX_COMMENTS_PER_ITEM="10"
SOCIAL_AGENT_TIMEOUT_MS="1800000"
```

采集结果会写入 `tools/social-agent/data/runs/<runId>/`，本项目会读取其中的 `item.json`、`comments.json` 和 `run-summary.json`，转换并保存为报告里的社区内容。DeepSeek 会将 YouTube / Reddit / TikTok 社区内容归纳为跨平台热点 Top 5、寻找替代品原因、竞品推荐流向、测评/社区主张与评论真实反馈差距、产品机会；结论必须绑定具体帖子、视频或评论证据，不会为了凑数量输出结果。

## DeepSeek 评价总结

在首页的 `DeepSeek API` 区域输入并保存 API Key。密钥仅保存在本地 SQLite 数据库中，页面和报告不会显示或返回其内容。

配置完成后，系统会在全部采集完成且没有失败来源，或用户点击“继续 AI 分析”后，统一执行 DeepSeek 分析。报告页的“更新 AI 总结”只处理已有数据，不会重新采集。未配置 Key、没有可用评论或模型请求失败时，任务仍会保留原始采集内容和失败原因。

功能分析会综合官网、App Store、Google Play、用户评价、广告/推广素材、社区讨论和视频字幕。DeepSeek 会生成最多 8 个功能标签；报告中的每个标签可点击展开，查看更完整的综合能力判断、证据来源、用户评价中的正向反馈和负向问题。能力描述要求完整列出材料中明确出现的语言、平台、集成、文件类型、导入导出方式和协作动作，不再用“等”“多种语言”“多个平台”省略已知枚举。未配置 DeepSeek 或请求失败时，报告会回退展示原始功能关键词。

目标客户画像会在官网、定价、App Store、用户评价和广告/推广素材采集后运行。DeepSeek 会输出核心客户、高价值客户、次级客户和潜在客户，按行业、细分行业、组织类型、部门、岗位、使用场景、核心痛点、购买动机、付费价值、证据来源和置信度进行结构化展示。证据不足的客户群体会标记为“推断”，并降低置信度；未配置 DeepSeek 或请求失败时，报告会回退展示原始目标用户字段。

## Meta 广告来源

任务会通过本地 Playwright 浏览器打开 Facebook Ads Library 公共页面，按 App 名称进行关键词全站搜索，只采集正在投放中的 Facebook/Instagram 广告。默认投放国家为 `US`，可用环境变量 `FACEBOOK_ADS_SCRAPER_COUNTRY` 修改。采集后会按广告 `page_name` 和官网主域名过滤噪声，只把更像目标 App 相关的素材写入报告。如果当前网络或会话被 Facebook 返回验证挑战，来源会记录失败原因，不再回退到普通 HTTP 请求头模式。

默认先抓取最多 `30` 条原始广告，再过滤并写入最多 `20` 条目标 App 相关广告；如果过滤后不足 20 条，不会用噪声广告硬凑。过滤完成后，系统只会对保留下来的广告打开详情页补充正文，避免对大量无关广告逐条补详情导致采集过慢。

实现适配 [domini-67/facebook-ads-library-scraper](https://github.com/domini-67/facebook-ads-library-scraper.git) 的标准化输出结构，入口脚本为 `scripts/facebook_ads_library_scraper.py`。如果你本机浏览器已经通过 Facebook 验证，可以通过 `FACEBOOK_ADS_BROWSER_PROFILE` 复用该浏览器 profile。

可选环境变量：

```bash
FACEBOOK_ADS_SCRAPER_PYTHON="python3"
FACEBOOK_ADS_SCRAPER_COUNTRY="US"
FACEBOOK_ADS_RAW_LIMIT="30"
FACEBOOK_ADS_SCRAPER_LIMIT="20"
FACEBOOK_ADS_SCROLL_ROUNDS="30"
FACEBOOK_ADS_BROWSER_PROFILE=""
FACEBOOK_ADS_BROWSER_HEADFUL=""
```

## Google 广告来源

Google 广告来源使用 GitHub 项目 [block-town/google-ads-transparency-mcp](https://github.com/block-town/google-ads-transparency-mcp.git)，查询 Google Ads Transparency Center 公开广告素材，不需要 API Key。

该依赖官方声明要求 Python 3.10 或更高版本。安装到项目本地目录：

```bash
python3.10 -m pip install --target .python-packages -r requirements-google-ads.txt
```

如果当前机器只有 macOS 自带的 Python 3.9，可以只安装库本体和 `requests`，本项目会直接调用库接口，不启动 MCP 服务端：

```bash
python3 -m pip install --target .python-packages "requests>=2.31.0"
python3 -m pip install --target .python-packages --no-deps --ignore-requires-python git+https://github.com/block-town/google-ads-transparency-mcp.git
```

如果你的 Python 命令不是 `python3`，在 `.env` 中改成实际路径：

```env
GOOGLE_ADS_TRANSPARENCY_PYTHON="python3.10"
GOOGLE_ADS_TRANSPARENCY_REGION="anywhere"
GOOGLE_ADS_TRANSPARENCY_LIMIT="20"
```

当前 Google 广告来源默认只保存图片形式广告，最多 `20` 条。桥接脚本会多读取一批 creative 后筛选图片素材；如果该广告主近期图片广告不足 20 条，报告会展示实际抓到的数量。如果 Google 广告依赖未安装、网络不可达或 Google Transparency Center 请求失败，该来源会记录为失败；其他采集来源不受影响。

图片广告会下载到 `public/ad-assets/<任务 ID>/`，该目录已加入 `.gitignore`。如需对图片广告做 OCR，请安装 EasyOCR：

```bash
python3 -m pip install --target .python-packages -r requirements-easyocr.txt
```

OCR 使用 GitHub 项目 [JaidedAI/EasyOCR](https://github.com/JaidedAI/EasyOCR.git)。安装包会包含 PyTorch 等依赖。为避免采集任务被模型下载卡住，运行任务时不会自动下载 OCR 模型；如果模型未准备好，任务仍会保存图片广告，并在 `Google 图片广告 OCR` 来源中显示待配置原因。若已配置 DeepSeek API Key，系统会基于 OCR 文字综合判断广告面向人群、推广方向、使用场景和核心卖点。

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
- Google Play 自动搜索可能选中同名但非目标产品的应用。建议填写 Google Play URL；没有官方 Android 应用时应将 Google Play 评论视为缺失来源。
- DeepSeek 总结需要用户先在首页配置有效 API Key。

## 项目结构

```text
app/                    页面与 API 路由
components/             任务表单、状态与进度组件
lib/research/           采集器、分析和报告生成器
prisma/                 SQLite Schema 与迁移
agent.md                后续开发交接与环境排查记录
```
