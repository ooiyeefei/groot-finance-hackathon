# Build and Deployment Security Guide

## 🔴 Critical Issue: Development Build Deployed to Production

### What Happened (2026-02-22)

Sentry alerts showed errors with stack traces containing local file paths:
```
/home/fei/fei/code/finanseal-cc/timesheet-attendance/.next/cache/webpack/client-development/21.pack.gz
```

This indicates a **development build** (`next dev`) was deployed to production instead of a **production build** (`next build`).

### Security Impact

- **Path Disclosure**: Revealed username (`fei`), directory structure, and project location
- **Information Leakage**: Exposed local development environment details
- **Build Integrity**: Dev builds are not optimized, lack proper minification, and may contain debug code

---

## ✅ Implemented Fixes

### 1. Build Validation Script (`scripts/validate-production-build.js`)

Automatically validates builds before deployment:

```bash
npm run validate:build
# or (now part of build process)
npm run build
```

**Checks:**
- ❌ No `client-development` cache directories
- ❌ No `edge-server-development` cache directories
- ✅ Production runtime files present
- ✅ Environment variables consistent

### 2. Sentry Configuration Updates (`sentry.client.config.ts`)

Added `rewriteFramesIntegration` to strip local paths from stack traces:

```typescript
Sentry.rewriteFramesIntegration({
  root: process.env.NEXT_RUNTIME === 'nodejs' ? global.__rootdir : '/',
  prefix: 'app:///',
})
```

This ensures all file paths in Sentry are sanitized to `app:///` prefix.

### 3. Next.js Config Updates (`next.config.ts`)

Added `generateBuildId` for consistent build tracking:

```typescript
generateBuildId: async () => {
  const { execSync } = require('child_process');
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return Date.now().toString(36);
  }
},
```

### 4. Build Script Protection (`package.json`)

Modified build command to auto-validate:

```json
"build": "next build && npm run validate:build"
```

---

## 📋 For Developers: Safe Deployment Process

### ✅ Correct Deployment Steps

1. **Ensure you're on the correct branch:**
   ```bash
   git checkout main
   git pull origin main
   ```

2. **Install dependencies:**
   ```bash
   npm ci  # Use ci, not install, for reproducible builds
   ```

3. **Run production build:**
   ```bash
   npm run build  # Will auto-validate after building
   ```

4. **If validation fails, DO NOT DEPLOY.**
   - Check for development artifacts
   - Ensure NODE_ENV=production
   - Re-run `npm run build`

5. **Deploy via Vercel (Git integration):**
   - Push to `main` branch
   - Let Vercel handle the build (uses production config)
   - Or use `vercel --prod` from clean checkout

### ❌ NEVER Do This

```bash
# DON'T: Deploy from local dev server
npm run dev        # Creates dev build!
vercel --prod      # DEPLOYING DEV BUILD - DANGER!

# DON'T: Deploy without clean build
vercel --prod      # Deploying whatever is in .next (could be dev!)

# DON'T: Deploy with uncommitted changes
# Always deploy from clean git state
```

---

## 🔍 How to Verify Production Build

### Check 1: No Development Cache
```bash
ls .next/cache/webpack/
# Should NOT contain: client-development, edge-server-development, server-development
# Should contain: client-production, edge-server-production, server-production
```

### Check 2: Build Validation Script
```bash
npm run validate:build
# Expected output: ✅ VALIDATION PASSED
```

### Check 3: Check File Sizes
```bash
ls -lh .next/static/chunks/
# Production files are minified and typically smaller
```

### Check 4: Environment Check
```bash
# In Vercel dashboard or build logs, verify:
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1
```

---

## 🔧 Troubleshooting

### Validation Failed: Development Build Detected

**Cause:** `.next` directory contains dev build artifacts

**Fix:**
```bash
npm run clean        # rm -rf .next
npm run build        # Fresh production build
npm run validate:build
```

### Sentry Shows Local Paths

**Cause:** Source maps not properly configured or old build artifacts

**Fix:**
1. Ensure `rewriteFramesIntegration` is in `sentry.client.config.ts`
2. Clear old Sentry source maps
3. Deploy new production build
4. Re-trigger error to verify clean stack traces

### Vercel Deploys Keep Failing

**Cause:** Caching issues or wrong build command

**Fix:**
1. Check Vercel project settings → Build Command
2. Ensure it's set to: `npm run build`
3. Try "Redeploy without cache"
4. Check Environment Variables match production needs

---

## 🛡️ Additional Security Recommendations

### 1. Vercel Deployment Protection

In Vercel Dashboard:
- **Settings → Git → Production Branch**: `main`
- **Settings → Build & Development Settings**:
  - **Build Command**: `npm run build`
  - **Output Directory**: `.next`
  - **Install Command**: `npm ci`

### 2. Branch Protection Rules (GitHub)

Protect `main` branch:
- Require pull request reviews
- Require status checks to pass
- Require deployment approvals

### 3. Environment Variables

Ensure correct variables per environment:

| Variable | Development | Production |
|----------|-------------|------------|
| NODE_ENV | `development` | `production` |
| SENTRY_DSN | Test DSN | Production DSN |
| NEXT_PUBLIC_* | Local URLs | Production URLs |

### 4. CI/CD Pipeline (GitHub Actions)

Create `.github/workflows/deploy.yml`:

```yaml
name: Production Deploy

on:
  push:
    branches: [main]

jobs:
  validate-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build and validate
        run: npm run build
      
      - name: Deploy to Vercel
        uses: vercel/action-deploy@v1
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
```

---

## 📞 Emergency Response

If you suspect a dev build was deployed:

1. **Stop the deployment** (if in progress)
2. **Check Vercel Dashboard** for recent deployments
3. **Verify build source** - was it from CLI or Git push?
4. **Redeploy** from clean production build
5. **Monitor Sentry** for path disclosure in new errors
6. **Document incident** and review deployment process

---

## Related Files

- `next.config.ts` - Next.js configuration with security settings
- `sentry.client.config.ts` - Sentry client configuration
- `sentry.server.config.ts` - Sentry server configuration
- `scripts/validate-production-build.js` - Build validation script
- `package.json` - Updated build scripts

---

*Last updated: 2026-02-22*
*Issue reference: Webpack cache errors showing local paths in production*
