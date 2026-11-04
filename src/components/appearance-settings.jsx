import React from "react";
import { Check, BookOpen, RotateCcw } from "lucide-react";
import { appearanceThemes, resolveTheme } from "../lib/appearance-themes";
import { useStore } from "../store";
import { Button } from "../ui";
import { InlineStatus } from "./ui/inline-status";

export function AppearanceSettings() {
  const { state, setState, sync, retrySync } = useStore();
  const selected = resolveTheme(state.appearance?.theme);
  const choose = (theme) =>
    setState((s) => ({ ...s, appearance: { ...s.appearance, theme } }));
  return (
    <section className="settings-section appearance-settings">
      <div className="appearance-heading">
        <div>
          <h2>界面风格</h2>
          <p>选一种让你愿意停留的样子。</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={RotateCcw}
          disabled={selected.id === "watercolor"}
          onClick={() => choose("watercolor")}
        >
          恢复水彩
        </Button>
      </div>
      <div className="theme-options" role="radiogroup" aria-label="界面风格">
        {appearanceThemes.map((theme) => {
          const p = theme.palette;
          return (
            <label
              key={theme.id}
              className="theme-option"
              data-selected={selected.id === theme.id}
            >
              <input
                type="radio"
                name="appearance-theme"
                value={theme.id}
                checked={selected.id === theme.id}
                onChange={() => choose(theme.id)}
                aria-label={theme.name}
              />
              <span
                className={`theme-preview preview-${theme.id}`}
                aria-hidden="true"
                style={{
                  "--preview-canvas": p.canvas,
                  "--preview-surface": p.surface,
                  "--preview-ink": p.ink,
                  "--preview-muted": p.muted,
                  "--preview-accent": p.accent,
                  "--preview-soft": p.soft,
                  "--preview-border": p.border,
                  "--preview-on-accent": p.onAccent,
                  "--preview-radius": `${Math.round(theme.radius * 0.5)}px`,
                  "--preview-font": theme.editorial
                    ? '"EB Garamond", ChillDuanHeiSong, serif'
                    : "var(--font-sans)",
                }}
              >
                <span className="theme-preview-sidebar">
                  <BookOpen size={15} />
                  <i />
                  <i />
                  <i />
                </span>
                <span className="theme-preview-content">
                  <span className="theme-preview-greeting">
                    一点好奇，慢慢展开
                  </span>
                  <span className="theme-preview-lesson">
                    <BookOpen size={22} />
                    <strong>让知识，长成自己的理解</strong>
                    <span>从一个好问题开始。</span>
                    <b>继续学习</b>
                  </span>
                </span>
              </span>
              <span className="theme-option-copy">
                <span>
                  <strong>{theme.name}</strong>
                  <span className="theme-selected-mark">
                    {selected.id === theme.id && <Check size={15} />}
                  </span>
                </span>
                <span>{theme.description}</span>
              </span>
            </label>
          );
        })}
      </div>
      <div className="appearance-footer">
        <span>当前使用：{selected.name} · 即时生效，自动保存到账号</span>
        <InlineStatus
          tone={
            sync.status === "error"
              ? "error"
              : sync.status === "saving"
                ? "busy"
                : "neutral"
          }
        >
          {sync.status === "error"
            ? "暂存本机，等待同步"
            : sync.status === "saving"
              ? "正在保存…"
              : ""}
        </InlineStatus>
        {sync.status === "error" && (
          <Button size="sm" variant="ghost" onClick={retrySync}>
            重试保存
          </Button>
        )}
      </div>
    </section>
  );
}
