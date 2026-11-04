import React, { useEffect, useRef, useState } from "react";
import { Mic, Square, X, LoaderCircle } from "lucide-react";
import { Button } from "../ui";
import { accountRequest } from "../auth";
import {
  VoiceRecorder,
  transcribeVoice,
  voiceError,
  MAX_RECORDING_SECONDS,
} from "../lib/voice-input";

export function VoiceInput({
  disabled = false,
  onTranscript,
  onBusyChange,
  onStart,
  inputRef,
}) {
  const [phase, setPhase] = useState("idle"),
    [seconds, setSeconds] = useState(0),
    [message, setMessage] = useState("");
  const session = useRef(0),
    recorder = useRef(null),
    request = useRef(null),
    timer = useRef(null),
    finishing = useRef(false);
  const handlers = useRef({ onTranscript, onBusyChange, onStart });
  handlers.current = { onTranscript, onBusyChange, onStart };
  const active = phase !== "idle";
  const clear = () => {
    clearInterval(timer.current);
    request.current?.abort();
    recorder.current?.cancel();
  };
  const cancel = () => {
    session.current++;
    clear();
    setPhase("idle");
    setMessage("");
    handlers.current.onBusyChange?.(false);
  };
  useEffect(() => {
    if (disabled) cancel();
  }, [disabled]);
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) cancel();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      session.current++;
      clear();
      handlers.current.onBusyChange?.(false);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  const finish = async () => {
    if (finishing.current) return;
    finishing.current = true;
    const token = session.current;
    clearInterval(timer.current);
    setPhase("transcribing");
    setMessage("");
    try {
      const blob = await recorder.current.finish();
      if (token !== session.current) return;
      const text = await transcribeVoice(blob, request.current.signal);
      if (token !== session.current) return;
      if (!text) setMessage("没有听清问题，请靠近麦克风重新说一遍。");
      else {
        handlers.current.onTranscript(text);
        inputRef?.current?.focus();
      }
    } catch (error) {
      if (token === session.current && error.name !== "AbortError")
        setMessage(voiceError(error));
    } finally {
      if (token === session.current) {
        setPhase("idle");
        handlers.current.onBusyChange?.(false);
      }
    }
  };
  const start = async () => {
    const token = ++session.current;
    finishing.current = false;
    setPhase("preparing");
    setMessage("");
    setSeconds(0);
    handlers.current.onBusyChange?.(true);
    request.current = new AbortController();
    try {
      const service = await accountRequest("/asr/status", {
        signal: request.current.signal,
      });
      if (token !== session.current) return;
      if (!service.ready) throw new Error(service.message);
      handlers.current.onStart?.();
      recorder.current = new VoiceRecorder();
      await recorder.current.start(() => {
        if (token === session.current) {
          cancel();
          setMessage("麦克风连接已断开，请检查设备后重试。");
        }
      });
      if (token !== session.current) return;
      setPhase("recording");
      const began = performance.now();
      timer.current = setInterval(() => {
        const elapsed = Math.floor((performance.now() - began) / 1000);
        setSeconds(Math.min(elapsed, MAX_RECORDING_SECONDS));
        if (elapsed >= MAX_RECORDING_SECONDS) finish();
      }, 200);
    } catch (error) {
      if (token !== session.current) return;
      clear();
      setPhase("idle");
      handlers.current.onBusyChange?.(false);
      if (error.name !== "AbortError") setMessage(voiceError(error));
    }
  };
  const recording = phase === "recording";
  const label = recording
    ? "结束录音并转文字"
    : phase === "transcribing"
      ? "正在转写语音"
      : phase === "preparing"
        ? "正在开启麦克风"
        : "语音输入";
  return (
    <div
      className={`voice-input is-${phase}`}
      data-voice-state={phase}
      onKeyDown={(event) => {
        if (event.key === "Escape" && active) {
          event.preventDefault();
          event.stopPropagation();
          cancel();
        }
      }}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="voice-input-toggle"
        aria-label={label}
        title={label}
        aria-pressed={recording}
        disabled={disabled || (active && !recording)}
        onClick={recording ? finish : start}
      >
        {recording ? (
          <Square size={15} fill="currentColor" />
        ) : active ? (
          <LoaderCircle size={17} className="tool-spin" />
        ) : (
          <Mic size={17} />
        )}
      </Button>
      {recording && (
        <span className="voice-input-time" aria-label={`已录音 ${seconds} 秒`}>
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
        </span>
      )}
      {active && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="voice-input-cancel"
          aria-label="取消语音输入"
          onClick={cancel}
        >
          <X size={15} />
        </Button>
      )}
      {(active || message) && (
        <div
          className={`voice-input-feedback ${message ? "is-error" : ""}`}
          role={message ? "alert" : "status"}
        >
          <span>
            {message ||
              (recording
                ? "正在听，点击方块结束 · 最长 60 秒"
                : phase === "preparing"
                  ? "正在开启麦克风，请允许录音…"
                  : "正在转为文字…")}
          </span>
          {message && (
            <button
              type="button"
              aria-label="关闭语音提示"
              onClick={() => setMessage("")}
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
