# Python Setup for Trigger.dev

This document explains the Python virtual environment setup for Trigger.dev background jobs.

## Overview

Our Trigger.dev setup uses the **optimal hybrid approach** recommended in the official documentation:

- **Development**: Isolated Python virtual environment (`.venv/`)
- **Production**: Automatic requirements.txt installation via Trigger.dev
- **Best Practice**: No global Python pollution, consistent dependencies

## Configuration

### `trigger.config.ts`
```typescript
pythonExtension({
  requirementsFile: "./requirements.txt",        // 📦 Production: Auto-installs packages
  devPythonBinaryPath: "./.venv/bin/python3",   // 🔧 Development: Isolated environment
  scripts: ["./src/python/**/*.py"],            // 📁 Copies Python scripts to build
}),
```

### `requirements.txt`
Contains all Python dependencies needed for:
- PDF processing (`pdf2image`)
- AI/ML workflows (`dspy-ai`, `google-generativeai`)
- Image processing (`numpy`, `Pillow`)
- Core utilities (`requests`, `pydantic`)

## Quick Setup

### Automated Setup (Recommended)
```bash
npm run setup:python
```

This script:
- ✅ Creates `.venv/` if it doesn't exist
- ✅ Installs/updates all requirements.txt dependencies
- ✅ Verifies core packages are working
- ✅ Handles errors gracefully

### Manual Setup
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Build Process Integration

### Full Build Command
```bash
npm run build:full
```

This runs:
1. `npm run clean` - Removes `.next/` directory
2. `npm run setup:python` - Sets up Python environment
3. `npm install` - Installs Node.js dependencies
4. `npm run build` - Builds Next.js application
5. `npm run dev` - Starts development server

### Individual Scripts
```bash
npm run clean          # Remove .next directory
npm run setup:python   # Setup Python virtual environment
npm run build          # Standard Next.js build
npm run dev            # Start development server
```

## Why This Approach?

### ✅ Benefits
- **Isolation**: Python packages don't pollute system Python
- **Consistency**: Same environment across team members
- **Production Ready**: Trigger.dev handles production installs automatically
- **Error Prevention**: Prevents "spawn python ENOENT" errors
- **Documentation**: Requirements.txt serves as dependency documentation

### 🚫 Alternative Approaches (Why We Don't Use Them)

**Global Python Installation:**
- ❌ Pollutes system Python
- ❌ Version conflicts between projects
- ❌ Difficult to reproduce environments

**Requirements File Only:**
- ❌ Manual pip install required in development
- ❌ No isolation from system packages
- ❌ Inconsistent between team members

## Troubleshooting

### "spawn python ENOENT" Error
**Solution**: Run `npm run setup:python` to create virtual environment

### Package Import Errors
**Solution**: Verify virtual environment is activated and packages installed:
```bash
./.venv/bin/python3 -c "import numpy, requests, PIL; print('✅ Packages OK')"
```

### Build Failures
**Solution**: Ensure Python 3.7+ is installed system-wide:
```bash
python3 --version  # Should show Python 3.7+
```

## Files Structure

```
.venv/                          # Python virtual environment
├── bin/python3                 # Python executable used by Trigger.dev
├── lib/python3.13/site-packages/  # Installed packages
└── ...

scripts/setup-python.sh        # Automated setup script
requirements.txt               # Python dependencies
trigger.config.ts              # Trigger.dev configuration
src/python/                    # Python scripts for background jobs
├── annotate_image.py          # OpenCV image annotation
└── ...
```

## Production Deployment

In production, Trigger.dev automatically:
1. Reads `requirements.txt`
2. Installs packages in build environment
3. Makes packages available to background jobs
4. Ignores `devPythonBinaryPath` (development only)

No additional configuration needed! 🎉

---

**Last Updated**: 2025-01-17
**Trigger.dev Version**: v4.0.4
**Python Version**: 3.13.3