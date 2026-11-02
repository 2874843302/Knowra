import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const windows = process.platform === "win32";
const python = path.join(
  root,
  ".venv",
  windows ? "Scripts/python.exe" : "bin/python",
);
if (!existsSync(python)) {
  console.error(
    "Create .venv and install backend/requirements.txt first. See README.md.",
  );
  process.exit(1);
}
const dev = process.argv.includes("--dev");
const backend = spawn(
  python,
  [
    "-m",
    "uvicorn",
    "app.main:app",
    "--app-dir",
    "backend",
    "--host",
    "127.0.0.1",
    "--port",
    dev ? "8000" : process.env.PORT || "5173",
  ],
  { stdio: "inherit" },
);
const vite = dev
  ? spawn(
      process.execPath,
      [
        "node_modules/vite/bin/vite.js",
        "--host",
        "127.0.0.1",
        "--port",
        "5173",
        "--strictPort",
      ],
      { stdio: "inherit" },
    )
  : null;
const stop = () => {
  backend.kill();
  vite?.kill();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
backend.on("exit", (code) => {
  vite?.kill();
  process.exitCode = code ?? 1;
});
vite?.on("exit", () => backend.kill());
