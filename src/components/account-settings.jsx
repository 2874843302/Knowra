import React, { useEffect, useState } from "react";
import {
  Copy,
  KeyRound,
  LogOut,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { accountRequest, useAuth } from "../auth";
import { Button, Field, Input, Modal } from "../ui";

export function AccountSettings() {
  const { user, logout } = useAuth();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <section className="settings-section account-settings">
      <div>
        <h2>账号与登录</h2>
        <p>学习内容和 Agent 连接归属于此账号</p>
      </div>
      <div className="settings-fields">
        <div className="account-identity">
          <span className="account-monogram">{user.name.slice(0, 1)}</span>
          <div>
            <strong>{user.email}</strong>
            <small>已登录 · 登录状态在 14 天后到期</small>
          </div>
        </div>
        <Button
          icon={LogOut}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await logout();
            } catch (e) {
              setError(e.message);
              setBusy(false);
            }
          }}
        >
          退出登录
        </Button>
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

export function McpSettings() {
  const [tokens, setTokens] = useState([]),
    [jobs, setJobs] = useState([]);
  const [name, setName] = useState(""),
    [fresh, setFresh] = useState(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const endpoint = `${location.origin}/api/mcp/`;
  const load = async () => {
    setError("");
    try {
      const [connections, tasks] = await Promise.all([
        accountRequest("/auth/tokens"),
        accountRequest("/course-jobs"),
      ]);
      setTokens(connections.tokens);
      setJobs(tasks.jobs);
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => {
    load();
  }, []);
  const copy = async (content, label) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(label);
    } catch {
      setError("浏览器未允许复制，请手动复制所需内容。");
    }
  };
  const config = (token) =>
    JSON.stringify(
      {
        mcpServers: {
          knowra: {
            url: endpoint,
            headers: { Authorization: `Bearer ${token || "<YOUR_MCP_TOKEN>"}` },
          },
        },
      },
      null,
      2,
    );
  const create = async (event) => {
    event.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    setError("");
    setCopied("");
    try {
      setFresh(
        await accountRequest("/auth/tokens", {
          method: "POST",
          body: JSON.stringify({ name: name.trim(), days: 90 }),
        }),
      );
      setName("");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <section className="settings-section mcp-settings" id="mcp">
        <div>
          <h2>连接我的 Agent</h2>
          <p>让代码、提交和学习目标，变成可学习的课程</p>
        </div>
        <div className="settings-fields">
          <div className="mcp-connection-intro">
            <span>
              <Sparkles size={21} />
            </span>
            <div>
              <strong>把学习，接进你的工作流</strong>
              <p>
                Agent 可以传入指定的代码片段或
                diff，选择基础与详细度，生成课程后直接交给你学习。
              </p>
            </div>
          </div>
          <Field label="MCP 地址" htmlFor="mcp-endpoint">
            <div className="mcp-copy-row">
              <Input id="mcp-endpoint" readOnly value={endpoint} />
              <Button icon={Copy} onClick={() => copy(endpoint, "地址")}>
                复制
              </Button>
            </div>
          </Field>
          <form className="mcp-token-form" onSubmit={create}>
            <Field label="为 Agent 创建连接凭证" htmlFor="mcp-token-name">
              <Input
                id="mcp-token-name"
                placeholder="例如：我的代码学习助手"
                maxLength={60}
                required
                disabled={busy}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Button
              type="submit"
              variant="primary"
              icon={Plus}
              loading={busy}
              disabled={!name.trim()}
            >
              创建连接
            </Button>
          </form>
          <p className="mcp-setting-note">
            凭证有效期为 90
            天，仅能创建和查询本账号课程。完整凭证只显示一次，可随时撤销。
          </p>
          <div className="mcp-token-list" aria-label="Agent 连接列表">
            {tokens.length ? (
              tokens.map((token) => (
                <article key={token.id}>
                  <KeyRound size={17} />
                  <div>
                    <strong>{token.name}</strong>
                    <small>
                      knr_…{token.suffix} ·{" "}
                      {token.revoked_at
                        ? "已撤销"
                        : token.expires_at * 1000 < Date.now()
                          ? "已过期"
                          : `有效至 ${new Date(token.expires_at * 1000).toLocaleDateString("zh-CN")}`}
                    </small>
                  </div>
                  {!token.revoked_at && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={Trash2}
                      aria-label={`撤销 ${token.name}`}
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        setError("");
                        try {
                          await accountRequest(`/auth/tokens/${token.id}`, {
                            method: "DELETE",
                          });
                          await load();
                        } catch (e) {
                          setError(e.message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      撤销
                    </Button>
                  )}
                </article>
              ))
            ) : (
              <p className="mcp-setting-note">
                还没有连接 Agent，创建一个凭证即可开始。
              </p>
            )}
          </div>
          <details className="mcp-config-help">
            <summary>查看接入配置与使用方式</summary>
            <p>
              使用支持 Streamable HTTP 和自定义请求头的 MCP
              客户端，将地址和凭证加入配置。
            </p>
            <pre>{config()}</pre>
            <Button
              size="sm"
              icon={Copy}
              onClick={() => copy(config(), "配置模板")}
            >
              复制配置模板
            </Button>
            <p>
              可以对 Agent
              说：“根据这次提交里的状态管理改动，为我生成一门系统学习课程。我的
              Vue 基础一般，重点讲设计取舍，完成后给我学习链接。”
            </p>
            <p>
              当前地址适用于能访问本机服务的 Agent。服务部署到其他地址时，需配置
              KNOWRA_PUBLIC_URL，使返回的学习链接使用相同地址。
            </p>
          </details>
          {copied && (
            <p role="status" className="mcp-setting-note">
              已复制{copied}
            </p>
          )}
          {error && (
            <p role="alert" className="inline-error">
              {error}
            </p>
          )}
        </div>
      </section>
      <section className="settings-section mcp-jobs">
        <div>
          <h2>Agent 课程任务</h2>
          <p>查看生成进度，继续尚未完成的课程</p>
        </div>
        <div className="settings-fields">
          <Button size="sm" icon={RefreshCw} onClick={load}>
            刷新任务
          </Button>
          {jobs.length ? (
            jobs.map((job) => (
              <Link
                className="mcp-job-row"
                key={job.id}
                to={`/generation/${job.id}`}
              >
                <div>
                  <strong>{job.title}</strong>
                  <small>
                    {job.completedLectures}
                    {job.totalLectures ? ` / ${job.totalLectures}` : ""} 讲 ·{" "}
                    {
                      {
                        queued: "等待生成",
                        running: "正在生成",
                        completed: "可以学习",
                        failed: "暂未完成",
                        interrupted: "已中断",
                        cancelled: "已停止",
                      }[job.status]
                    }
                  </small>
                </div>
                <span>查看 →</span>
              </Link>
            ))
          ) : (
            <p className="mcp-setting-note">
              通过 Agent 创建的课程，会在这里显示。
            </p>
          )}
        </div>
      </section>
      {fresh && (
        <Modal
          title="保存连接凭证"
          onClose={() => {
            setFresh(null);
            setCopied("");
          }}
        >
          <div className="modal-body mcp-fresh-token">
            <p>将凭证保存到自己的 Agent 配置中。关闭后无法再次查看完整内容。</p>
            <Field label="访问凭证" htmlFor="mcp-fresh-token">
              <Input
                id="mcp-fresh-token"
                type="password"
                readOnly
                value={fresh.token}
                autoComplete="off"
              />
            </Field>
            <div className="mcp-fresh-actions">
              <Button icon={Copy} onClick={() => copy(fresh.token, "凭证")}>
                复制凭证
              </Button>
              <Button
                variant="primary"
                icon={Copy}
                onClick={() => copy(config(fresh.token), "接入配置")}
              >
                复制接入配置
              </Button>
            </div>
            {copied && <p role="status">已复制{copied}</p>}
          </div>
        </Modal>
      )}
    </>
  );
}
