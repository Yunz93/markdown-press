#!/usr/bin/env node
/**
 * Build verification script
 * Checks for common build/dev consistency issues
 * 
 * Usage: node scripts/verify-build.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');

const issues = [];
const warnings = [];

function error(message) {
  issues.push(`❌ ${message}`);
}

function warn(message) {
  warnings.push(`⚠️ ${message}`);
}

function success(message) {
  console.log(`✅ ${message}`);
}

function checkFileExists(filePath, description) {
  const fullPath = path.join(DIST_DIR, filePath);
  if (!fs.existsSync(fullPath)) {
    error(`Missing ${description}: ${filePath}`);
    return null;
  }
  return fullPath;
}

function checkFileContent(filePath, checks, description) {
  const fullPath = checkFileExists(filePath, description);
  if (!fullPath) return;

  const content = fs.readFileSync(fullPath, 'utf-8');
  
  checks.forEach(check => {
    let found;
    if (check.pattern instanceof RegExp) {
      found = check.pattern.test(content);
    } else if (typeof check.pattern === 'string') {
      found = content.includes(check.pattern);
    } else {
      found = check.test ? check.test(content) : false;
    }
    if (!found) {
      error(`${filePath}: ${check.message}`);
    }
  });
}

console.log('🔍 Verifying build consistency...\n');

// Check if dist folder exists
if (!fs.existsSync(DIST_DIR)) {
  console.error('❌ dist folder does not exist. Run npm run build first.');
  process.exit(1);
}

// Check index.html
checkFileContent('index.html', [
  { pattern: 'script type="module"', message: 'Should have module script' },
  { pattern: /src="[^"]*index[^"]*\.js"/, message: 'Should reference index.js entry' },
], 'index.html');

// Check for JS files
const assetsDir = path.join(DIST_DIR, 'assets');
if (!fs.existsSync(assetsDir)) {
  error('assets folder does not exist');
} else {
  const jsFiles = fs.readdirSync(assetsDir).filter(f => f.endsWith('.js') && !f.endsWith('.map'));
  const cssFiles = fs.readdirSync(assetsDir).filter(f => f.endsWith('.css'));
  const mapFiles = fs.readdirSync(assetsDir).filter(f => f.endsWith('.js.map'));

  if (jsFiles.length === 0) {
    error('No JS files in assets folder');
  } else {
    success(`Found ${jsFiles.length} JS files`);
    
    // Check for common issues in JS files
    jsFiles.forEach(file => {
      const content = fs.readFileSync(path.join(assetsDir, file), 'utf-8');
      
      // Check for hardcoded NODE_ENV issues
      const hasProd = content.includes('NODE_ENV:"production"');
      const hasDev = content.includes('NODE_ENV:"development"');
      
      if (hasProd && hasDev) {
        warn(`${file}: Contains both production and development NODE_ENV references`);
      }
      
      // Check for process.env references that might not be replaced
      if (content.includes('process.env.NODE_ENV') && !content.includes('import.meta.env')) {
        warn(`${file}: Contains unreplaced process.env.NODE_ENV`);
      }
    });
  }

  if (cssFiles.length === 0) {
    warn('No CSS files in assets folder');
  } else {
    success(`Found ${cssFiles.length} CSS files`);
  }

  if (mapFiles.length > 0) {
    success(`Found ${mapFiles.length} source map files`);
  } else {
    warn('No source map files (expected in development builds)');
  }
}

// Check for expected chunks
const expectedChunks = ['editor-vendor', 'markdown-vendor', 'react-vendor'];
const actualFiles = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir) : [];

expectedChunks.forEach(chunk => {
  const hasChunk = actualFiles.some(f => f.includes(chunk));
  if (hasChunk) {
    success(`Found ${chunk} chunk`);
  } else {
    warn(`Missing ${chunk} chunk (may be bundled into main)`);
  }
});

// Check icon files
const iconFiles = ['32x32.png', '128x128.png', 'icon.icns'];
const iconsDir = path.join(DIST_DIR, 'icons');
if (fs.existsSync(iconsDir)) {
  iconFiles.forEach(icon => {
    if (fs.existsSync(path.join(iconsDir, icon))) {
      success(`Found icon: ${icon}`);
    } else {
      warn(`Missing icon: ${icon}`);
    }
  });
}

// Summary
console.log('\n' + '='.repeat(50));

if (issues.length === 0 && warnings.length === 0) {
  console.log('✅ All checks passed!');
  process.exit(0);
} else {
  if (issues.length > 0) {
    console.log(`\n❌ ${issues.length} issue(s) found:`);
    issues.forEach(issue => console.log(issue));
  }
  
  if (warnings.length > 0) {
    console.log(`\n⚠️ ${warnings.length} warning(s):`);
    warnings.forEach(warning => console.log(warning));
  }
  
  console.log('\n💡 Tips:');
  console.log('   - Run "npm run dev" to test in development mode');
  console.log('   - Run "npm run build" to rebuild');
  console.log('   - Run "npm run smoke:release" for release testing');
  
  process.exit(issues.length > 0 ? 1 : 0);
}
