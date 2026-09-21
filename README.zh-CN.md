# Vergil Calendar

[English](README.md) | **简体中文**

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/linusxiong/vergil-cal-subs)

将 Columbia Vergil 的已注册课程生成可订阅的日历。每次创建或更新时，手动提供必填的 **Access Token** 和可选的 **Refresh Token**；服务读取课程后保存快照，**不持久保存学校 Token，也不在后台自动刷新**。之后重新提交新的 Access Token，即可更新同一个订阅链接。

在线使用：**https://vergilcal.xsy.app** · 源代码：**https://github.com/linusxiong/vergil-cal-subs** · MIT License

这是独立开源项目，与 Columbia University 无隶属关系。当前实现依据一次本人授权的登录抓包及 Vergil 公开前端代码；**2026 年 9 月 21 日已用本人授权账号在 Cloudflare Workers 上验证真实课程读取、日历创建、D1 管理读取、ICS 获取与撤销；学校的 Refresh Token grant 仍未实测**。自动测试使用合成数据和模拟上游响应，验证成功不代表学校批准了第三方客户端。证据与限制见 [中文抓包归档](docs/capture-2026-09-21.zh-CN.md)（[English](docs/capture-2026-09-21.md)）。

## 功能与技术栈

- 每个经验证的 UNI 对应一个日历，HTTPS / webcal 订阅地址兼容 Apple 日历、Google 日历和 Outlook；除非主动更换，地址保持稳定。
- 从正式选课记录筛选班级，包含课程名称、日期、时间和教室／楼宇；不混入 Planner 或 Waitlist。
- 按纽约时区处理夏令时、多个上课安排及跨午夜课程，生成具有稳定 UID 的 ICS 事件。
- 同一日历保留已导入的各学期快照，更新某个学期只替换该学期；支持排除停课日期，手动更新名称和课表时订阅地址不变。
- 私密管理链接用于查看、更新及撤销；也可通过 Access Token 验证账号后查找和更新自己的日历，或更换订阅地址；一次更新失败保留原快照。
- React + TypeScript + Vite + Bun，TanStack Router / Query，HeroUI 3 + Tailwind CSS 4，i18next + react-i18next。
- 系统字体、克制的蓝色操作按钮、手机布局与系统深色模式；没有外部字体、分析脚本或广告。
- 界面支持 English / 简体中文，首次打开默认英文；右上角切换语言并在本机记住选择。日期、操作提示和使用指南随语言切换，错误与诊断警告始终使用英文。i18next 翻译资源位于 `src/locales/`，课程原始名称与订阅内容不会被改写。
- Cloudflare Workers 同时托管 API 和静态前端，D1 保存课程快照。无独立常驻服务器、队列或定时任务。
- 中英文页面元数据、canonical 与语言替代链接、Open Graph／社交分享卡片、结构化数据、robots 与 sitemap 路由，以及应用图标。公开页面地址使用部署实例自己的 origin。

## 如何获取 Access Token 与可选的 Refresh Token

请在**自己的电脑浏览器**完成以下操作。手机网页没有桌面开发者工具，建议先在电脑创建订阅，再在手机中添加链接。此项目不收集学校密码、Duo 验证码或 Cookie。

### 方法一：浏览器存储

1. 在 Chrome 或 Edge 打开 [Vergil](https://vergil.columbia.edu/)，完成学校登录及 Duo 验证，确认能看到自己的课程。
2. 打开开发者工具：macOS 使用 `⌥⌘I`，Windows / Linux 使用 `F12` 或 `Ctrl+Shift+I`。
3. 切换到 **Application（应用）**；若面板未显示，可从顶部 `»` 菜单寻找。
4. 展开 **Storage → Local Storage**，选择 **`https://vergil.columbia.edu`**。
5. 找到 `access_token`，复制 Value 中的**完整原始字符串**。如需使用可选的 Refresh Token，再复制同一登录会话的 `refresh_token`。
6. 在本项目中粘贴必填的 Access Token；Refresh Token 输入框可以留空。不要加引号、`Bearer ` 前缀或字段名；不要使用 `id_token` 替代 Access Token。
7. 确认学期后提交。两个输入框会在每次提交时清空，包括打开已有日历；无论上次请求成功或失败，下次请求都需要重新粘贴新的 Access Token，以及你选择提供的 Refresh Token。

Vergil 的存储实现可能变化。如果找不到这些键，检查同一站点的 Session Storage，或使用下面的网络面板方法。不要为此安装要求读取全部浏览数据的扩展。

### 方法二：登录时的 Network 响应

1. 在 Vergil 页面打开开发者工具的 **Network（网络）** 面板，开启 **Preserve log（保留日志）**。
2. 使用学校正常提供的退出／登录入口，重新完成一次登录。浏览器只有在面板开启后才能记录这次响应。
3. 用 `token.oauth2` 过滤请求，寻找发往 **`https://oauth.cc.columbia.edu/as/token.oauth2`** 的成功 POST 请求。
4. 查看 **Response（响应）**，复制 JSON 的 `access_token` 值；也可以选择复制 `refresh_token` 值。复制值本身，不包括 JSON 引号和逗号。
5. 回到本项目提交。这次抓包中 `expires_in` 为 `7199` 秒（约两小时），不是保证未来每次相同；获取后请及时使用。

**学校 Token 应像密码一样保护。** 本次发现其权限包含 `create/read/update/delete` 等，范围超过只读日历所需权限。仅使用你信任或自行部署的实例：Token 会经 HTTPS 发送到该实例的 Worker，再由 Worker 请求 Columbia；“不保存”不等于“不会经过服务器”。不要上传含凭据的 HAR、截图或复制整个响应到 Issue，也不需要在 Console 粘贴代码。

学校可能轮换 Refresh Token。仅当你提供了 Refresh Token，且上游请求拒绝 Access Token（401）时，本项目才会在同一次请求中最多尝试刷新一次，并在本次操作结束后丢弃返回的令牌。如果 Access Token 已过期且未提供 Refresh Token，请求会返回 401；请从 Vergil **重新获取 Access Token** 后提交。下次更新时请获取新的 Access Token，如需 Refresh Token 则从同一会话获取；必要时重新登录。项目不会将轮换令牌写回学校浏览器存储，也不保证旧 Refresh Token 可重复使用。

## 创建、订阅和更新

1. 从学期下拉框选择，例如 **Fall 2026 / 2026 年秋季**。默认选择按纽约当前月份推定的学期，仍请核对自己的课程安排。选项包含当前年份前后各两年的春、夏、秋学期；管理旧日历时也保留其原学期。API 仍使用年份 + 季节编号，例如 `20263`。
2. 日历名称可选。需要排除停课日期时，展开选项，每行输入一个 `YYYY-MM-DD` 日期，最多 366 个；它会从本次导入学期的所有课程中排除这些日期。
3. 粘贴 Access Token，可选择同时提供 Refresh Token，然后创建或更新。每个经验证的 UNI 只有一个日历，再次提交会更新已有日历，不会创建第二个。首次创建成功后请立即私密保存**管理链接**和**订阅链接**。
4. 在日历客户端选择“订阅”，不要只下载并导入一次 ICS：
   - **Apple 日历**：点击页面“在日历 App 中打开”；或在 Mac 日历中选择“文件 → 新建日历订阅”，粘贴地址。
   - **Google 日历**：在网页端“其他日历”旁点击 `+`，选择“通过网址”，粘贴 HTTPS 订阅地址。
   - **Outlook**：选择“添加日历 → 从 Web 订阅”，粘贴 HTTPS 地址。
5. 增退选、教室变动或停课日期变化后，打开管理链接，或在首页使用“打开已有日历”打开已有日历，重新输入新的 Access Token 和可选的 Refresh Token 并更新。普通更新无需重新添加订阅地址；主动更换地址后则需要重新订阅。

日历客户端自行决定拉取间隔，更新服务端不代表所有客户端立即显示新课表。本项目没有后台学校同步，也没有推送能力。课程安排待定时会显示提示；没有教室信息时地点留空。地点来自 API 的房间和楼宇名称，不保证提供街道地址。各学院、课程的停课规则可能不同，系统不会擅自套用全校假期。

### 查找自己的日历并保留历史学期

1. 在首页粘贴新的 **Access Token**（Refresh Token 可选），点击**打开已有日历**。服务器向学校验证 UNI，再用其哈希匹配该账号唯一的日历；仅输入 UNI 不能获得访问权限。
2. 如果日历已存在，页面会自动打开。查找返回零个或一个归一化日历快照及其已导入学期历史，不返回学校 Token 或管理密钥；查找本身不会改动已保存的课程。
3. 查找提交后，两个 Token 输入框都会清空。更新前请重新粘贴新的 Access Token 和可选的 Refresh Token，并选择要导入的学期。新快照只替换该学期，之前导入的其他学期仍保留在同一个 ICS 中；服务不会自动获取学校所有往期学期。普通更新保留原订阅地址和管理链接。

### 更换订阅地址

如果订阅地址泄露，或你希望使用新地址，可在日历页面主动更换。可以使用私密管理密钥授权，也可以在查找账号后提供新的 Access Token 和可选的 Refresh Token。更换前请确认提示：**旧订阅地址会立即返回 404，需要在日历 App 中使用新地址重新订阅**。已保存的课程、历史学期和管理链接不变；更换地址无法删除客户端已经缓存的副本。

撤销与更换地址不同：撤销会删除日历，仍需要保存的私密管理密钥。

### 两种链接的区别

| 链接 | 权限 | 保存方式 |
| --- | --- | --- |
| `/calendar/<订阅ID>.ics` | 读取课程日历；任何持有者都能查看 | 只交给需要访问课表的日历客户端 |
| `/manage/<随机ID>#<管理密钥>` | 查看管理页、更新、更换订阅地址、删除；更新还需要原学生的新 Access Token | 私密保存完整链接，包括 `#` 后的部分 |

管理密钥与学校 Token 无关，只有创建时返回明文，数据库只存其哈希；URL 的 fragment 不随页面请求发送到服务器，前端调用管理 API 时才放入 Authorization 请求头。浏览器历史仍可能保存完整管理链接，请使用自己的设备。

原管理密钥仅保存哈希，无法恢复原文。管理链接丢失后，可使用新的 Access Token 在首页“打开已有日历”，打开已有日历后更新或更换订阅地址，无需原管理密钥；撤销仍需要原管理密钥。仅订阅地址泄露时，可更换地址并保留课程。更换订阅地址不会使泄露的管理密钥失效；若管理密钥泄露且仍持有它，可通过管理页面撤销。撤销删除活动数据库中的快照、使旧链接失效，但日历客户端缓存和服务商已有备份不受此操作控制。

## 本地运行

需要 Bun 1.3.14 或兼容版本，以及能运行 Vite 8 / Wrangler 的 Node.js 22.12+（或 24 LTS）。日常包管理使用 Bun。

```sh
git clone https://github.com/linusxiong/vergil-cal-subs.git
cd vergil-cal-subs
bun install --frozen-lockfile
bun run db:migrate
bun run dev
```

打开终端显示的本地地址（通常是 `http://127.0.0.1:5173`）。Vite 的 Cloudflare 插件运行 Worker，并使用 `.wrangler/state` 中的本地 D1。首次运行必须应用迁移；本地数据库与线上数据库互相独立。迁移会约束每个账号只有一个日历，并以现有日历 ID 初始化订阅 ID，保留原订阅地址。如果旧实例中同一账号已有多个日历，迁移会停止且不会删除数据；请先备份并处理重复记录，再重试。本地开发可使用配置中的全零数据库 ID，线上必须替换。

若要改变界面中的开源链接，复制 `.env.example` 为 `.env` 并设置 `VITE_GITHUB_URL`，之后重新构建。这是公开的构建变量，**任何 `VITE_*` 变量都会进入前端，不要放 Token**。运行不需要在任何环境文件中填入学校 Token。

```sh
bun run check      # 类型检查、合成数据测试、生产构建
bun run preview    # 构建后在本地预览生产版本
```

测试覆盖正式选课过滤、DST、跨午夜、排除日期、稳定 UID、UTF-8 ICS 折行、管理权限、身份一致性、一次刷新、分页边界、并发写入和失败保留快照。所有学校响应均为模拟，测试无需学校账号，不访问学校 API。后端测试用 Bun SQLite 执行实际迁移 SQL，模拟 D1 的调用接口。

## 部署到 Cloudflare Workers

使用上方 **Deploy to Cloudflare** 按钮和自己的 Cloudflare 账号即可创建实例。Cloudflare 会配置 D1 绑定，并使用仓库的构建与部署脚本；发布前自动应用数据库迁移。根目录 `wrangler.jsonc` 是可复用模板，不包含项目维护者专属的账号、数据库或域名设置。独立的 `wrangler.production.jsonc` 用于现有公开实例；fork 请使用根模板或自己的部署配置。

手动部署步骤如下：

```sh
bunx wrangler login
bunx wrangler d1 create vergil-cal-subs
```

将返回的 `database_id` 填入 `wrangler.jsonc` 的 `d1_databases[0].database_id`，替换全零值。保留绑定名 **`DB`**；迁移脚本通过该绑定寻找数据库，数据库名称可以不同。

```sh
bun run deploy
```

部署命令先构建 Vite、应用远程 D1 迁移，再由 Wrangler 使用 Cloudflare 插件生成的配置发布 Worker 与静态资源。如需单独应用迁移，仍可运行 `bun run db:migrate:remote`。使用返回的 HTTPS 地址；需要自定义域名时，在 Cloudflare 中给该 Worker 添加域名。应在分发订阅链接前确定域名，改变域名会影响已有订阅地址。

可在 `wrangler.jsonc` 添加 `vars.PUBLIC_APP_URL` 作为固定站点 origin，例如 `https://calendar.example.com`。配置后应只通过该 origin 使用应用，其他 origin 的写入会被拒绝。未设置时使用当前请求的 origin。

如需保留共享模板，可将配置复制到已被 Git 忽略的 `wrangler.deploy.json`，填写自己的 `account_id`、数据库 ID 和可选的自定义域名 `routes`，然后运行 `CLOUDFLARE_CONFIG=wrangler.deploy.json bun run deploy`。构建和远程迁移都会使用此配置。若 Cloudflare 登录账号可访问多个账户，需要明确指定 account ID。

### 现有实例的 Cloudflare Builds

仓库中的 `wrangler.production.jsonc` 用于 `vergilcal.xsy.app`。其中的账号、D1 数据库和域名标识不是秘密，不包含部署凭据。fork 请继续使用 `wrangler.jsonc` 或自己的部署配置。

Git 连接目前仍在配置中，尚未确认自动部署完成。生产构建仅连接 **`main` 分支**，关闭预览构建：

- **Build command：**

  ```sh
  bun run typecheck && bun test && CLOUDFLARE_CONFIG=wrangler.production.jsonc bun run build
  ```

- **Deploy command：**

  ```sh
  CLOUDFLARE_CONFIG=wrangler.production.jsonc bun run db:migrate:remote && bunx wrangler deploy
  ```

构建时选用生产配置；部署时先应用该配置对应的 D1 迁移，再发布生成的 Worker 配置。此实例不启用预览部署。

所有请求都优先进入 Worker，为公开 HTML 注入对应路由的元数据，同时避免 API 和 ICS 被 SPA HTML 回退覆盖。英文页面为 `/` 和 `/guide`，添加 `?lang=zh-CN` 可访问中文版。canonical 链接和 `/sitemap.xml` 使用配置的公开 origin 或当前请求 origin，自托管实例不会指向他人的域名。私密管理页面以及日历／API 响应禁止搜索引擎索引。静态响应的安全头在 `public/_headers`；API 的头由 Worker 设置。默认关闭 Workers observability，应用不写请求日志。部署者也应避免额外开启请求体／Authorization 采集、第三方错误跟踪或公开请求日志，因为订阅路径本身是访问凭据。

当前版本面向个人或小范围自托管，没有公网注册配额或反滥用系统。面向大量用户开放前，需依据自己的 Cloudflare 套餐及学校 API 策略配置请求限流、容量和费用监控，并完成真实账号验收；不要用内存计数器假装全局限流。

## 数据流与保留

```text
浏览器：用户提交 Access Token 和可选的 Refresh Token（仅本次请求）
    ↓ HTTPS POST
Worker：userinfo → 本人 person ID → 正式选课 → 课程详情 → 生成 ICS
    ↓ 原子写入；任何失败保留旧快照
D1：各学期快照、合并 ICS、日历 ID、订阅 ID、管理密钥哈希、学生身份哈希、版本
    ↑ GET /calendar/<feed-id>.ics（不需要学校 Token）
Apple / Google / Outlook：按客户端策略拉取
```

不保存学校 Access / Refresh / ID Token、密码、Cookie、原始上游响应或浏览器会话。不使用 Local Storage / Session Storage 持久化学校令牌，也不将其放入 TanStack Query 的请求缓存。令牌在请求处理期间存在于浏览器／Worker 内存中；JavaScript 无法保证对内存做密码学擦除。

D1 保存各已导入学期的归一化快照、排除日期、更新时间、合并 ICS、日历和订阅 ID、ETag、版本，以及身份和管理密钥哈希。经学校验证的 UNI 以哈希保证每个账号只有一个日历，不保留明文 UNI；现有学生身份哈希限制查找及通过学校验证的更新、更换订阅地址只能由原学生执行。哈希是可关联的假名标识，**不是匿名化承诺**。数据没有自动过期，到用户撤销或部署者删除为止。Google、Apple 或 Microsoft 在订阅时也可能获取并缓存课程数据。

API 只请求固定 Columbia 主机，拒绝跨域重定向和跨学生分页。仅在提供 Refresh Token 且上游返回 401 时，同一次同步请求才会最多尝试一次 Token 刷新；不会扩大 scope，也不会执行选课写操作。更新使用版本条件写入以避免并发覆盖。ICS 响应支持 ETag / 304，并要求客户端重新验证缓存。

## API 与目录

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| POST | `/api/calendars` | 创建或更新该 UNI 唯一的日历；必填 Access Token、可选 Refresh Token、学期、可选名称和排除日期；新建返回 201，已有返回 200 |
| GET | `/api/calendars/:id` | 查看快照；管理 Bearer 必填 |
| POST | `/api/calendars/lookup` | 查找账号日历；新的 Access Token 和可选 Refresh Token，服务器验证 UNI 归属，返回 `{calendars: [零个或一个快照], refreshed}` |
| POST | `/api/calendars/:id/sync` | 仅替换所选学期快照；新的 Access Token 和可选 Refresh Token；验证 UNI 归属后也可不提供管理 Bearer |
| POST | `/api/calendars/:id/rotate` | 仅更换订阅地址；管理 Bearer 加 `{}`，或新的 Access Token 和可选 Refresh Token；返回日历快照 |
| DELETE | `/api/calendars/:id` | 撤销；管理 Bearer 必填 |
| GET / HEAD | `/calendar/:feedId.ics` | 订阅；随机 URL 即读取权限 |

请求与响应类型见 `src/shared.ts`。不要把学校 Token 放入 URL、命令行参数或 Issue；调试时也不要打印完整请求。

- `src/App.tsx`、`src/styles.css`：创建、管理、指南界面。
- `src/locales/`：UI 与 SEO 的中英文 i18next 翻译资源；错误与诊断警告始终使用英文。
- `src/server/index.ts`：Worker 路由、输入验证、D1 与授权。
- `src/server/vergil.ts`：Columbia 身份、刷新和课程读取。
- `src/server/calendar.ts`：课程归一化与 ICS 生成。
- `migrations/`：D1 schema；`tests/`：合成测试。
- [中文抓包归档](docs/capture-2026-09-21.zh-CN.md)、[英文抓包归档](docs/capture-2026-09-21.md)和[英文机器可读摘要](docs/capture-summary.json)：可公开的脱敏证据。文档提供中英文版本，代码与诊断信息使用英文。

## 当前边界与故障排查

- **验证未通过**：重新登录 Vergil，复制新的 Access Token；可选的 Refresh Token 必须来自同一账号、同一会话；不要使用 ID Token。使用私密管理链接时必须保留完整的 `#` 密钥；也可以在首页通过学校 Token 验证账号后查找订阅。
- **已有日历不能用另一个账号更新**：这是身份绑定；另一位学生应新建自己的订阅。
- **上游响应格式不支持／没有课程**：确认学期及正式选课记录。学校字段变动时需要调整适配器；请只提交脱敏字段结构，勿提交真实响应或凭据。
- **地点缺失**：学校可能尚未安排教室，或当前字段仅有楼宇而无完整地址。
- **日历没有马上变化**：先检查管理页的更新时间，再等待客户端重新拉取；不能靠网页强制第三方客户端刷新。
- **本地 `no such table: calendars`**：运行 `bun run db:migrate`；线上则运行远程迁移。
- **管理链接遗失**：原密钥无法恢复，但可用新的 Access Token “打开已有日历”，自动打开日历后更新，或主动更换订阅地址；撤销仍需要保存的管理密钥。

直接打开 Vergil 登录页不会自动把令牌授权给其他网站或手机 App。系统浏览器与 App 的回调授权仍需学校注册和许可。本项目实现的是明确的手动 Token 工作流；正式第三方 OAuth 客户端、只读 scope、学校允许的后台刷新仍需另行与 CUIT 确认。

## 参与贡献

请参阅英文 [Contributing](CONTRIBUTING.md)，了解英文 Conventional Commits 提交规范、翻译更新与必要检查。先运行一次 `bun run hooks:install` 启用本地提交信息 hook；`bun run commitlint` 可运行提交信息检查工具。修改界面文案时同步更新 `src/locales/` 中的两种语言，错误与诊断警告保持英文。

开发参考：[HeroUI](https://heroui.com/en/docs/react/getting-started/quick-start)、[Cloudflare Vite Plugin](https://developers.cloudflare.com/workers/vite-plugin/tutorial/)、[Workers 静态响应头](https://developers.cloudflare.com/workers/static-assets/headers/)、[TanStack Router](https://tanstack.com/router/latest/docs/framework/react/overview)。
