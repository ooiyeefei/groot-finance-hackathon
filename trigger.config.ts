import { defineConfig } from "@trigger.dev/sdk/v3";
import { pythonExtension } from "@trigger.dev/python/extension";

export default defineConfig({
  project: "proj_qjsdxdsoxmrgplspwuwj",
  runtime: "node",
  logLevel: "log",
  // The max compute seconds a task is allowed to run. If the task run exceeds this duration, it will be stopped.
  // You can override this on an individual task.
  // See https://trigger.dev/docs/runs/max-duration
  maxDuration: 3600,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  dirs: ["src/trigger"],
  build: {
    extensions: [
      pythonExtension({
        // Path to requirements.txt file
        requirementsFile: "./requirements.txt",
        // Python scripts to include
        scripts: ["src/python/**/*.py"],
        // Python binary path for development (uses virtual environment)
        devPythonBinaryPath: "./venv/bin/python3",
      }),
    ],
  },
});
