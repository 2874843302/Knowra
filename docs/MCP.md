# 账号与 Agent 接入

## 开始使用

1. 启动项目，打开 `/signup`，用邮箱、密码和称呼注册。之后通过 `/login` 登录；打开课程深层链接时，登录后会回到原课程。
2. 在「设置与偏好 → AI 模型」添加模型，可保存多组连接并指定默认模型，在对话处切换。每个账号单独保存模型列表；首次注册的本机账号沿用安装前的本机模型配置。运营方显式设置的 `AI_*` 环境变量作为初始默认模型，账号保存列表后以自己的列表为准。
3. 在「设置与偏好 → 连接我的 Agent」创建连接，复制接入配置到自己的 MCP 客户端。完整凭证仅在创建时显示一次，有效期默认 90 天，可以撤销。

本版本采用邮箱密码注册，不发送验证邮件；暂未实现邮箱验证、忘记密码邮件或第三方登录。注册时可主动勾选导入当前浏览器的旧学习数据。此操作复制课程、笔记及提取文字，保留旧空间；原文件仍归旧空间，需要重新上传。不会通过旧工作区 ID 自动认领任何其他空间。

## 客户端配置

端点：`http://127.0.0.1:5173/api/mcp/`。保留最后的 `/`。

使用支持 **Streamable HTTP** 和自定义 `Authorization` 请求头的 MCP 客户端。此版本采用个人访问令牌，不提供 OAuth 自动授权流程。不同客户端的配置位置可能不同，以下为通用 JSON 模板：

```json
{
  "mcpServers": {
    "knowra": {
      "url": "http://127.0.0.1:5173/api/mcp/",
      "headers": {
        "Authorization": "Bearer <YOUR_MCP_TOKEN>"
      }
    }
  }
}
```

协议实现使用 [官方 Python SDK](https://github.com/modelcontextprotocol/python-sdk)，传输方式遵循 [Streamable HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)。网页登录 Cookie 不会代替 MCP 凭证，MCP 凭证也不能调用工作区或模型设置接口。

可以对 Agent 说：

> 根据这次提交里的状态管理改动，为我生成一门课程。我的 Vue 基础一般，希望系统理解设计取舍。只使用我指定的 diff，完成后给我学习链接。

服务不会读取 Agent 所在机器的仓库，也不会执行提交中的代码。由 Agent 取得用户指定的代码、diff 或文字，通过 `context` 传入。不要上传不属于当前学习需求的文件或敏感配置。

## 工具合约

| 工具 | 输入 | 返回 |
| --- | --- | --- |
| `create_course` | `topic` 必填；可选 `context`、`source_type`、`goal`、`foundation`、`depth`、`scale`、`mode`、`request_id` | 任务 ID、状态、`jobUrl`；后台开始生成 |
| `get_course_generation` | `job_id` | 进度；完成后返回 `courseUrl`、`learningUrl` |
| `list_courses` | 无 | 本账号自建课程与学习链接 |
| `resume_course_generation` | `job_id` | 继续未完成任务，复用已校验讲次 |
| `cancel_course_generation` | `job_id` | 停止生成并保留已完成讲次 |

`source_type` 为 `topic` / `code` / `commit` / `document`。`context` 最多 60,000 字符；更大的仓库应由 Agent 先挑选相关代码。`depth` 为 `recommended` / `overview` / `systematic` / `deep`，`scale` 可写“约 8 小时，必要内容不要省略”等自由要求，不固定单元或讲次数。

`mode` 为 `auto` / `explain` / `course`。`explain` 用于聚焦讲解一段代码、一次提交或一个具体问题，按用户需求决定讲次，不扩展成完整学科；`course` 用于用户明确要求的系统课程；`auto` 由服务端结合资料与请求判断，代码/提交请求且未明确要求系统课程时优先聚焦讲解。外部 Agent 在讲解代码或提交时应显式传 `mode: "explain"`，并先确认用户是要“讲清这次改动”还是“系统学习”。

建议每次新课程使用一个 UUID `request_id`；相同账号、相同 ID 和相同参数返回同一个任务，避免超时重试重复创建。相同 ID 携带不同参数返回冲突。请保留任务 ID，用进度工具查询，建议间隔 5 秒以上；不要把“尚未完成”当成重新创建的理由。

生成顺序为蓝图规划、逐讲教材/讲解/板书/测验校验、保存课程。格式问题由底层定向修复；连接或授权失败不会自动重复请求。任务和检查点存入 PostgreSQL。服务重启时任务标记为中断，用户要求继续后可恢复；上游限流时应等待给定的 `Retry-After`，不要循环恢复。

每个账号最多一个活动生成任务，后台课程任务按安装实例排队。任务开始时固定当前默认模型，期间切换默认模型不改变这个任务使用的模型。单个任务内，远程 API 最多同时生成两讲，本地模型和网页会话适配器保持串行；乱序成功的讲次也会保存，失败恢复只补缺失讲次，最终顺序仍按蓝图。官方 DeepSeek 的推理强度配置见 [课程 Agent](AGENT.md#生成耗时)。网页进度可停止或继续；课程完成后进入本账号的「我的课程」。学习链接要求使用创建任务的同一个账号登录，其他账号不能凭链接读取课程。

## 地址与部署

本机 Agent 可直接访问默认地址。远程 Agent 需要能访问部署后的服务；本次实现没有自动发布公网地址。

部署时将 `KNOWRA_PUBLIC_URL` 设置为浏览器可访问的站点根地址，例如 `https://learn.example.com`；反向代理将页面、`/api/*`、`/api/mcp/` 转发到同一服务，并正确传递 HTTPS 协议。服务仍可监听本机回环地址，由代理负责外部入口。返回的进度和学习链接使用这个配置，不使用客户端可伪造的 Host 拼接。

登录使用 HttpOnly、SameSite=Lax Cookie；HTTPS 请求设置 Secure。数据库仅保存密码的 PBKDF2 哈希及会话/MCP 令牌哈希。用户身份从服务端会话或令牌确定，`X-Workspace-Id` 不再作为授权依据。`X-Account-Id` 仅作为防止切换账号后旧页面误写的校验，不能用来登录。

数据保存在 `KNOWRA_DATABASE_URL` 指定的 PostgreSQL；上传原文件在 `material_blobs` 表，模型配置在 `provider_profiles` 表且 API 密钥经 `KNOWRA_SECRET_KEY` 加密后存储。备份时导出 PostgreSQL 即可覆盖这两类数据，另外单独保管主密钥；仍留在磁盘的只有语音模型与合成缓存。详见 [数据库文档](DATABASE.md)。完整 MCP 凭证不会包含在网页备份或令牌列表中。

## 验证

```powershell
npm run build
.\.venv\Scripts\python.exe -m pytest backend/tests -q
node scripts/qa-auth-mcp.mjs
```

桌面验证自行启动 8021 端口的临时服务，使用临时数据库、运行时生成的密码和固定模型，不连接真实模型。覆盖 1440/1024 桌面、减少动态效果、深层链接登录返回、账号切换、MCP 创建课程到学习链接、凭证撤销。完整凭证不输出到日志或截图。其他早期浏览器脚本若仍依赖匿名工作区，需要先适配账号登录。

## 学习模式参数

`create_course` 支持 `learningMode`（`self` 自学，默认；`school` 学校同步）与 `schoolContext`。
后者包括 `textbook`、`chapter`、`schedule`、`assessment` 四个可选字符串字段，每项最多 1000 字。
学校同步至少提供教材／大纲、当前章节或 `context` 参考资料之一；模式影响蓝图、讲解及练习，并保存在生成的课程中。
自学依据基础和目标规划路线；学校同步遵循提供的教材章节与进度，不虚构学校安排。
框架与恢复机制见 [课程 Agent](AGENT.md)。
