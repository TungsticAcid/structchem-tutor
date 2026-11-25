# 后台用户数据统计

给课程维护者看的匿名使用统计：用户数、活跃/新增、会话、页面与模块使用、
智能体轮次、工具调用、练习提交与正确率、留存与趋势。

它是**可选组件**：不启动统计服务时，前端会静默关闭埋点，仍然是一个纯静态站点。

---

## 1. 它采集什么，不采集什么

| 采集 | 不采集 |
|---|---|
| 随机访客 ID / 会话 ID | 姓名、学号、邮箱、IP |
| 路由（如 `/viewer/naCl`） | 查询串、Referer、User-Agent 原文 |
| 智能体轮次、耗时、工具名与次数 | 提问正文、回答正文、思考内容 |
| 练习开始/提交、题型、对错 | 题干、选项、学生写的答案 |
| 设备粗分类（桌面/平板/手机）、界面语言 | API Key、模型服务配置 |

- ID 是浏览器随机生成的 UUID；「清除本机数据」会删掉访客 ID，此后无法与历史关联。
- 服务端不保存 IP；登录限流只在内存里按 socket 地址计数。
- 设置里提供「隐私 → 匿名使用统计」开关；Do Not Track / GPC 也会强制关闭。
- 数据落在 SQLite 单文件，默认保留两年，可在 `server/index.mjs` 的 `prune(730)` 调整。

---

## 2. 本地启动

要求 **Node.js >= 22.13**（使用内置 `node:sqlite`，不需要编译原生模块）。

```bash
# 仓库根目录
cp .env.example .env        # Windows: copy .env.example .env
# 编辑 .env，至少改 ANALYTICS_ADMIN_PASSWORD
npm run analytics
```

打开：

- 后台看板：<http://127.0.0.1:8787/admin>
- 健康检查：<http://127.0.0.1:8787/api/analytics/health>
- 若 `ANALYTICS_STATIC_DIR=apps/web/dist`，站点也在 <http://127.0.0.1:8787/> 一起托管。

开发时前端在 `http://localhost:3001`，与统计服务不同源。两种做法：

1. **推荐**：只在 8787 上访问构建后的站点（`npm run analytics` 前先 `node tools/build-web.mjs`）。
2. 仓库的 `apps/web/vite.config.js` 已把 `/api` 与 `/admin` 代理到 `127.0.0.1:8787`；
   先启动统计服务，再 `cd apps/web && npm run dev` 即可。

> 前端只在同源健康检查成功后才开始上报；纯静态部署不会每页刷 404。

---

## 3. 生产部署（Nginx 继续托管静态站点）

目录约定：

```text
/usr/share/nginx/chem-agent      ← apps/web/dist
/opt/chem-agent/server           ← 本仓库的 server/（只拷这个目录即可）
/var/lib/chem-agent/analytics    ← SQLite 数据目录
```

### 3.1 systemd

`/etc/systemd/system/chem-agent-analytics.service`：

```ini
[Unit]
Description=chem-agent analytics
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/chem-agent
Environment=NODE_ENV=production
Environment=ANALYTICS_ADMIN_USER=admin
Environment=ANALYTICS_ADMIN_PASSWORD=换成足够长的口令
Environment=ANALYTICS_SESSION_SECRET=换成一个随机串
Environment=ANALYTICS_ALLOWED_ORIGINS=https://structchem.xn--tqqw77c.top
Environment=ANALYTICS_DATA_DIR=/var/lib/chem-agent/analytics
Environment=ANALYTICS_STATIC_DIR=/usr/share/nginx/chem-agent
Environment=HOST=127.0.0.1
Environment=PORT=8787
ExecStart=/usr/bin/node server/index.mjs
Restart=on-failure
User=chemagent
Group=chemagent

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now chem-agent-analytics
```

### 3.2 Nginx 反代

在原有站点配置里加（**保留原有静态 `root`**）：

```nginx
# 埋点与后台 API
location /api/ {
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 30s;
}

# 后台看板（HTML/CSS/JS 都由统计服务出）
location /admin {
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

`X-Forwarded-Proto` 是必须的：管理员 Cookie 在 HTTPS 下会加 `Secure`。
静态站点仍由原来的 `root` 直接出，不走 Node。

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 3.3 不要直接暴露 8787

服务默认监听 `127.0.0.1`。若改成 `0.0.0.0`，请确保防火墙只允许 80/443，
并确认没有人能绕过 HTTPS 直接访问后台登录接口。

---

## 4. 两个站点（学校 Nginx + Vercel）共用一份统计

本项目当前的两个站点：

```text
学校站点   http://structchem.sdu.edu.cn/        （Nginx，HTTP）
Vercel 站点 https://structchem.xn--tqqw77c.top/  （HTTPS）
```

推荐拓扑：**学校 Nginx 托管一份前端，Vercel 托管同一份前端，两者都上报到学校服务器上的
同一个统计服务**。后台只部署在学校服务器，数据只有一份。

```
学校站点  ──同源 /api──────────────────────────┐
                                               ├── 统计服务（学校服务器 :8787）
Vercel 站点 ──HTTPS 同源 /api → Vercel 反向代理──┘
                              （服务端转 HTTP）
```

### 4.1 统计服务允许 Vercel 来源

```bash
# 学校服务器 .env
ANALYTICS_ALLOWED_ORIGINS=https://structchem.xn--tqqw77c.top
```

支持多个来源，逗号分隔；**只写源，不写路径**。

### 4.2 Vercel 通过 rewrite 反向代理（仓库已配置）

Vercel 站点是 HTTPS，而学校统计服务目前是 HTTP。浏览器**不能**直接从 HTTPS 页面请求
HTTP API（混合内容会被浏览器拦截），所以不要让 Vercel 前端跨协议直连。

仓库根目录的 `vercel.json` 已加入：

```json
"rewrites": [
  {
    "source": "/api/analytics/:path*",
    "destination": "http://structchem.sdu.edu.cn/api/analytics/:path*"
  }
]
```

这样 Vercel 站点的浏览器只请求自己的 HTTPS 同源路径，Vercel 在**服务端**转发到学校
HTTP 接口，浏览器不会看到混合内容。前端不需要额外配置 `VITE_ANALYTICS_ENDPOINT`。

> 如果学校服务器以后配好 HTTPS，建议把 destination 改成 `https://structchem.sdu.edu.cn/...`，
> 或改回 Vercel 环境变量直连学校 HTTPS 地址（见 4.4）。

### 4.3 学校 Nginx 只需反代 `/api` 与 `/admin`

与第 3 节相同。Vercel 站点**不需要**部署 `server/`，也不需要在 Vercel 上创建数据库。

### 4.4 前提：学校统计地址必须对 Vercel 用户可达

Vercel 的反向代理是从 Vercel 的服务器发起的，所以 `structchem.sdu.edu.cn` 必须能被公网
访问（至少能被 Vercel 访问）。如果学校服务器只允许校园网访问，Vercel 学生就发不出埋点。
此时把统计服务放到一台公网可达的 VPS，两个站点都指向它。

### 4.5 后台登录不要走公网 HTTP

`http://structchem.sdu.edu.cn/admin` 的口令是明文传输的，不要这样登录。两种安全做法：

1. 给学校站点配 HTTPS 后访问 `https://.../admin`（推荐）；
2. 暂时用 SSH 隧道，只在本机打开后台：
   ```bash
   ssh -L 8787:127.0.0.1:8787 用户名@structchem.sdu.edu.cn
   # 然后本机访问 http://127.0.0.1:8787/admin
   ```

---

## 5. 账号与安全

- 后台只有一个维护者账号，**没有学生账号系统**；学生端仍然是匿名的。
- 口令只从 `ANALYTICS_ADMIN_PASSWORD` 读取，不写仓库、不回显。
- 登录失败 10 分钟内最多 8 次（按进程内存限速）；成功登录后清零。
- 会话 Cookie：`HttpOnly`、`SameSite=Strict`，HTTPS 下自动加 `Secure`；默认 12 小时过期。
- 后台 POST 只接受同源 `Origin`；埋点 POST 只接受同源或 `ANALYTICS_ALLOWED_ORIGINS`
  中的来源。后台页面带 CSP、禁止被 iframe 嵌入。
- 建议把 `ANALYTICS_SESSION_SECRET` 固定为随机串，否则服务重启后需重新登录：
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

---

## 6. 数据与备份

- 数据库：`$ANALYTICS_DATA_DIR/analytics.sqlite`（WAL 模式，另有 `-wal`/`-shm`）。
- 备份（SQLite 在线安全备份）：
  ```bash
  sqlite3 /var/lib/chem-agent/analytics/analytics.sqlite ".backup '/backup/analytics-$(date +%F).sqlite'"
  ```
  或停服务后直接复制三个文件。
- 汇总 CSV：后台右上角下载，只含按天/按模块的聚合，不含访客或会话 ID。

### 数据表

| 表 | 用途 |
|---|---|
| `visitors` | 首次/最近访问、会话数、设备与语言 |
| `sessions` | 一次页面会话的开始/最后事件、浏览与练习计数 |
| `events` | 白名单事件（`event_id` 唯一，天然幂等） |

事件类型：

```text
session_start   会话开始（语言、设备、入口路径）
page_view       页面浏览（路由、模块）
agent_turn      智能体一轮（成功/失败、耗时、工具数与工具名）
quiz_start      开始练习（模块、来源）
quiz_submit     提交作答（题型、是否判分、对错）
```

---

## 7. 测试

```bash
npm run test:analytics
```

包含：事件白名单、SQLite 聚合、会话时长、练习正确率、事件幂等、
同源校验、管理员登录/Cookie、未授权访问、CSP、CSV 不含 ID、
前端健康检查失败自动关闭、DNT/隐私开关、上报体不含提问与 API Key。

---

## 8. 与 Vercel 的关系

当前 `vercel.json` 是**纯静态**构建。这个统计服务需要常驻 Node 进程和可写磁盘，
不能直接跑在 Vercel 静态部署里。要用 Vercel 的话，需要改成 Serverless + 外部数据库
（另配环境与迁移），本仓库不默认走那条路。
