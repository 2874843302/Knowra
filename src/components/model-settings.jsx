import React, { useState } from "react";
import { Check, Pencil, Plug, Plus, Save, Trash2 } from "lucide-react";
import { useStore } from "../store";
import { Button, Field, Input, PasswordInput } from "../design/primitives";
import { Modal } from "../ui";
import { InlineStatus } from "./ui/inline-status";

const empty = { name: "", baseUrl: "", model: "", apiKey: "" };

export function ModelSettings() {
  const { provider, refreshProvider, selectProvider } = useStore();
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(empty);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const profiles = provider.profiles || [];
  const open = (profile) => {
    setEditing(profile?.id || "new");
    setDraft(
      profile
        ? {
            name: profile.name,
            baseUrl: profile.baseUrl,
            model: profile.model,
            apiKey: "",
          }
        : empty,
    );
    setError("");
    setSaved("");
  };
  const perform = async (action, message) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setSaved("");
    try {
      await action();
      setSaved(message);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const request = async (method, path, body) => {
    const response = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    if (response.status === 401)
      window.dispatchEvent(new Event("knowra-auth-required"));
    if (!response.ok)
      throw new Error(data.error || "模型配置未能保存，请重试。");
    await refreshProvider(data);
  };
  const test = async (profile) => {
    if (testing) return;
    setTesting(profile.id);
    setError("");
    setSaved("");
    try {
      const response = await fetch("/api/provider/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: profile.id }),
      });
      const data = await response.json();
      if (response.status === 401)
        window.dispatchEvent(new Event("knowra-auth-required"));
      if (!response.ok) throw new Error(data.error || "连接失败，请检查配置。");
      setSaved(`连接正常：${data.model || profile.model}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setTesting("");
    }
  };
  const save = (event) => {
    event.preventDefault();
    perform(async () => {
      await request(editing === "new" ? "POST" : "PUT", "/api/provider", {
        ...draft,
        ...(editing !== "new" ? { id: editing } : {}),
      });
      setEditing(null);
      setDraft(empty);
    }, "模型配置已保存");
  };
  return (
    <section className="settings-section model-settings" id="ai">
      <div>
        <h2>AI 模型</h2>
        <p>保存多个模型，在对话中随时切换。</p>
        <Button
          size="sm"
          icon={Plus}
          disabled={busy || provider.loading}
          onClick={() => open(null)}
        >
          添加模型
        </Button>
      </div>
      <div className="settings-fields">
        {profiles.length > 0 && (
          <div className="model-settings-list" aria-label="已配置模型">
            {profiles.map((profile) => (
              <article key={profile.id} className="model-settings-item">
                <div>
                  <strong>{profile.name || profile.model}</strong>
                  <span>{profile.model}</span>
                  <small>{profile.baseUrl}</small>
                  <span
                    className={`model-connection ${profile.configured ? "is-ready" : ""}`}
                  >
                    {profile.configured ? "已保存密钥" : "缺少密钥"}
                  </span>
                </div>
                <div className="model-settings-actions">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Plug}
                    loading={testing === profile.id}
                    disabled={busy || !profile.configured}
                    onClick={() => test(profile)}
                  >
                    测试连接
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={
                      busy ||
                      !profile.configured ||
                      provider.activeId === profile.id
                    }
                    icon={provider.activeId === profile.id ? Check : undefined}
                    onClick={() =>
                      perform(
                        () => selectProvider(profile.id),
                        "默认模型已切换",
                      )
                    }
                  >
                    {provider.activeId === profile.id ? "默认模型" : "设为默认"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    icon={Pencil}
                    disabled={busy}
                    aria-label={`编辑${profile.name || profile.model}`}
                    onClick={() => open(profile)}
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    icon={Trash2}
                    disabled={busy}
                    aria-label={`删除${profile.name || profile.model}`}
                    onClick={() => {
                      setRemoving(profile);
                      setError("");
                    }}
                  />
                </div>
              </article>
            ))}
          </div>
        )}
        {!profiles.length && !editing && (
          <p className="model-settings-empty">
            添加模型接口，开始使用 AI 对话与课程生成。
          </p>
        )}
        {editing && (
          <form
            className="model-settings-form"
            onSubmit={save}
            onChange={() => {
              setError("");
              setSaved("");
            }}
          >
            <h3>{editing === "new" ? "添加模型" : "编辑模型"}</h3>
            <Field
              label="显示名称"
              htmlFor="ai-display-name"
              hint="可选，用于区分不同服务商或用途"
            >
              <Input
                id="ai-display-name"
                value={draft.name}
                maxLength={100}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="例如：日常讲解、深度推理"
              />
            </Field>
            <Field
              label="接口地址"
              htmlFor="ai-base-url"
              required
              hint="兼容 Chat Completions 的基础地址"
            >
              <Input
                id="ai-base-url"
                type="url"
                required
                maxLength={2000}
                value={draft.baseUrl}
                onChange={(e) =>
                  setDraft({ ...draft, baseUrl: e.target.value })
                }
                placeholder="https://你的服务地址/v1"
              />
            </Field>
            <Field
              label="模型名称"
              htmlFor="ai-model"
              hint="服务商提供的模型 ID；本地 DeepSeek 网页适配器可留空"
            >
              <Input
                id="ai-model"
                maxLength={200}
                value={draft.model}
                onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                placeholder="输入模型 ID"
              />
            </Field>
            <Field
              label="API 密钥"
              htmlFor="ai-key"
              hint="密钥仅保存在服务端；本地网页适配器无需填写"
            >
              <PasswordInput
                id="ai-key"
                autoComplete="new-password"
                maxLength={4000}
                value={draft.apiKey}
                onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
                placeholder={
                  editing === "new"
                    ? "输入 API 密钥"
                    : "已保存，留空保留此模型的密钥"
                }
              />
            </Field>
            <div className="settings-actions">
              <Button
                variant="primary"
                type="submit"
                icon={Save}
                loading={busy}
                disabled={busy}
              >
                保存模型
              </Button>
              <Button
                disabled={busy}
                onClick={() => {
                  setEditing(null);
                  setDraft(empty);
                  setError("");
                }}
              >
                取消
              </Button>
            </div>
          </form>
        )}
        <InlineStatus
          tone={busy ? "busy" : error ? "error" : saved ? "success" : "neutral"}
        >
          {busy ? "正在保存…" : error || saved}
        </InlineStatus>
      </div>
      {removing && (
        <Modal
          title="删除模型配置？"
          onClose={() => {
            if (!busy) setRemoving(null);
          }}
        >
          <div className="modal-body">
            删除“{removing.name || removing.model}”后，已有对话记录仍会保留。
            {error && <p role="alert">{error}</p>}
          </div>
          <div className="modal-footer">
            <Button disabled={busy} onClick={() => setRemoving(null)}>
              取消
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={() =>
                perform(async () => {
                  await request(
                    "DELETE",
                    `/api/provider/${encodeURIComponent(removing.id)}`,
                  );
                  if (editing === removing.id) {
                    setEditing(null);
                    setDraft(empty);
                  }
                  setRemoving(null);
                }, "模型配置已删除")
              }
            >
              删除模型
            </Button>
          </div>
        </Modal>
      )}
    </section>
  );
}
