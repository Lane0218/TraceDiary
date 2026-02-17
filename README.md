# TraceDiary

TraceDiary 是一个隐私优先的 Web 日记应用，采用“前端加密 + Gitee 私有仓库同步”架构。应用可在浏览器直接使用，支持跨设备访问，并通过主密码与入口门禁实现双层保护。

## 核心能力

- 前端 AES-256-GCM 加密，明文不上传远端
- Markdown 日记与年度总结编辑
- 手动 Push/Pull 同步到 Gitee 私有仓库
- 往年今日回顾与日历导航
- PWA 安装支持（移动端可用）

## 本地开发

### 环境要求

- Node.js 20+
- npm 10+

### 快速启动

```bash
npm install
npm run dev
```

默认开发地址：`http://localhost:5173`

### 常用命令

```bash
npm run build
npm run preview
npm run lint
npm run test:unit
npm run test:integration
npm run test:e2e:fast
```

## 部署与访问控制

### 1. 部署基线（Vercel）

1. 将仓库连接到 Vercel。
2. 构建命令设置为 `npm run build`。
3. 输出目录设置为 `dist`。
4. 配置生产环境变量（如 `VITE_GITEE_API_BASE`）。
5. 绑定自定义域名并确认 HTTPS 生效。

### 2. 入口访问控制（三选一）

生产环境必须启用以下三种方案之一，防止应用首页对公网匿名开放。

#### 方案 A：Cloudflare Access（推荐）

适用：已有 Cloudflare DNS/代理，想要邮箱或身份策略控制访问。

落地步骤：

1. 将业务域名接入 Cloudflare，代理到 Vercel。
2. 在 Cloudflare Zero Trust 创建 `Self-hosted` 应用，域名指向 TraceDiary。
3. 添加 `Allow` 策略（仅允许你自己的邮箱/身份组）。
4. 默认拒绝其他访问，保存并发布策略。

验收：

- 未登录/未授权身份访问域名，必须被网关拦截，HTTP 状态码为 `401` 或 `403`。
- 已授权身份登录后可访问页面（HTTP `200`）。

#### 方案 B：Vercel 访问保护

适用：不引入额外网关，直接使用 Vercel 项目级访问保护。

落地步骤：

1. 打开 Vercel 项目 `Settings -> Deployment Protection`。
2. 为 `Production` 启用访问保护（账号登录或密码保护模式任选其一）。
3. 配置允许访问的账号/密码。
4. 重新部署并确认保护对生产域名生效。

验收：

- 未授权访问生产域名返回 `401` 或 `403`。
- 授权后可正常打开应用首页（HTTP `200`）。

#### 方案 C：Basic Auth（网关层）

适用：已有反向代理（Nginx/Caddy/Cloudflare Worker），希望使用标准用户名密码门禁。

落地步骤：

1. 在网关配置 Basic Auth，并将凭证保存到密钥系统或环境变量（禁止写入仓库）。
2. 对未携带 `Authorization` 的请求返回 `401`，并附带 `WWW-Authenticate` 响应头。
3. 对错误凭证返回 `401` 或 `403`。
4. 仅在鉴权通过后转发到 Vercel 源站。

验收：

- 无凭证访问返回 `401/403`。
- 错误凭证访问返回 `401/403`。
- 正确凭证访问返回 `200`。

### 3. 统一验收命令（未授权 401/403）

将 `<你的域名>` 替换为生产域名，在无登录态或无凭证条件下执行：

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://<你的域名>/
```

验收通过条件：输出为 `401` 或 `403`。若输出为 `200`，说明入口门禁未生效。

## 参考文档

- 详细产品与技术约束：`SPEC.md`
