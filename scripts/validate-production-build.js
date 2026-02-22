#!/usr/bin/env node
/**
 * Validates that a production build is being deployed, not a dev build
 * Run this in CI/CD before deployment to catch dev builds
 */

const fs = require('fs');
const path = require('path');

const BUILD_DIR = path.join(process.cwd(), '.next');
const EXIT_CODES = {
  SUCCESS: 0,
  DEV_BUILD_DETECTED: 1,
  NO_BUILD_FOUND: 2,
};

function validateBuild() {
  console.log('🔍 Validating production build...\n');

  // Check if .next directory exists
  if (!fs.existsSync(BUILD_DIR)) {
    console.error('❌ ERROR: No .next directory found. Run "npm run build" first.');
    process.exit(EXIT_CODES.NO_BUILD_FOUND);
  }

  // Check for development indicators
  const checks = [
    {
      name: 'Webpack cache directory',
      path: path.join(BUILD_DIR, 'cache/webpack/client-development'),
      shouldExist: false,
    },
    {
      name: 'Edge server development cache',
      path: path.join(BUILD_DIR, 'cache/webpack/edge-server-development'),
      shouldExist: false,
    },
    {
      name: 'Server development cache',
      path: path.join(BUILD_DIR, 'cache/webpack/server-development'),
      shouldExist: false,
    },
    {
      name: 'Production client runtime',
      path: path.join(BUILD_DIR, 'static/chunks/main-*.js'),
      shouldExist: true,
      pattern: true,
    },
  ];

  let errors = 0;

  for (const check of checks) {
    if (check.pattern) {
      // For glob patterns, check directory contents
      const dir = path.dirname(check.path);
      const pattern = path.basename(check.path);
      if (!fs.existsSync(dir)) {
        if (check.shouldExist) {
          console.error(`❌ FAIL: ${check.name} directory not found`);
          console.error(`   Missing: ${dir}`);
          errors++;
        } else {
          console.log(`✅ PASS: ${check.name} (directory not found as expected)`);
        }
        continue;
      }
      const files = fs.readdirSync(dir);
      const match = files.some(f => f.startsWith('main-') && f.endsWith('.js'));
      if (check.shouldExist && !match) {
        console.error(`❌ FAIL: ${check.name} not found`);
        console.error(`   Directory: ${dir}`);
        errors++;
      } else if (!check.shouldExist && match) {
        console.error(`❌ FAIL: ${check.name} found (should not exist in dev)`);
        console.error(`   Found: ${dir}/${pattern}`);
        errors++;
      } else {
        console.log(`✅ PASS: ${check.name}`);
      }
    } else {
      const exists = fs.existsSync(check.path);
      if (check.shouldExist && !exists) {
        console.error(`❌ FAIL: ${check.name} not found`);
        console.error(`   Missing: ${check.path}`);
        errors++;
      } else if (!check.shouldExist && exists) {
        console.error(`❌ FAIL: ${check.name} detected - THIS IS A DEVELOPMENT BUILD!`);
        console.error(`   Found: ${check.path}`);
        console.error(`\n🚫 DO NOT DEPLOY THIS BUILD TO PRODUCTION!`);
        console.error(`   Run "npm run build" (not "npm run dev") to create a production build.\n`);
        errors++;
      } else {
        console.log(`✅ PASS: ${check.name}`);
      }
    }
  }

  // Check NODE_ENV
  console.log('\n📋 Environment Check:');
  console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'undefined'}`);
  console.log(`   VERCEL_ENV: ${process.env.VERCEL_ENV || 'undefined'}`);
  console.log(`   NEXT_TELEMETRY_DISABLED: ${process.env.NEXT_TELEMETRY_DISABLED || 'undefined'}`);

  if (errors > 0) {
    console.error(`\n❌ VALIDATION FAILED: ${errors} error(s) found`);
    console.error('This build is NOT safe for production deployment.\n');
    process.exit(EXIT_CODES.DEV_BUILD_DETECTED);
  }

  console.log('\n✅ VALIDATION PASSED: This is a production-safe build\n');
  process.exit(EXIT_CODES.SUCCESS);
}

validateBuild();
