import React from "react";
import {
  Check,
  ChevronDown,
  Globe,
  LoaderCircle,
  CircleAlert,
  Square,
} from "lucide-react";

function sourceLink(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url
      : null;
  } catch {
    return null;
  }
}

export function AssistantToolCalls({ calls = [], active = false }) {
  if (!calls.length) return null;
  return (
    <div className="assistant-tool-calls" aria-label="联网搜索记录">
      {calls.map((call) => {
        const status =
          call.status === "running" && !active ? "cancelled" : call.status;
        const running = status === "running";
        const Icon = running
          ? LoaderCircle
          : status === "failed"
            ? CircleAlert
            : status === "cancelled"
              ? Square
              : Check;
        const label = running
          ? "正在联网搜索"
          : status === "failed"
            ? "联网搜索失败"
            : status === "cancelled"
              ? "搜索已停止"
              : `已搜索 · ${call.sources?.length || 0} 个来源`;
        return (
          <details
            key={call.id}
            className={`assistant-tool-call is-${status}`}
            open={running || undefined}
          >
            <summary>
              <Globe size={15} />
              <span>{label}</span>
              <Icon size={14} className={running ? "tool-spin" : ""} />
              <ChevronDown size={14} className="tool-chevron" />
            </summary>
            <div className="assistant-tool-detail">
              <div className="tool-query-list">
                {call.queries.map((query) => (
                  <span key={query}>{query}</span>
                ))}
              </div>
              {call.error && <p className="tool-error">{call.error}</p>}
              {call.failedQueries?.length > 0 && (
                <p>部分检索词未返回结果：{call.failedQueries.join("、")}</p>
              )}
              {call.sources?.map((source) => {
                const url = sourceLink(source.url);
                return (
                  url && (
                    <a
                      key={source.url}
                      href={url.href}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <strong>{source.title}</strong>
                      <span>{url.hostname}</span>
                      <p>{source.snippet}</p>
                    </a>
                  )
                );
              })}
              {call.retrievedAt && (
                <small>
                  {call.engine} ·{" "}
                  {new Date(call.retrievedAt).toLocaleString("zh-CN")} ·
                  搜索摘要
                </small>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}
