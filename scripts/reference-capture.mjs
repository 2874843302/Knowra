import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const [target, name, width = "1440", height = "1000"] = process.argv.slice(2);
if (!target || !name)
  throw new Error("Supply the agent-owned target id and screenshot name");
const [port, path] = (
  await readFile(
    join(
      process.env.LOCALAPPDATA,
      "Google/Chrome/User Data/DevToolsActivePort",
    ),
    "utf8",
  )
)
  .trim()
  .split(/\r?\n/);
const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`);
await new Promise((resolve, reject) => {
  socket.onopen = resolve;
  socket.onerror = reject;
});
let sequence = 0;
const pending = new Map();
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject, timer } = pending.get(message.id);
    clearTimeout(timer);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  }
};
function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(
      () => reject(new Error(`${method} timed out`)),
      20000,
    );
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
}
try {
  const { sessionId } = await send("Target.attachToTarget", {
    targetId: target,
    flatten: true,
  });
  await send(
    "Emulation.setDeviceMetricsOverride",
    {
      width: Number(width),
      height: Number(height),
      deviceScaleFactor: 1,
      mobile: Number(width) < 768,
    },
    sessionId,
  );
  await send(
    "Runtime.evaluate",
    {
      expression:
        "Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 2000))]).then(() => document.body.getBoundingClientRect().width)",
      awaitPromise: true,
    },
    sessionId,
  );
  const { data } = await send(
    "Page.captureScreenshot",
    { format: "png", captureBeyondViewport: false },
    sessionId,
  );
  await writeFile(`screenshots/${name}.png`, Buffer.from(data, "base64"));
  console.log(`screenshots/${name}.png`);
  await send("Target.detachFromTarget", { sessionId });
} finally {
  socket.close();
}
