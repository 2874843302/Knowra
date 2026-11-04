class KnowraVoiceRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(2048);
    this.position = 0;
    this.recording = true;
    this.port.onmessage = ({ data }) => {
      if (data.type === "flush") {
        this.recording = false;
        if (this.position)
          this.port.postMessage(this.buffer.slice(0, this.position));
        this.port.postMessage({ type: "flushed" });
      }
    };
  }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (!this.recording || !input) return true;
    for (const sample of input) {
      this.buffer[this.position++] = sample;
      if (this.position === this.buffer.length) {
        this.port.postMessage(this.buffer, [this.buffer.buffer]);
        this.buffer = new Float32Array(2048);
        this.position = 0;
      }
    }
    return true;
  }
}
registerProcessor("knowra-voice-recorder", KnowraVoiceRecorder);
