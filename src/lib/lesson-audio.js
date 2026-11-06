// One audio player per classroom, with a bounded, account-scoped sentence cache.
export class LessonAudio {
  constructor(
    accountId,
    { fetcher = fetch, audioFactory = () => new Audio(), url = URL } = {},
  ) {
    this.accountId = accountId;
    this.fetcher = fetcher.bind(globalThis);
    this.audioFactory = audioFactory;
    this.url = url;
    this.cache = new Map();
    this.record = null;
    this.feedback = null;
    this.feedbackKey = null;
    this.disposed = false;
  }

  prepare(text, voice) {
    if (this.disposed)
      return Promise.reject(new DOMException("Cancelled", "AbortError"));
    const key = JSON.stringify([text, voice]);
    if (this.cache.has(key)) return this.cache.get(key).promise;
    const controller = new AbortController();
    const entry = { controller, url: null };
    entry.promise = this.fetcher("/api/tts/speech", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-Account-Id": this.accountId,
      },
      body: JSON.stringify({ text, voice }),
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(90000)]),
    })
      .then(async (response) => {
        if (!response.ok) {
          if (response.status === 401)
            window.dispatchEvent(new Event("knowra-auth-required"));
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || "语音生成失败，请重试。");
        }
        const blob = await response.blob();
        if (this.disposed || controller.signal.aborted)
          throw new DOMException("Cancelled", "AbortError");
        entry.url = this.url.createObjectURL(blob);
        this.trim();
        return entry.url;
      })
      .catch((error) => {
        this.cache.delete(key);
        throw error;
      });
    this.cache.set(key, entry);
    return entry.promise;
  }

  trim() {
    for (const [key, entry] of this.cache) {
      if (this.cache.size <= 48) break;
      if (
        !entry.url ||
        key === this.record?.key ||
        key === this.feedbackKey
      )
        continue;
      this.url.revokeObjectURL(entry.url);
      this.cache.delete(key);
    }
  }

  stopFeedback() {
    const audio = this.feedback;
    this.feedback = null;
    this.feedbackKey = null;
    if (!audio) return;
    audio.onended = audio.onerror = null;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }

  async playText(text, voice, rate = 1) {
    if (this.disposed || !text?.trim()) return false;
    const value = text.trim().slice(0, 600);
    this.stopFeedback();
    const url = await this.prepare(value, voice);
    if (this.disposed) return false;
    const audio = this.audioFactory();
    this.feedback = audio;
    this.feedbackKey = JSON.stringify([value, voice]);
    audio.src = url;
    audio.playbackRate = rate;
    audio.onended = () => {
      if (this.feedback === audio) {
        this.feedback = null;
        this.feedbackKey = null;
      }
    };
    audio.onerror = () => {
      if (this.feedback === audio) {
        this.feedback = null;
        this.feedbackKey = null;
      }
    };
    try {
      await audio.play();
      return true;
    } catch {
      if (this.feedback === audio) this.stopFeedback();
      return false;
    }
  }

  stop() {
    this.stopFeedback();
    const record = this.record;
    this.record = null;
    if (!record?.audio) return;
    record.audio.pause();
    record.audio.onended =
      record.audio.onerror =
      record.audio.onloadedmetadata =
        null;
    record.audio.removeAttribute("src");
    record.audio.load();
  }

  sync({
    text,
    voice,
    phase,
    elapsed,
    playing,
    rate,
    bufferTexts = [],
    onStatus,
    onError,
  }) {
    const key = JSON.stringify([text, voice]);
    if (this.record?.key !== key || this.record?.phase.index !== phase.index)
      this.stop();
    // No speech during the sentence's explicit silence or after its last pause.
    if (elapsed >= phase.speechEnd || !text.trim()) {
      if (!this.record) this.record = { key, phase, done: true };
      this.record?.audio?.pause();
      if (this.record) this.record.done = true;
      onStatus("ready");
      return;
    }
    if (!playing && !this.record) {
      onStatus("ready");
      return;
    }
    if (!this.record)
      this.record = { key, phase, audio: null, done: false, error: false };
    const record = this.record;
    record.playing = playing;
    record.rate = rate;
    record.elapsed = elapsed;
    record.onStatus = onStatus;
    record.onError = onError;
    const start = () => {
      if (this.disposed || this.record !== record || !record.audio) return;
      const audio = record.audio;
      audio.playbackRate = record.rate;
      if (!Number.isFinite(audio.duration) || !audio.duration) return;
      const fraction = Math.max(
        0,
        Math.min(
          1,
          (record.elapsed - phase.startTime) /
            (phase.speechEnd - phase.startTime),
        ),
      );
      audio.currentTime = fraction * audio.duration;
      record.done = false;
      if (!record.playing) {
        audio.pause();
        return;
      }
      record.onStatus("ready");
      audio.play().catch((reason) => {
        if (reason.name !== "AbortError") fail(reason);
      });
    };
    const fail = (error) => {
      if (this.disposed || this.record !== record || record.error) return;
      record.error = true;
      record.audio?.pause();
      record.onStatus("error");
      record.onError(
        error instanceof Error ? error : new Error("语音播放失败，请重试。"),
      );
      this.stop();
    };
    if (record.audio) {
      start();
      return;
    }
    if (record.loading) return;
    record.loading = true;
    onStatus("loading");
    this.prepare(text, voice)
      .then(async (source) => {
        if (this.disposed || this.record !== record) return source;
        // One startup buffer per teaching passage. Subsequent sentences play
        // directly from the queue, preserving only their deliberate pause.
        await Promise.all(
          bufferTexts.map((next) => this.prepare(next, voice).catch(() => {})),
        );
        return source;
      })
      .then((source) => {
        if (this.disposed || this.record !== record) return;
        const audio = this.audioFactory();
        record.audio = audio;
        audio.preload = "auto";
        audio.onloadedmetadata = start;
        audio.onended = () => {
          record.done = true;
        };
        audio.onerror = fail;
        audio.src = source;
        audio.load();
      })
      .catch(fail);
  }

  elapsed(previous, delta) {
    const record = this.record;
    if (!record) return previous;
    if (previous >= record.phase.speechEnd) return previous + delta;
    if (record.done) return record.phase.speechEnd;
    const audio = record.audio;
    if (!audio || !Number.isFinite(audio.duration) || !audio.duration)
      return previous;
    return Math.max(
      previous,
      record.phase.startTime +
        Math.min(1, audio.currentTime / audio.duration) *
          (record.phase.speechEnd - record.phase.startTime),
    );
  }

  dispose() {
    this.disposed = true;
    this.stop();
    for (const entry of this.cache.values()) {
      entry.controller.abort();
      if (entry.url) this.url.revokeObjectURL(entry.url);
    }
    this.cache.clear();
  }
}
