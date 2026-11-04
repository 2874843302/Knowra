export const MAX_RECORDING_SECONDS = 60;

export function appendVoiceText(draft, transcript) {
  const text = transcript.trim();
  if (!text) return draft;
  return draft ? `${draft}${/\s$/.test(draft) ? "" : " "}${text}` : text;
}

export function pcmWave(chunks, rate, maxSeconds = Infinity) {
  const count = Math.min(
    chunks.reduce((sum, chunk) => sum + chunk.length, 0),
    Math.floor(rate * maxSeconds),
  );
  const buffer = new ArrayBuffer(44 + count * 2),
    view = new DataView(buffer);
  const word = (at, text) =>
    Array.from(text).forEach((char, i) =>
      view.setUint8(at + i, char.charCodeAt(0)),
    );
  word(0, "RIFF");
  view.setUint32(4, 36 + count * 2, true);
  word(8, "WAVE");
  word(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  word(36, "data");
  view.setUint32(40, count * 2, true);
  let offset = 44;
  for (const chunk of chunks)
    for (const sample of chunk) {
      if (offset >= buffer.byteLength) break;
      const value = Math.max(-1, Math.min(1, sample));
      view.setInt16(
        offset,
        Math.round(value * (value < 0 ? 32768 : 32767)),
        true,
      );
      offset += 2;
    }
  return new Blob([buffer], { type: "audio/wav" });
}

// AudioWorklet captures mono PCM; it never plays microphone sound to the user.
export class VoiceRecorder {
  chunks = [];
  closed = false;
  async start(onInterrupted) {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (
      !navigator.mediaDevices?.getUserMedia ||
      !Audio ||
      !window.AudioWorkletNode
    )
      throw new Error(
        "当前浏览器不能录音，请使用新版 Chrome 或 Edge，并通过 HTTPS 或本机地址打开页面。",
      );
    this.context = new Audio({ sampleRate: 16000 });
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (this.closed) {
        this.release();
        return;
      }
      this.stream.getAudioTracks().forEach((track) => {
        track.onended = onInterrupted;
      });
      await this.context.audioWorklet.addModule(
        new URL("./voice-recorder.worklet.js", import.meta.url),
      );
      if (this.closed) {
        this.release();
        return;
      }
      this.node = new AudioWorkletNode(this.context, "knowra-voice-recorder");
      this.node.port.onmessage = ({ data }) => {
        if (data instanceof Float32Array && !this.closed)
          this.chunks.push(data);
        else if (data?.type === "flushed") this.flushed?.();
      };
      this.source = this.context.createMediaStreamSource(this.stream);
      this.source.connect(this.node);
      this.node.connect(this.context.destination);
      await this.context.resume();
    } catch (error) {
      this.cancel();
      throw error;
    }
  }
  async finish() {
    if (this.closed || !this.node)
      throw new DOMException("录音已取消", "AbortError");
    try {
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 500);
        this.flushed = () => {
          clearTimeout(timeout);
          resolve();
        };
        this.node.port.postMessage({ type: "flush" });
      });
      if (this.closed) throw new DOMException("录音已取消", "AbortError");
      return pcmWave(
        this.chunks,
        this.context.sampleRate,
        MAX_RECORDING_SECONDS,
      );
    } finally {
      this.cancel();
    }
  }
  release() {
    this.stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    this.source?.disconnect();
    this.node?.disconnect();
    if (this.node) this.node.port.onmessage = null;
    this.context?.close().catch(() => {});
  }
  cancel() {
    this.closed = true;
    this.release();
    this.chunks = [];
    this.flushed?.();
  }
}

export async function transcribeVoice(blob, signal) {
  const body = new FormData();
  body.append("file", blob, "question.wav");
  const response = await fetch("/api/asr/transcribe", {
    method: "POST",
    body,
    signal,
  });
  const result = await response
    .json()
    .catch(() => ({ error: "语音转写服务暂时不可用，请稍后重试。" }));
  if (!response.ok) {
    if (response.status === 401)
      window.dispatchEvent(new Event("knowra-auth-required"));
    throw new Error(result.error || "语音转写失败，请重新录音。");
  }
  if (typeof result.text !== "string")
    throw new Error("没有收到有效的转写文字，请重试。");
  return result.text.trim();
}

export function voiceError(error) {
  if (["NotAllowedError", "PermissionDeniedError"].includes(error.name))
    return "麦克风权限未开启，请在浏览器地址栏允许使用麦克风后重试。";
  if (["NotFoundError", "DevicesNotFoundError"].includes(error.name))
    return "没有找到麦克风，请连接设备后重试。";
  if (["NotReadableError", "TrackStartError"].includes(error.name))
    return "麦克风无法使用，可能正被其他应用占用。";
  if (error.name === "TypeError") return "语音服务连接失败，请检查网络后重试。";
  return error.message || "录音失败，请检查麦克风后重试。";
}
