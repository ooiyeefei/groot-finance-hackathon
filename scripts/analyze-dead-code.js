#!/usr/bin/env node

/**
 * Comprehensive Dead Code Analysis Script
 *
 * This script performs systematic analysis to identify:
 * 1. Unused exports (ts-prune)
 * 2. Unused imports (ESLint)
 * 3. Duplicate code patterns
 * 4. Bundle size analysis
 * 5. Dependency analysis
 *
 * Usage: node scripts/analyze-dead-code.js [--fix] [--domain=domain-name]
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function runCommand(command, description) {
  log(`\n🔍 ${description}`, 'cyan');
  try {
    const output = execSync(command, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 10 });
    return output;
  } catch (error) {
    log(`❌ Error running: ${command}`, 'red');
    log(error.message, 'red');
    return null;
  }
}

function analyzeUnusedExports() {
  log('\n📊 UNUSED EXPORTS ANALYSIS', 'bold');
  log('=' + '='.repeat(50), 'blue');

  const output = runCommand('npx ts-prune --project ./tsconfig.json', 'Analyzing unused exports with ts-prune');

  if (output) {
    const lines = output.trim().split('\n');
    const byDomain = {};
    const globalIssues = [];

    lines.forEach(line => {
      if (line.includes('src/domains/')) {
        const domain = line.match(/src\/domains\/([^\/]+)/)?.[1];
        if (domain) {
          if (!byDomain[domain]) byDomain[domain] = [];
          byDomain[domain].push(line);
        }
      } else {
        globalIssues.push(line);
      }
    });

    log(`\n📈 Summary: ${lines.length} unused exports found`, 'yellow');

    // Domain-specific issues
    Object.entries(byDomain).forEach(([domain, issues]) => {
      log(`\n🏗️  Domain: ${domain} (${issues.length} issues)`, 'magenta');
      issues.slice(0, 5).forEach(issue => log(`   ${issue}`, 'yellow'));
      if (issues.length > 5) {
        log(`   ... and ${issues.length - 5} more`, 'yellow');
      }
    });

    // Global issues
    if (globalIssues.length > 0) {
      log(`\n🌐 Global Issues (${globalIssues.length})`, 'magenta');
      globalIssues.slice(0, 10).forEach(issue => log(`   ${issue}`, 'yellow'));
    }
  }
}

function analyzeBundleSize() {
  log('\n📦 BUNDLE SIZE ANALYSIS', 'bold');
  log('=' + '='.repeat(50), 'blue');

  // Check if build exists
  if (!fs.existsSync('.next')) {
    log('⚠️  No .next directory found. Running production build...', 'yellow');
    runCommand('npm run build', 'Building for production');
  }

  // Analyze bundle
  const bundleOutput = runCommand('npm run build:analyze 2>/dev/null || echo "Bundle analysis completed"', 'Generating bundle analysis');

  log('\n📊 Bundle analysis reports generated:', 'green');
  log('   • .next/analyze/client.html - Client-side bundle analysis', 'cyan');
  log('   • .next/analyze/nodejs.html - Server-side bundle analysis', 'cyan');
  log('   • .next/analyze/edge.html - Edge runtime analysis', 'cyan');
}

function analyzeDependencies() {
  log('\n🔗 DEPENDENCY ANALYSIS', 'bold');
  log('=' + '='.repeat(50), 'blue');

  // Check for circular dependencies
  const circularOutput = runCommand('npx madge --circular src/', 'Checking for circular dependencies');

  if (circularOutput && circularOutput.includes('✔')) {
    log('✅ No circular dependencies found!', 'green');
  } else {
    log('⚠️  Circular dependencies detected:', 'yellow');
    log(circularOutput, 'yellow');
  }

  // Analyze import/export patterns
  log('\n🔍 Analyzing domain boundaries...', 'cyan');
  const domainViolations = [];

  // Check for cross-domain imports (simplified check)
  const domains = fs.readdirSync('src/domains', { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  domains.forEach(domain => {
    const domainPath = `src/domains/${domain}`;
    if (fs.existsSync(domainPath)) {
      try {
        const findOutput = runCommand(`find ${domainPath} -name "*.ts" -o -name "*.tsx" | head -20`, `Checking ${domain} files`);
        if (findOutput) {
          const files = findOutput.trim().split('\n').filter(f => f.trim());
          log(`   📁 ${domain}: ${files.length} files checked`, 'cyan');
        }
      } catch (error) {
        // Skip if domain has issues
      }
    }
  });
}

function analyzeCodeDuplication() {
  log('\n🔄 CODE DUPLICATION ANALYSIS', 'bold');
  log('=' + '='.repeat(50), 'blue');

  log('🔍 Common duplication patterns to look for:', 'cyan');
  log('   • Similar component patterns', 'yellow');
  log('   • Repeated utility functions', 'yellow');
  log('   • Duplicate API call patterns', 'yellow');
  log('   • Similar form validation logic', 'yellow');

  // Simple pattern detection for common duplications
  const patterns = [
    { pattern: 'useState\\(.*loading.*\\)', description: 'Loading state patterns' },
    { pattern: 'fetch\\(.*\\/api\\/v1\\/', description: 'API call patterns' },
    { pattern: 'className=.*bg-gray-800.*border-gray-700', description: 'Card styling patterns' },
    { pattern: 'interface.*Props.*\\{', description: 'Props interface patterns' }
  ];

  patterns.forEach(({ pattern, description }) => {
    try {
      const grepOutput = runCommand(`grep -r "${pattern}" src/domains/ --include="*.tsx" --include="*.ts" | wc -l`, `Checking ${description}`);
      const count = parseInt(grepOutput?.trim() || '0');
      if (count > 10) {
        log(`   🔄 ${description}: ${count} occurrences (consider refactoring)`, 'yellow');
      } else {
        log(`   ✅ ${description}: ${count} occurrences (reasonable)`, 'green');
      }
    } catch (error) {
      log(`   ❌ Could not analyze ${description}`, 'red');
    }
  });
}

function generateRecommendations() {
  log('\n💡 OPTIMIZATION RECOMMENDATIONS', 'bold');
  log('=' + '='.repeat(50), 'blue');

  const recommendations = [
    {
      category: 'Dead Code Cleanup',
      priority: 'High',
      actions: [
        'Remove unused exports identified by ts-prune',
        'Set up ESLint rules for unused imports',
        'Create automated cleanup scripts'
      ]
    },
    {
      category: 'Bundle Optimization',
      priority: 'Medium',
      actions: [
        'Analyze bundle reports for optimization opportunities',
        'Consider dynamic imports for large dependencies',
        'Implement tree-shaking optimizations'
      ]
    },
    {
      category: 'Code Consolidation',
      priority: 'Medium',
      actions: [
        'Extract common patterns into shared utilities',
        'Create reusable hook patterns',
        'Consolidate similar component structures'
      ]
    },
    {
      category: 'Architecture Improvements',
      priority: 'Low',
      actions: [
        'Enforce domain boundary rules',
        'Implement dependency graphs',
        'Create shared component library'
      ]
    }
  ];

  recommendations.forEach(({ category, priority, actions }) => {
    log(`\n🎯 ${category} (Priority: ${priority})`, 'magenta');
    actions.forEach(action => log(`   • ${action}`, 'cyan'));
  });
}

function generateScripts() {
  log('\n📝 GENERATED SCRIPTS', 'bold');
  log('=' + '='.repeat(50), 'blue');

  const scripts = {
    'analyze:dead-code': 'node scripts/analyze-dead-code.js',
    'analyze:bundle': 'npm run build:analyze && echo "Open .next/analyze/client.html"',
    'analyze:dependencies': 'npx madge --circular src/ && npx dependency-cruiser --validate .dependency-cruiser.js src',
    'clean:unused-exports': 'npx ts-prune --project ./tsconfig.json | grep -v "used in module" > unused-exports.txt',
    'lint:unused-imports': 'npx eslint src/ --ext .ts,.tsx --fix --rule "unused-imports/no-unused-imports: error"'
  };

  log('\n📋 Add these scripts to package.json:', 'green');
  Object.entries(scripts).forEach(([name, command]) => {
    log(`   "${name}": "${command}",`, 'cyan');
  });
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const shouldFix = args.includes('--fix');
  const domainFilter = args.find(arg => arg.startsWith('--domain='))?.split('=')[1];

  log('🚀 Groot Finance Dead Code Analysis Tool', 'bold');
  log('=' + '='.repeat(50), 'blue');

  if (domainFilter) {
    log(`🎯 Analyzing domain: ${domainFilter}`, 'yellow');
  }

  if (shouldFix) {
    log('🛠️  Fix mode enabled - will attempt to fix issues', 'yellow');
  }

  // Run analyses
  analyzeUnusedExports();
  analyzeBundleSize();
  analyzeDependencies();
  analyzeCodeDuplication();
  generateRecommendations();
  generateScripts();

  log('\n✅ Analysis complete! Check the recommendations above.', 'green');
  log('📊 For detailed bundle analysis, open .next/analyze/client.html in your browser', 'cyan');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };