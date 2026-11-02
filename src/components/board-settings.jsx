import React, { useState } from "react";
import { NARRATION_RATES } from "../lib/speech-preferences";
import * as Popover from "@radix-ui/react-popover";
import {
  Settings2,
  X,
  Minus,
  Plus,
  RotateCcw,
  SkipBack,
  SkipForward,
  Bookmark,
  Download,
  BookOpen,
  PenLine,
} from "lucide-react";
import { Button, IconButton } from "../design/primitives";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

export const boardFonts = [
  { id: "hand", label: "手写板书", family: "var(--font-board-hand)" },
  { id: "sans", label: "清晰黑体", family: "var(--font-sans)" },
  { id: "serif", label: "书卷宋体", family: "ChillDuanHeiSong, SimSun, serif" },
];

export function BoardSettings({
  font,
  onFontChange,
  mode,
  onModeChange,
  zoom,
  onZoomChange,
  playback,
  clipCount,
  onClips,
  onDownload,
}) {
  const [open, setOpen] = useState(false);
  const action = (callback) => {
    callback();
    setOpen(false);
  };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <IconButton icon={Settings2} label="白板设置" tooltip={false} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="board-settings"
          side="bottom"
          align="end"
          sideOffset={12}
          collisionPadding={16}
          aria-label="白板设置"
        >
          <div className="board-settings-heading">
            <h2>白板设置</h2>
            <Popover.Close asChild>
              <IconButton icon={X} label="关闭白板设置" tooltip={false} />
            </Popover.Close>
          </div>
          <div className="board-settings-section">
            <h3>显示</h3>
            <div className="board-settings-row">
              <span>内容视图</span>
              <Tabs value={mode} onValueChange={onModeChange}>
                <TabsList aria-label="讲义显示方式">
                  <TabsTrigger value="board" aria-label="连续白板">
                    <PenLine size={13} />
                    白板
                  </TabsTrigger>
                  <TabsTrigger value="reading" aria-label="连续讲义">
                    <BookOpen size={13} />
                    讲义
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="board-settings-row">
              <label htmlFor="board-settings-font">板书字体</label>
              <Select value={font.id} onValueChange={onFontChange}>
                <SelectTrigger
                  id="board-settings-font"
                  size="sm"
                  aria-label="白板字体"
                >
                  <SelectValue>{font.label}</SelectValue>
                </SelectTrigger>
                <SelectContent className="board-font-menu">
                  {boardFonts.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      <span className="board-font-option">
                        <span>{item.label}</span>
                        <span
                          className="board-font-preview"
                          style={{ fontFamily: item.family }}
                        >
                          向量与空间 Aa 123
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="board-settings-row">
              <span>画布缩放</span>
              <div className="board-settings-zoom">
                <IconButton
                  icon={Minus}
                  label="缩小白板"
                  tooltip={false}
                  disabled={zoom <= 70}
                  onClick={() => onZoomChange(Math.max(70, zoom - 10))}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onZoomChange(100)}
                  aria-label="重置缩放"
                >
                  {zoom}%
                </Button>
                <IconButton
                  icon={Plus}
                  label="放大白板"
                  tooltip={false}
                  disabled={zoom >= 140}
                  onClick={() => onZoomChange(Math.min(140, zoom + 10))}
                />
              </div>
            </div>
          </div>
          <div className="board-settings-section">
            <h3>讲解</h3>
            <div className="board-settings-row">
              <label htmlFor="board-settings-rate">播放速度</label>
              <Select
                value={String(playback.rate)}
                onValueChange={(value) => playback.setRate(Number(value))}
              >
                <SelectTrigger
                  id="board-settings-rate"
                  size="sm"
                  aria-label="讲解速度"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NARRATION_RATES.map((rate) => (
                    <SelectItem key={rate} value={String(rate)}>
                      {rate}×
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="board-settings-row">
              <span id="board-settings-voice">讲解朗读</span>
              <button
                type="button"
                className="board-settings-switch"
                role="switch"
                aria-labelledby="board-settings-voice"
                aria-checked={playback.voice}
                onClick={playback.toggleVoice}
              >
                <span />
              </button>
            </div>
            <div className="board-settings-row">
              <label htmlFor="board-settings-speaker">讲解音色</label>
              <Select
                value={playback.voiceId}
                onValueChange={playback.setVoiceId}
                disabled={!playback.speechService?.ready}
              >
                <SelectTrigger
                  id="board-settings-speaker"
                  size="sm"
                  aria-label="讲解音色"
                >
                  <SelectValue placeholder="正在连接语音" />
                </SelectTrigger>
                <SelectContent>
                  {(playback.speechService?.voices || []).map((voice) => (
                    <SelectItem key={voice.id} value={voice.id}>
                      {voice.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="board-settings-speech-status" role="status">
              {playback.speechStatus === "loading"
                ? "正在准备讲解语音…"
                : playback.speechService?.ready
                  ? playback.voiceId === "friendly-female"
                    ? "高品质音色 · 准备时间较长"
                    : "流畅优先 · 本地语音"
                  : playback.speechService?.message || "正在连接语音服务…"}
            </p>
            <div className="board-settings-navigation">
              <Button
                size="sm"
                variant="ghost"
                icon={SkipBack}
                disabled={!playback.index}
                onClick={() => action(() => playback.seek(playback.index - 1))}
              >
                上一步讲解
              </Button>
              <Button
                size="sm"
                variant="ghost"
                iconRight={SkipForward}
                disabled={playback.last || playback.waiting}
                onClick={() => action(() => playback.seek(playback.index + 1))}
              >
                下一步讲解
              </Button>
            </div>
          </div>
          <div className="board-settings-actions">
            <Button
              variant="ghost"
              size="sm"
              icon={Bookmark}
              onClick={() => action(onClips)}
            >
              查看摘录<span className="board-settings-count">{clipCount}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={Download}
              onClick={() => action(onDownload)}
            >
              下载本节讲义
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={RotateCcw}
              onClick={() => action(playback.replay)}
            >
              重新讲解
            </Button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
