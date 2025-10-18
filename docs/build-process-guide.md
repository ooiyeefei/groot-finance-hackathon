# Build Process Guide

## Current Python Setup Status ✅

Your Python setup is **already optimal** according to Trigger.dev documentation! We're using the recommended **hybrid approach**:

- **Production**: Automatic `requirements.txt` installation via Trigger.dev
- **Development**: Isolated `.venv/` virtual environment
- **Configuration**: Both `requirementsFile` and `devPythonBinaryPath` in `trigger.config.ts`

## Available Build Commands

### 1. **Recommended: Use Our Existing Scripts**

```bash
# Complete fresh build with Python setup
npm run build:full

# Just Python setup + build (no dev server)
npm run build:with-python

# Fresh development server
npm run dev:fresh
```

### 2. **Your Preferred Manual Process (Updated)**

Instead of:
```bash
rm -rf ./next && npm install && npm run build && npm run dev
```

Use:
```bash
npm run dev:fresh
```

This runs the exact same sequence but includes Python setup:
`rm -rf .next && npm run setup:python && npm install && npm run build && npm run dev`

### 3. **If You Want to Keep Manual Commands**

Add Python setup to your existing process:
```bash
rm -rf .next && npm run setup:python && npm install && npm run build && npm run dev
```

## Why Our Current Setup is Optimal

### ✅ Benefits of Hybrid Approach
- **Isolation**: Python packages don't pollute system Python
- **Consistency**: Same environment across team members
- **Production Ready**: Trigger.dev handles production installs automatically
- **Error Prevention**: Prevents "spawn python ENOENT" errors
- **Documentation**: Requirements.txt serves as dependency documentation

### 🚫 Why Not Requirements-File-Only
- ❌ Manual pip install required in development
- ❌ No isolation from system packages
- ❌ Inconsistent between team members
- ❌ Doesn't match Trigger.dev best practices

## Current Configuration Files

### `trigger.config.ts`
```typescript
pythonExtension({
  requirementsFile: "./requirements.txt",        // 📦 Production: Auto-install
  devPythonBinaryPath: "./.venv/bin/python3",   // 🔧 Development: Isolated
  scripts: ["./src/python/**/*.py"],            // 📁 Copy Python scripts
})
```

### `package.json` Scripts
```json
{
  "setup:python": "./scripts/setup-python.sh",
  "build:full": "npm run clean && npm run setup:python && npm install && npm run build && npm run dev",
  "build:with-python": "npm run setup:python && npm install && npm run build",
  "dev:fresh": "rm -rf .next && npm run setup:python && npm install && npm run build && npm run dev"
}
```

### `scripts/setup-python.sh`
- Creates `.venv/` if it doesn't exist
- Installs/updates all requirements.txt dependencies
- Verifies core packages are working
- Handles errors gracefully

## Recommendation

**Keep your current setup!** It's already following Trigger.dev best practices.

Just use:
```bash
npm run dev:fresh
```

This gives you the exact same result as your manual process but with proper Python setup included.

## Production Deployment

In production, Trigger.dev automatically:
1. Reads `requirements.txt`
2. Installs packages in build environment
3. Makes packages available to background jobs
4. Ignores `devPythonBinaryPath` (development only)

No additional configuration needed! 🎉

---

**Last Updated**: 2025-01-17
**Status**: ✅ Optimal Configuration Active