# 课程 Agent 与学习模式

课程流程采用 **LangGraph JavaScript**（`@langchain/langgraph`），网页与 MCP 的 Node worker 共用生成、校验和修正逻辑。FastAPI 保留账号鉴权、模型凭证、上游调用与 PostgreSQL 存储；浏览器不持有模型密钥。

## 实际执行路径

- `src/lib/course-agent.js`：LangGraph `StateGraph` 定义资料发现图（检索词 → 检索 → 需求追问）及生成图（生成 → 校验 → 有限修正／结束）。已有检索结果可跳过成功阶段。
- `src/lib/assistant-agent.js`：即时协助的模型决策 → 联网搜索 → 观察结果循环。`chat_agent` 返回 `search` 或 `answer` 数据；工具参数校验失败会反馈具体原因修复，接口错误直接退出。搜索经鉴权后的 `/api/web-search` 执行，查询与结果记录保存到当前用户消息的 `toolCalls`，界面显示执行中、完成、失败和已停止。每轮最多两次检索，模型选择在发送时固定；关闭联网直接调用普通对话。网页摘要作为不可信参考输入，不作为系统指令。
- `src/lib/course-generation.js`：蓝图及讲次生成使用图执行。讲次仍需通过教材、独立板书／口语、教学设计、理解检查与测验校验。
- `src/lib/course-generation-queue.js`：保留并发上限、讲次顺序、已完成和乱序成功结果的保存与恢复，调用图生成每讲。
- AI 编辑方案、独立练习与实时课堂补讲也走相同的生成校验图；编辑仍须预览后应用。
- `scripts/course-job-worker.mjs`：MCP 后台任务复用网页的蓝图与讲次生成图，通过私有 JSON-lines 通道向 Python 请求模型调用。

模型返回的内容未通过校验时最多请求三次（首次生成加两次修复）。内部执行 ReAct 式“校验观察 → 定向修复 → 合并 → 再校验”循环，用户界面继续显示生成状态，不展示中间校验错误。成功时不增加额外的模型审阅调用。

- 原始任务、失败候选输出、JSON Pointer 字段位置、具体错误及前几轮错误一起作为修复上下文；第二次修复基于已经合并过的候选结果，保留上一次成功的修复。
- 可解析的 JSON 优先请求 `{"patches":[{"op":"add/replace/remove","path":"/失败字段","value":...}]}`；只允许在校验指出的子树内修复，拒绝根对象替换、越界修改与无效路径。补丁在副本上原子应用，然后重新运行完整内容校验，不能绕过质量要求。对仍返回完整对象的兼容模型，已定位错误时只取失败子树，其余字段保持原样。
- 无法解析的输出会带回模型，仅修复其语法或缺失结尾；不会在本地猜括号、补写教材。过长的失败输出按后端每条消息限制拆分保留，不直接截断。
- 检索词、需求追问、蓝图、逐讲生成、AI 编辑、独立练习及课堂调整共用循环；网页与 MCP worker 使用同一份逻辑。修复耗尽才交给原有恢复流程，已完成讲次保持不变。
- 网络、鉴权、限流与服务异常直接返回，不当成内容问题重复请求。取消后不写入迟到结果。修复协议只覆盖结构化生成的当前修复请求，不改变普通聊天。

进度仍由现有工作区／任务 checkpoint 保存到 PostgreSQL，并非 LangGraph 自带的数据库 checkpointer。网页生成随页面生命周期运行，MCP 任务在后台运行；恢复复用已完成讲次，不重新生成。没有配置 LangSmith 或外部追踪服务。

## 生成耗时

网页和 MCP 后台现在共用调度规则：远程 API 最多同时展开两讲，未知、本地和网页会话适配器仍逐讲生成。后台通过带请求 ID 的 IPC 异步返回结果，乱序成功的讲次立即保存，展示和最终课程仍遵循蓝图顺序；一讲失败会等待其他在途讲次保存后停止，恢复只生成缺失讲次。取消会中止在途请求。

官方 DeepSeek V4 API（`api.deepseek.com` 的 `deepseek-flash`、`deepseek-v4-flash`、`deepseek-v4-pro`）默认对结构化课程任务显式关闭额外推理，减少等待隐藏推理的时间。可通过 `KNOWRA_AI_GENERATION_EFFORT=low` 或 `high` 恢复相应推理强度；检索词、需求追问和局部字段修复始终关闭额外推理。普通聊天、其他服务及本地网页适配器保持各自原来的参数。修改环境变量后需重启后端。

提速不通过缩减课程深度、限制讲次数或降低输出长度实现；所有结果仍经过同一套教材、板书、讲解、穿插理解题与教学设计校验，失败时运行局部修复。真实耗时受服务负载、输出量、缓存和修复次数影响，结构校验通过也不等同于教学质量已人工评审。

## 两种学习模式

`learningMode` 为 `self` 或 `school`，历史数据缺失时默认为 `self`。

- **自学**：围绕已有基础、目标与可用时间安排知识路线，允许按先修关系重排内容。
- **学校同步**：以教材／大纲及当前章节为主线，结合进度和考核要求安排预习、同步讲解、复习、练习。缺少目录或版本时明确待确认内容，不编造老师安排、页码或教材目录。

学校同步接受 `schoolContext`：`textbook`（教材／大纲）、`chapter`（当前章节）、`schedule`（进度）、`assessment`（考核要求）。至少提供教材、章节或上传的参考内容之一。上传资料仍是学习参考，不是 Agent 执行指令。

模式和学校信息参与检索、需求追问、蓝图、逐讲生成，保存在课程上，供后续 AI 编辑、答疑、实时补讲和独立练习使用。创建页改动模式／范围后，旧蓝图及已生成内容保留，但必须更新并重新确认蓝图才能继续生成。

## 验证

```sh
node --test scripts/test-course-agent.mjs scripts/test-generation-repair.mjs scripts/test-course-json.mjs scripts/test-course-generation-queue.mjs scripts/test-course-editing.mjs scripts/test-adaptive-classroom.mjs scripts/test-course-practice.mjs
node scripts/qa-learning-mode.mjs
node scripts/test-backend.mjs
npm run build
```

浏览器与接口测试使用模拟模型返回值，验证参数传递、修正、取消与恢复契约，不代表真实模型的教学质量或生成耗时。
