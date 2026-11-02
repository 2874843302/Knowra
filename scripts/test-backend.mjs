import { spawnSync } from "node:child_process";
import path from "node:path";

const python = path.resolve(
  ".venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
const result = spawnSync(python, ["-m", "pytest", "backend/tests", "-q"], {
  stdio: "inherit",
});
if (result.error)
  console.error(
    "Create .venv and install backend/requirements.lock.txt. See README.md.",
  );
process.exit(result.status ?? 1);
