# DeepSeek 海外竞品公开数据采集 Agent

这是一个纯 Node.js/TypeScript 采集项目：使用 Playwright确定性访问公开页面，使用 DeepSeek完成官网上下文、搜索词和详情价值复核，将官网证据、搜索候选、评分结果、详情、精选评论、截图和运行日志保存到本地。项目不包含前端、报告或产品分析页面。

## 安装

要求 Node.js 24+ 和可用的 DeepSeek API Key。Playwright已作为项目依赖安装。

```bash
npm install
npx playwright install chromium
```

YouTube 采集现在完全使用 `prd` 风格的 Python 方式：`requests` 搜索公开视频，`youtube-comment-downloader` 抓公开视频评论。首次运行 YouTube 前请安装 Python 依赖到项目本地目录：

```powershell
cd C:\Users\hi\Documents\paqu
python -m pip install -r requirements-youtube.txt -t .python-packages
```

如果你的 Python 命令不是 `python`，可以设置：

```powershell
$env:YOUTUBE_PYTHON_BIN="C:\Path\To\python.exe"
```

在当前终端设置环境变量：

```bash
DEEPSEEK_API_KEY=your_key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
```

Windows PowerShell 可使用 `$env:DEEPSEEK_API_KEY="your_key"`。

### 运行项目前：启动专用 Chrome

当输入配置使用 `browser.mode: "existing"` 和 `reuseOpenPages: true` 时，每次运行采集项目前先启动项目专属 Chrome：

```powershell
npm.cmd run browser:open
```

这个命令会使用持久化的专用 Chrome 用户目录，并同时打开 TikTok、X/Twitter、YouTube 和 Reddit。首次启动后，请在这个专用 Chrome 中手动完成所需平台的登录。以后继续使用同一个用户目录，登录状态才会保留。

如果需要手动启动，PowerShell 命令如下：

```powershell
$chromeExe = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$profileDir = "C:\Users\hi\AppData\Local\paqu-playwright-profile"

Start-Process -FilePath $chromeExe -ArgumentList @(
  "--remote-debugging-address=127.0.0.1",
  "--remote-debugging-port=9333",
  "--user-data-dir=$profileDir",
  "https://www.tiktok.com/en/",
  "https://x.com/",
  "https://www.youtube.com/",
  "https://www.reddit.com/"
)
```

手动命令会同时打开：

- TikTok：`https://www.tiktok.com/en/`
- X/Twitter：`https://x.com/`
- YouTube：`https://www.youtube.com/`
- Reddit：`https://www.reddit.com/`

首次启动后，请在这个专用 Chrome 中手动完成所需平台的登录。以后必须继续使用同一个 `$profileDir`，登录状态才会保留。不要同时启动两个使用同一用户目录的 Chrome 实例。

启动后访问 `http://127.0.0.1:9333/json/version`，确认响应中存在 `webSocketDebuggerUrl`，再运行采集命令。当前项目采集流程支持 YouTube、Reddit 和 TikTok；X/Twitter 页面会预先打开，但尚未加入采集平台列表。

### 复用当前已登录浏览器

示例输入默认启用已有浏览器模式：

```json
{
  "browser": {
    "mode": "existing",
    "connection": "cdp",
    "cdpEndpoint": 9333,
    "reuseOpenPages": true,
    "preserveExistingBrowser": true
  }
}
```

Playwright需要标准 CDP HTTP端点。请使用上面的 PowerShell命令启动专用 Chrome，并确认 `http://127.0.0.1:9333/json/version` 可访问：

```json
{
  "browser": {
    "mode": "existing",
    "connection": "cdp",
    "cdpEndpoint": 9333,
    "reuseOpenPages": true,
    "preserveExistingBrowser": true
  }
}
```

该模式通过 Playwright `connectOverCDP` 连接浏览器，会优先选择同域的现有标签页；没有匹配页面时创建临时标签页。采集器不会执行登录、导出 Cookie 或保存浏览器状态。结束时只关闭自己创建的标签页，不关闭现有标签页或浏览器。即使浏览器已登录，也只允许保存普通公开 URL 上的公开帖子、视频和评论。

如需完全隔离的无登录浏览器，将 `browser.mode` 设置为 `isolated`；这是 Node.js API 未提供浏览器配置时的默认值。

## 运行

```bash
npm run collect -- --input examples/otter.json
```

Node.js 调用：

```ts
import { collectionAgent } from "deepseek-competitor-collector";

const result = await collectionAgent.run({
  appName: "Otter.ai",
  officialWebsite: "https://otter.ai",
  country: "US",
  language: "en",
  platforms: ["youtube", "reddit", "tiktok"],
  maxItemsPerPlatform: 5,
  maxCommentsPerItem: 10,
  browser: {
    mode: "existing",
    connection: "cdp",
    cdpEndpoint: 9333,
    reuseOpenPages: true,
    preserveExistingBrowser: true
  }
});
```

结果写入 `data/runs/<runId>/`。每次运行包含输入、官网数据、搜索计划、候选及评分、平台详情与评论、截图、`actions.jsonl`、`errors.jsonl` 和 `run-summary.json`。JSON/JSONL 均为 UTF-8；JSON 使用临时文件写入后重命名，避免中断产生半截内容。

`website.json` 除 DeepSeek 提取的产品上下文外，还会保存采集器从官网公开页面直接提取的结构化证据：

- `officialPages`：先用 HTTP 读取首页、首页链接、关键路径和 fallback 路径，再用 Playwright 打开官网首页补充动态可见文本与截图；官网详情页最多 8 个。
- `pricingPlans`：从官网 `/pricing` 或相关价格页面解析出的付费计划、价格、币种、周期和功能片段。
- `officialPromotions`：官网首页、solutions、features、customers 等官方页面中的营销内容、卖点、目标用户和使用场景。

## 采集和安全边界

- 官网上下文只允许引用官网当次可见文本，缺失字段使用 `null`，不让模型补充外部事实。
- 官网详情页、价格计划和官网内推广内容按“两段式”确定性规则提取：HTTP 优先抓取公开 HTML，Playwright 再补首页动态文本和截图；这些字段写入 `website.json`，DeepSeek 不负责补充。
- 每个平台固定生成 5 个搜索词，至少覆盖测评体验、问题/价格/替代品、竞品比较三种搜索意图，并额外扩展替代品推荐、用户痛点、使用场景或细分人群讨论。
- 所有候选都会先按平台和外部 ID 去重，并计算相关性 40、时效 20、平台内热度 20、标题价值 15、来源可信度 5 的评分；YouTube/Reddit/TikTok 的详情打开顺序优先遵循搜索词分组和组内搜索页顺序，评分作为候选证据保存，不再设置低分阈值。
- YouTube 信息获取完全按 `git@github.com:Ryrierbt/prd.git` 的方式走固定 Python 脚本：`requests` 请求 YouTube 搜索页并用 `"videoId"` 正则抽候选，oEmbed 提取标题/频道，`youtube-comment-downloader` 提取公开视频热门评论；Playwright 主要用于打开公开视频页并保存截图。
- TikTok 搜索候选优先监听搜索页自己的公开网络响应，例如搜索接口返回的视频 JSON；如果没有捕获到可用响应，才退回读取搜索页可见 DOM 卡片。`actions.jsonl` 会记录 `source: "tiktok_search_response"` 或 `source: "tiktok_dom_fallback"`。
- Reddit 搜索候选也优先监听搜索页网络响应，例如 Reddit search/shreddit/GraphQL 返回的帖子 JSON；如果没有捕获到可用响应，才退回读取搜索页可见 DOM 帖子。`actions.jsonl` 会记录 `source: "reddit_search_response"` 或 `source: "reddit_dom_fallback"`。
- YouTube/Reddit/TikTok 候选按搜索词分组保存，组内保留搜索页可见顺序；后续按组轮流打开详情页，而不是全局按评分排序直接扫完一组。
- 所有平台打开详情页后，仍由 DeepSeek 判断是否实质讨论目标 App；只有 `shouldCollect: true` 才保存，不会用无关内容补齐。
- `maxItemsPerPlatform` 对 YouTube/Reddit/TikTok 都表示每个搜索词组的目标保存数量。例如 3 个 Reddit 搜索词且值为 5 时，Reddit 最多可保存 15 个帖子。
- 每个详情最多加载 50 条评论并精选 `maxCommentsPerItem` 条。候选不足或 DeepSeek 拒绝时允许少于目标数量。
- Playwright使用固定、可审计的定位器完成导航、等待、DOM字段提取、滚动和截图；不执行模型生成的脚本或任意 Shell。
- 每个详情最多滚动10次；连续3次评论数量无增长即停止；平台最长10分钟并使用独立页面会话。
- 仅访问 HTTP(S) 公开 URL 和任务允许的站点域名，不导入 Cookie、不执行登录、不保存浏览器认证状态，也不绕过验证码、付费墙或访问限制。已有登录态只能用于浏览普通公开页面。单个平台受限会记录 `partial`/`blocked`，不影响其他平台。
- 页面内容始终按不可信输入处理。DeepSeek不接触浏览器控制权；其结构化输出和最终写盘对象均经过 Zod 校验。

## 验证

```bash
npm run build
npm test
```

测试使用模拟 DeepSeek 和模拟浏览器，不需要 API Key，也不会访问外部网站。

## Reddit 采集器更新提示词

当 Reddit 采集健康检查失败时，可以把下面提示词交给 Agent，用于检查当前 Reddit 页面结构并完成采集器适配：

```text
Reddit 采集健康检查已失败。请检查当前 Reddit 页面结构，并直接完成采集器适配，不要根据旧选择器猜测新结构。

当前项目默认使用 Playwright DOM 采集：

生成搜索词
→ 打开 Reddit 搜索结果页
→ 提取帖子候选
→ 选择最多 5 个帖子
→ 打开帖子页面
→ 提取高价值评论

请按下面步骤完成更新。

一、先复现问题

使用固定测试词：

ChatGPT

打开：

https://www.reddit.com/search/?q=ChatGPT&sort=relevance

复用项目当前的持久化 Chrome Profile、Cookie、代理和登录状态。

记录：

最终页面 URL
页面标题
HTTP 或页面加载状态
页面是否出现登录、限流、验证、错误提示
a[href*="/comments/"] 数量
shreddit-post 数量
article 数量
faceplate-tracker 数量
当前原始候选数量

不要立即修改代码，先确认失败属于：

PAGE_BLOCKED
PAGE_LOGIN_REQUIRED
PAGE_LOAD_FAILED
DOM_STRUCTURE_CHANGED
SELECTOR_INCORRECT
VIRTUAL_LIST_NOT_LOADED

二、获取当前真实 DOM 架构

从当前搜索结果中选取前 3 个视觉上确认属于帖子的元素，输出其精简 DOM 结构。

不要保存整页 HTML，只保存每个帖子容器的：

标签名
class
role
data-* 属性
shadow DOM 情况
标题元素
帖子永久链接元素
subreddit 元素
分数元素
评论数元素
时间元素
最接近的稳定父容器

输出内容需要脱敏并限制长度，不能包含 Cookie、Authorization、用户私密信息或完整请求头。

可以在浏览器上下文中执行诊断脚本，查找所有包含 /comments/ 的链接，并打印每个链接向上最多 6 层父节点的精简结构。

示例诊断目标：

const diagnostics = await page.evaluate(() => {
  const links = Array.from(
    document.querySelectorAll('a[href*="/comments/"]')
  ).slice(0, 10);

  return links.map((link) => {
    const parents = [];
    let current = link;

    for (let depth = 0; current && depth < 6; depth += 1) {
      parents.push({
        tag: current.tagName?.toLowerCase(),
        id: current.id || null,
        className:
          typeof current.className === "string"
            ? current.className.slice(0, 200)
            : null,
        role: current.getAttribute?.("role"),
        testId: current.getAttribute?.("data-testid"),
        slot: current.getAttribute?.("slot")
      });

      current = current.parentElement;
    }

    return {
      href: link.getAttribute("href"),
      text: link.textContent?.trim().slice(0, 200),
      ariaLabel: link.getAttribute("aria-label"),
      parents
    };
  });
});

如果元素位于 shadow DOM 中，需要明确记录 shadow host，并改用 Playwright Locator 穿透开放 shadow DOM，而不是继续使用普通 document.querySelectorAll。

三、识别新的稳定信号

优先使用以下稳定性顺序：

1. 帖子永久链接 URL 结构
2. role、aria-label、slot 等语义属性
3. data-testid 或稳定 data-* 属性
4. 自定义组件标签
5. class 名
6. 深层 CSS 路径

不要把随机生成的 class、CSS Module 哈希或位置选择器作为主方案，例如：

div:nth-child(3) > div > a
._1abc234

如果 /comments/ 链接仍存在，应继续以帖子永久链接作为主识别信号，只调整标题、分数、评论数和时间的读取方式。

如果 /comments/ 不再直接出现在 href 中，请检查：

页面是否使用重定向链接
data-href
data-url
click handler 中的地址
shadow DOM
页面初始化 JSON
当前元素是否使用相对 URL 或新的帖子路径

四、更新为多提取器架构

不要只替换一个旧选择器。请把 Reddit 搜索结果提取器拆成多个独立策略：

extractByCommentPermalinks
extractBySemanticAttributes
extractByCurrentRedditComponent
extractByEmbeddedPageData

每个提取器返回统一结构：

type RedditPostCandidate = {
  id: string;
  title: string;
  subreddit?: string;
  permalink: string;
  score?: number;
  commentCount?: number;
  publishedAt?: string;
  sourceExtractor: string;
};

合并后按照帖子 ID 或标准化 permalink 去重。

主提取器失败时，自动尝试其他提取器。不能因为一个组件标签消失就让候选数量变成 0。

五、评论页面也需要检查

打开一个搜索结果帖子，检查当前评论结构。

记录：

评论容器标签
评论正文位置
作者位置
分数位置
发布时间位置
顶层评论和回复的区分方式
展开更多评论的按钮
是否存在 shadow DOM
是否采用虚拟列表

评论提取器也需要使用多种信号，不要只依赖：

shreddit-comment

评论统一输出：

type RedditComment = {
  id: string;
  text: string;
  author?: string;
  score?: number;
  publishedAt?: string;
  parentId?: string;
  depth?: number;
};

每个帖子最多读取 30 条候选评论，再筛选最多 10 条高价值评论。
```
