import { defineConfig } from "@trigger.dev/sdk/v3";
import { pythonExtension } from "@trigger.dev/python/extension";
import { aptGet } from "@trigger.dev/build/extensions/core";

/**
 * Trigger.dev Configuration
 *
 * Sentry integration for Trigger.dev tasks:
 * - Sentry is initialized in src/trigger/utils/sentry-wrapper.ts
 * - Use withSentry() wrapper or manual captureTaskException() in tasks
 * - @see specs/003-sentry-integration/plan.md Phase 4
 */

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
      aptGet({
        packages: [
          "poppler-utils",  // Provides pdftoppm for pdf2image
          "python3-dev",   // Python development headers
          "build-essential" // Compilation tools for native packages
        ]
      }),
      pythonExtension({
        // Path to requirements.txt file
        requirementsFile: "./requirements.txt",
        // Use local Python virtual environment for development
        devPythonBinaryPath: "./.venv/bin/python3",
        // Copy Python script files to build environment
        scripts: ["./src/python/**/*.py"],
      }),
    ],
  },
});
