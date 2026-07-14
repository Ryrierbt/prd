# Agent 交接说明：海外 App 竞品调研工具

本文记录本次搭建过程中遇到的通用问题、判断方式和处理方案，供后续 Agent 继续开发时参考。

## 项目现状

- 工作目录：`/Users/sibu/Documents/竞研工具`
- 技术栈：Next.js、TypeScript、Tailwind CSS、Prisma、SQLite
- 当前已完成：基础项目、任务创建、任务进度、历史任务、报告页、HTML 下载、基础 worker 骨架
- 当前未完成：真实网页采集、价格解析、评论采集、推广内容分析、完整报告生成
- 本地开发地址：`http://127.0.0.1:3000`

## 已知环境问题

### 1. `npm init -y` 会失败

原因：目录名是中文 `竞研工具`，npm 会尝试用目录名作为 package name，导致：

```text
npm error Invalid name: "竞研工具"
```

处理方式：

- 不要依赖 `npm init -y`
- 直接手写合法的 `package.json`
- 当前包名已设为 `overseas-app-research-tool`

### 2. 沙箱内 `npm install` 可能无法访问 registry

第一次安装失败原因：

```text
getaddrinfo ENOTFOUND registry.npmjs.org
```

处理方式：

- 先在沙箱里跑一次，若出现 DNS/network 错误，按规则使用 `sandbox_permissions: "require_escalated"` 重跑
- npm cache 不要放默认用户目录，建议使用项目内缓存：

```bash
npm install --cache ./.npm-cache
```

### 3. npm 日志写用户目录会被权限挡住

现象：

```text
Log files were not written due to an error writing to the directory: /Users/sibu/.npm/_logs
```

处理方式：

- 同样使用项目内 cache：

```bash
npm install --cache ./.npm-cache
```

### 4. npm 下载大包时不要把 timeout 设太短

本次曾因 `--fetch-timeout=15000` 太短导致：

```text
Error: Idle timeout reached for host `registry.npmjs.org:443`
```

处理方式：

```bash
npm install --cache ./.npm-cache --fetch-timeout=120000 --fetch-retry-maxtimeout=120000
```

### 5. 普通 `npm install` 长时间无输出不一定卡死

普通模式下 npm 可能很久没有输出。排查方式：

- 检查 `node_modules` 是否出现
- 检查 `.npm-cache` 是否增长
- 必要时用 `--loglevel=verbose` 定位卡在哪个包

示例：

```bash
npm install --cache ./.npm-cache --loglevel=verbose
```

## Prisma 相关问题

### 1. `npx prisma generate` 可能需要非沙箱执行

沙箱中曾失败：

```text
EPERM: operation not permitted, utime '/Users/sibu/.cache/prisma/.../libquery-engine'
```

原因：Prisma 会触碰用户级 engine cache。

处理方式：

```bash
npx prisma generate
```

如果沙箱失败，使用 `require_escalated` 重跑。

### 2. `prisma migrate dev` 和 `prisma db push` 可能报空的 Schema engine error

本次现象：

```text
Error: Schema engine error:
```

已确认：

- `npx prisma validate` 成功
- `schema-engine --version` 成功
- `prisma migrate diff` 可正常生成 SQL
- 换到英文临时路径仍失败，所以不是中文路径导致

临时处理方案：

1. 用 Prisma 生成 SQL：

```bash
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
```

2. 将 SQL 保存为：

```text
prisma/migrations/20260714000000_init/migration.sql
```

3. 用系统 SQLite 初始化数据库：

```bash
sqlite3 prisma/dev.db ".read prisma/migrations/20260714000000_init/migration.sql"
```

4. 检查表：

```bash
sqlite3 prisma/dev.db ".tables"
```

当前数据库已经初始化成功，表包括：

```text
ResearchTask
Source
AppProfile
PricingPlan
Review
PromotionItem
AnalysisResult
Report
```

## Next.js 开发服务器问题

### 1. 沙箱内启动 dev server 会被端口监听拦住

现象：

```text
listen EPERM: operation not permitted 0.0.0.0:3000
```

处理方式：

使用非沙箱授权启动，并绑定到本机地址：

```bash
npm run dev -- -H 127.0.0.1 -p 3000
```

### 2. 本地 API curl 也可能需要非沙箱

沙箱内访问 `127.0.0.1:3000` 可能返回：

```text
curl: exit code 7
```

处理方式：

使用 `require_escalated` 跑本地 curl。

示例：

```bash
curl -s -X POST http://127.0.0.1:3000/api/tasks \
  -H 'Content-Type: application/json' \
  -d '{"appName":"Otter","websiteUrl":"https://otter.ai/","keywords":"AI meeting notes"}'
```

## 当前验证结果

已通过：

```bash
npm run typecheck
npm run build
```

已做过冒烟测试：

- 创建 Otter 任务成功
- 任务状态推进到 `PARTIAL_COMPLETED`
- 来源记录保存成功
- 报告下载接口返回 `200`

查询最近任务：

```bash
sqlite3 prisma/dev.db "select appName,status,progress,currentStep from ResearchTask order by createdAt desc limit 3;"
```

当前结果示例：

```text
Otter|PARTIAL_COMPLETED|100|部分完成
```

## 继续开发建议

下一阶段优先顺序：

1. 实现通用 fetcher：超时、重试、User-Agent、错误记录
2. 实现 HTML 清洗和正文抽取
3. 接入 Otter 官网首页采集
4. 接入 Otter 定价页采集
5. 接入至少一个评价来源
6. 接入推广内容来源
7. 用规则分析生成真实报告章节
8. 替换当前 `runner.ts` 中的占位报告

## 真实性要求

后续开发必须继续遵守：

- 不伪造价格
- 不伪造用户评价
- 不伪造来源
- 采不到就显示“暂未获取”
- 报告中区分“原始信息”和“系统分析”
- 每个关键结论尽量关联来源链接

## 常用命令

```bash
npm install --cache ./.npm-cache --fetch-timeout=120000 --fetch-retry-maxtimeout=120000
npx prisma generate
npm run typecheck
npm run build
npm run dev -- -H 127.0.0.1 -p 3000
sqlite3 prisma/dev.db ".tables"
```

