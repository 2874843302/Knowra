// Adapted from EasyUI Chat (MIT), Copyright (c) 2026 Suraj Maurya.
// Source: https://www.easyui.site/source/chat.json
// Compound chat, message motion and auto-growing composer use Knowra's controls.
// Auto-follow stays within the chat viewport and respects readers scrolling back.
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowDown, MessageSquare } from "lucide-react";
import { Button } from "../../ui";
import { Textarea } from "./textarea";
import { SpotlightSurface } from "./spotlight-surface";
import { cn } from "../../lib/utils";

const ChatContext = createContext(null);
export function useChat() {
  const value = useContext(ChatContext);
  if (!value) throw new Error("Chat parts must be used inside Chat");
  return value;
}

export function Chat({
  as: Component = "div",
  messages = [],
  isGenerating = false,
  onSendMessage,
  className,
  children,
  ...props
}) {
  return (
    <ChatContext.Provider value={{ messages, isGenerating, onSendMessage }}>
      <Component
        className={cn("easy-chat", className)}
        data-slot="chat"
        {...props}
      >
        {children}
      </Component>
    </ChatContext.Provider>
  );
}

export function ChatHeader({ title = "即时协助", modelName, children }) {
  return (
    <header className="easy-chat-header">
      <MessageSquare size={18} aria-hidden="true" />
      <div>
        <h1>{title}</h1>
        {modelName && <span>{modelName}</span>}
      </div>
      {children}
    </header>
  );
}

export function ChatMessages({ children, className }) {
  const { messages, isGenerating } = useChat();
  const viewport = useRef(null);
  const content = useRef(null);
  const follow = useRef(true);
  const measured = useRef({ height: 0, scrollHeight: 0 });
  const [atBottom, setAtBottom] = useState(true);
  useEffect(() => {
    const node = viewport.current;
    const observer = new ResizeObserver(() => {
      if (follow.current) node.scrollTop = node.scrollHeight;
      measured.current = {
        height: node.clientHeight,
        scrollHeight: node.scrollHeight,
      };
      setAtBottom(node.scrollHeight - node.scrollTop - node.clientHeight < 70);
    });
    observer.observe(content.current);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (follow.current)
      viewport.current.scrollTop = viewport.current.scrollHeight;
  }, [messages.length, isGenerating]);
  const latest = () => {
    follow.current = true;
    viewport.current.scrollTop = viewport.current.scrollHeight;
    setAtBottom(true);
  };
  return (
    <div className="easy-chat-viewport-wrap">
      <div
        className={cn("easy-chat-messages", className)}
        ref={viewport}
        role="region"
        aria-label="对话记录"
        tabIndex={0}
        onWheel={(event) => {
          if (event.deltaY < 0 && viewport.current.scrollTop > 0) {
            follow.current = false;
            setAtBottom(false);
          }
        }}
        onKeyDown={(event) => {
          if (
            ["ArrowUp", "PageUp", "Home"].includes(event.key) &&
            viewport.current.scrollTop > 0
          ) {
            follow.current = false;
            setAtBottom(false);
          }
        }}
        onScroll={() => {
          const node = viewport.current;
          // A growing composer can fire scroll before ResizeObserver. Preserve
          // the reader's intent until the resize has restored the bottom edge.
          if (
            node.clientHeight !== measured.current.height ||
            node.scrollHeight !== measured.current.scrollHeight
          )
            return;
          follow.current =
            node.scrollHeight - node.scrollTop - node.clientHeight < 70;
          setAtBottom(follow.current);
        }}
      >
        <div ref={content} className="easy-chat-message-list">
          {children}
        </div>
      </div>
      {!atBottom && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="easy-chat-latest"
          icon={ArrowDown}
          onClick={latest}
        >
          回到最新
        </Button>
      )}
    </div>
  );
}

export function ChatMessage({ author, avatar, scope, children, className }) {
  const reduced = useReducedMotion();
  return (
    <motion.article
      className={cn("chat-message user easy-chat-user", className)}
      initial={reduced ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 34, mass: 0.7 }}
    >
      <span className="message-avatar" aria-hidden="true">
        {avatar}
      </span>
      <div className="message-body">
        <small>{author}</small>
        {scope && <small className="assistant-message-scope">{scope}</small>}
        <p className="user-message-text">{children}</p>
      </div>
    </motion.article>
  );
}

export function ChatComposer({
  value,
  onValueChange,
  inputRef,
  leading,
  children,
  className,
  placeholder = "想弄明白什么？从这里开始…",
  onSubmit,
  ...props
}) {
  const { onSendMessage } = useChat();
  const fallbackInput = useRef(null);
  const field = inputRef || fallbackInput;
  useEffect(() => {
    const node = field.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 180)}px`;
  }, [value, field]);
  const send = (event) => {
    event?.preventDefault();
    if (onSubmit) onSubmit(event);
    else onSendMessage?.(value);
  };
  return (
    <SpotlightSurface
      as="form"
      className={cn("easy-chat-composer", className)}
      onSubmit={send}
      {...props}
    >
      {leading}
      <Textarea
        ref={field}
        aria-label="输入问题"
        className="flex-1 resize-none rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder}
        rows={1}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          )
            send(event);
        }}
      />
      {children}
    </SpotlightSurface>
  );
}
