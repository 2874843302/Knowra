// Adapted from EasyUI AIResponse (MIT), Copyright (c) 2026 Suraj Maurya.
// Source: https://www.easyui.site/source/ai-response.json
// Keep the compound API, response states, copy lifecycle and source disclosure;
// use Knowra tokens, shared controls and its full GFM parser instead of demo styles.
import React, {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { motion, useReducedMotion } from "motion/react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { Button } from "../../ui";
import { cn } from "../../lib/utils";
import { safeResponseHref } from "../../lib/response-links";
import { DisclosureContent } from "./disclosure";

const ResponseContext = createContext(null);
function useResponse() {
  const value = useContext(ResponseContext);
  if (!value)
    throw new Error("AIResponse parts must be used inside AIResponse");
  return value;
}

function useCopy() {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setError("");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("浏览器未允许复制，可选中文字后复制。");
    }
  }
  return { copied, error, copy };
}

export function ResponseCodeBlock({ language = "text", code }) {
  const { copied, error, copy } = useCopy();
  return (
    <div className="ai-response-code">
      <div className="ai-response-code-bar">
        <span>{language}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={copied ? Check : Copy}
          onClick={() => copy(code)}
          aria-label={copied ? "代码已复制" : "复制代码"}
        >
          {copied ? "已复制" : "复制代码"}
        </Button>
      </div>
      <pre tabIndex={0} aria-label={`${language} 代码`}>
        <code className={`language-${language}`}>{code}</code>
      </pre>
      {error && (
        <small className="ai-response-copy-error" role="status">
          {error}
        </small>
      )}
    </div>
  );
}

const markdownComponents = {
  pre: ({ children }) => {
    const child = React.Children.toArray(children)[0];
    if (!React.isValidElement(child)) return <pre>{children}</pre>;
    return (
      <ResponseCodeBlock
        language={
          /language-([^\s]+)/.exec(child.props.className || "")?.[1] || "text"
        }
        code={String(child.props.children || "").replace(/\n$/, "")}
      />
    );
  },
  table: ({ children, ...props }) => {
    const { node, ...rest } = props;
    return (
      <div
        className="assistant-table-wrap ai-response-table"
        role="region"
        aria-label="回答中的表格"
        tabIndex={0}
      >
        <table {...rest}>{children}</table>
      </div>
    );
  },
  a: ({ href, children }) => {
    const safe = safeResponseHref(href);
    if (!safe) return <span>{children}</span>;
    const external = /^https?:\/\//i.test(safe) || safe.startsWith("//");
    return (
      <a
        href={safe}
        {...(external
          ? { target: "_blank", rel: "noopener noreferrer nofollow ugc" }
          : {})}
      >
        {children}
      </a>
    );
  },
  img: ({ alt }) => <span>{alt || "图片"}</span>,
};

export function AIResponseHeader({ title = "知序导师", statusLabel }) {
  const { status, modelName } = useResponse();
  const busy = status === "generating" || status === "streaming";
  return (
    <header className="ai-response-header">
      <span className="ai-response-author">
        <Sparkles size={16} aria-hidden="true" />
        <strong>{title}</strong>
        {modelName && <small>{modelName}</small>}
      </span>
      <span className="ai-response-status" role="status" aria-live="polite">
        {busy && (
          <span className="ai-response-orbit" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        )}
        {statusLabel ||
          {
            generating: "正在思考…",
            streaming: "正在回复…",
            cancelled: "已停止",
            error: "回复未完成",
          }[status]}
      </span>
    </header>
  );
}

export function AIResponseContent() {
  const { content, status } = useResponse();
  if (status === "generating" && !content)
    return (
      <div className="ai-response-skeleton" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
    );
  if (!content) return null;
  return (
    <div
      className="markdown ai-response-content"
      aria-busy={status === "streaming"}
    >
      <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </Markdown>
      {status === "streaming" && (
        <span className="ai-response-caret" aria-hidden="true" />
      )}
    </div>
  );
}

export function AIResponseSources() {
  const { sources } = useResponse();
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!sources.length) return null;
  return (
    <div className="ai-response-sources">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronDown
          size={14}
          style={{ transform: open ? "rotate(180deg)" : undefined }}
        />
        参考来源 <span>{sources.length}</span>
      </Button>
      <DisclosureContent open={open} id={id}>
        <ol>
          {sources.map((source, index) => {
            const href = safeResponseHref(source.url);
            const web =
              href && /^https?:\/\//i.test(new URL(href, location.origin).href);
            const body = (
              <>
                <strong>{source.title}</strong>
                {source.snippet && <span>{source.snippet}</span>}
              </>
            );
            return (
              <li key={source.id || source.url || index}>
                {web ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer nofollow ugc"
                  >
                    {body}
                    <ExternalLink size={13} />
                  </a>
                ) : (
                  <div>{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      </DisclosureContent>
    </div>
  );
}

export function AIResponseActions() {
  const { content, status, feedback, onFeedback, onExport } = useResponse();
  const { copied, error, copy } = useCopy();
  if (!content || !["complete", "cancelled"].includes(status)) return null;
  return (
    <div className="assistant-message-actions ai-response-actions">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        icon={copied ? Check : Copy}
        onClick={() => copy(content)}
      >
        {copied ? "已复制" : "复制回答"}
      </Button>
      {onExport && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={Download}
          onClick={() => onExport(content)}
        >
          导出笔记
        </Button>
      )}
      {onFeedback && (
        <div className="ai-response-feedback">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="这个回答有帮助"
            aria-pressed={feedback === "like"}
            onClick={() => onFeedback(feedback === "like" ? null : "like")}
          >
            <ThumbsUp size={15} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="这个回答需要改进"
            aria-pressed={feedback === "dislike"}
            onClick={() =>
              onFeedback(feedback === "dislike" ? null : "dislike")
            }
          >
            <ThumbsDown size={15} />
          </Button>
        </div>
      )}
      <span className="sr-only" role="status">
        {copied ? "回答已复制" : ""}
      </span>
      {error && (
        <small className="ai-response-copy-error" role="status">
          {error}
        </small>
      )}
    </div>
  );
}

export function AIResponse({
  content = "",
  status = "complete",
  modelName,
  sources = [],
  title,
  statusLabel,
  feedback,
  onFeedback,
  onExport,
  className,
  children,
}) {
  const reduced = useReducedMotion();
  return (
    <ResponseContext.Provider
      value={{
        content,
        status,
        modelName,
        sources,
        feedback,
        onFeedback,
        onExport,
      }}
    >
      <motion.article
        className={cn("ai-response", className)}
        data-slot="ai-response"
        data-status={status}
        aria-label="AI 回答"
        aria-busy={status === "generating" || status === "streaming"}
        initial={reduced ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduced ? 0 : 0.18 }}
      >
        <AIResponseHeader title={title} statusLabel={statusLabel} />
        <AIResponseContent />
        {children}
        <AIResponseSources />
        <AIResponseActions />
      </motion.article>
    </ResponseContext.Provider>
  );
}
