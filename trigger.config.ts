import { defineConfig } from "@trigger.dev/sdk";
import { pythonExtension } from "@trigger.dev/python/extension";
import { aptGet } from "@trigger.dev/build/extensions/core";

export default defineConfig({
  project: "proj_qjsdxdsoxmrgplspwuwj",
  runtime: "node",
  logLevel: "log",
  // The max compute seconds a task is allowed to run. If the task run exceeds this duration, it will be stopped.
  // You can override this on an individual task.
  // See https://trigger.dev/docs/runs/max-duration
  maxDuration: 600, // 10 minutes - suitable for document processing with OCR and annotations
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
      // Install system packages required for pdf2image
      aptGet({ packages: ["poppler-utils"] }),
      pythonExtension({
        // Path to requirements.txt file
        requirementsFile: "./requirements.txt",
        // Python binary path for development (uses relative path for portability)
        devPythonBinaryPath: "./venv/bin/python3",
      }),
    ],
  },
});
