# PostgreSQL 数据库

应用运行只使用 PostgreSQL，不会退回 SQLite。PostgreSQL 建议 17 或更新的受支持版本。`KNOWRA_DATA_DIR` 继续保存上传文件、AI 配置和语音模型，它不再决定数据库位置。

## 本地启动

安装 Python 依赖后，将 `.env.example` 复制为 `.env` 并修改：

```dotenv
KNOWRA_POSTGRES_PASSWORD=请替换为自己生成的强密码
KNOWRA_DATABASE_URL=postgresql://knowra:同一个密码@127.0.0.1:5432/knowra
KNOWRA_DATABASE_POOL_SIZE=10
```

密码含特殊字符时需要在 URL 中百分号编码。不要把 `.env` 提交到 Git。使用已有 PostgreSQL 时，填写已有的数据库地址、账号和密码，无需启动容器。

```powershell
docker compose up -d postgres
npm run dev
```

Compose 的 `knowra-postgres` 卷保存数据库文件；只监听本机 5432。修改 `KNOWRA_POSTGRES_PORT` 时也要修改连接 URL 中的端口。容器首次创建后，更改 `.env` 密码不会自动更新数据库角色密码。

后端启动时运行 `backend/app/migrations/*.sql`，以事务和数据库锁保证幂等，并记录版本、校验值。已有迁移不要修改，应新增递增编号的文件。运行账号需要连接目标库、创建 schema/表及读写权限，不需要超级用户权限。连接池每个后端进程最多 10 个连接，部署多个进程时需据此预留数据库连接容量。

### 当前 Windows 便携实例

本机调试环境使用 `.local/postgres-tools/pgsql/` 中的 PostgreSQL，数据在 `.local/postgresql/`，端口 `15432`，连接信息已写入忽略提交的 `.env`。不占用已有的 5432 服务，也不注册或修改系统服务。系统重启后，可先执行以下命令启动数据库，再运行 `npm run dev`：

```powershell
& .local/postgres-tools/pgsql/bin/pg_ctl.exe -D .local/postgresql -l .local/postgresql.log -o "-h 127.0.0.1 -p 15432" start
```

若使用上面的 Docker 部署或已有数据库，可忽略此节。不要同时运行两个实例访问同一个 PostgreSQL 数据目录。

## 从旧 SQLite 迁移

1. 停止旧版后端，避免导入快照之后仍产生写入。
2. 备份整个 `.local` 目录，尤其是 `knowra.sqlite3`、可能存在的 WAL 文件、uploads 和用户配置。
3. 准备一个空 PostgreSQL 数据库，填写 `.env`。不要先注册新账号。
4. 执行：

```powershell
.venv\Scripts\python.exe scripts\migrate-sqlite-to-postgres.py --source .local\knowra.sqlite3
```

5. 确认输出的七张表行数正确，再启动后端。`GET /api/health` 应返回 `database: postgresql`。

导入在单个 PostgreSQL 事务中完成；只读打开 SQLite，保留原文件。逐表核对行数及内容 SHA-256，目标中任何业务表已有数据都会拒绝导入。失败会全部回滚。账户 ID、密码哈希、有效会话、MCP 凭证哈希、工作区、课程任务断点和资料记录原样保留；上传原文件和 AI 配置继续使用原 `.local` 路径。服务恢复时，旧的进行中课程任务按原有规则标为 interrupted，不自动重放 AI 请求。

新版本开始写入后，旧 SQLite 不再同步。回退只能恢复迁移时的快照；不要直接切回旧库丢弃新增数据。

## 测试与备份

创建专用测试数据库，并设置 `KNOWRA_TEST_DATABASE_URL` 后运行 `npm test`。每项测试使用独立随机 schema，结束后仅删除该 schema；不允许指向正式业务库。测试真实执行 PostgreSQL SQL，不使用 SQLite 替代。

备份 PostgreSQL 使用 `pg_dump`，恢复使用 `pg_restore`，同时备份 `.local/uploads/`、`.local/provider.json` 和 `.local/users/`。数据库连接密码和 AI 密钥不会写入 API 响应或示例配置。`/api/health` 会实际执行数据库查询，数据库不可用时不会报告正常。
