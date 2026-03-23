#!/usr/bin/env node
/**
 * validate-all.mjs — Batch validate all .tower.json files.
 * Intended for CI/CD pipelines. Returns exit code 1 if any errors found.
 *
 * Usage:
 *   node tools/validate-all.mjs [--dir <path>] [--strict] [--json]
 *
 * Options:
 *   --dir <path>   Directory to scan (default: current directory)
 *   --strict       Also warn about missing names, empty text, etc.
 *   --json         Output results as JSON (for CI parsing)
 */
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
let scanDir = '.';
let strict = false;
let jsonOutput = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dir' && args[i + 1]) { scanDir = args[++i]; }
  else if (args[i] === '--strict') { strict = true; }
  else if (args[i] === '--json') { jsonOutput = true; }
  else if (args[i] === '--help' || args[i] === '-h') {
    console.log('Usage: node tools/validate-all.mjs [--dir <path>] [--strict] [--json]');
    process.exit(0);
  }
}

const REQUIRED_ROOT_FIELDS = ['name', 'designWidth', 'designHeight', 'root'];
const VALID_TYPES = new Set([
  'ui-view', 'ui-text', 'ui-image', 'ui-button', 'ui-input',
  'ui-toggle', 'ui-slider', 'ui-scroll', 'ui-dropdown', 'ui-progress', '$ref',
]);

function findTowerJson(dir) {
  const results = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        results.push(...findTowerJson(full));
      } else if (entry.name.endsWith('.tower.json')) {
        results.push(full);
      }
    }
  } catch { /* permission denied etc */ }
  return results;
}

function validateNode(node, filePath, errors, warnings, nodePath = 'root') {
  if (!node || typeof node !== 'object') {
    errors.push({ file: filePath, path: nodePath, msg: 'Node is null or not an object' });
    return;
  }

  if (!node.type) {
    errors.push({ file: filePath, path: nodePath, msg: 'Missing "type" field' });
  } else if (!VALID_TYPES.has(node.type)) {
    warnings.push({ file: filePath, path: nodePath, msg: `Unknown type "${node.type}"` });
  }

  if (strict) {
    if (node.type === 'ui-button' && !node.props?.name) {
      warnings.push({ file: filePath, path: nodePath, msg: 'Button without "name" prop — cannot bind events' });
    }
    if (node.type === 'ui-text' && !node.props?.text) {
      warnings.push({ file: filePath, path: nodePath, msg: 'Text node with empty text' });
    }
    if (node.type === 'ui-image' && !node.props?.src && !node.props?.tint && !node.props?._rawImage) {
      warnings.push({ file: filePath, path: nodePath, msg: 'Image without src or tint' });
    }
  }

  if (node.props) {
    if (typeof node.props !== 'object') {
      errors.push({ file: filePath, path: nodePath, msg: '"props" must be an object' });
    }
    if (node.props.width !== undefined && typeof node.props.width !== 'number') {
      errors.push({ file: filePath, path: nodePath, msg: `"width" must be number, got ${typeof node.props.width}` });
    }
    if (node.props.height !== undefined && typeof node.props.height !== 'number') {
      errors.push({ file: filePath, path: nodePath, msg: `"height" must be number, got ${typeof node.props.height}` });
    }
  }

  if (node.children) {
    if (!Array.isArray(node.children)) {
      errors.push({ file: filePath, path: nodePath, msg: '"children" must be an array' });
    } else {
      node.children.forEach((child, i) => {
        validateNode(child, filePath, errors, warnings, `${nodePath}.children[${i}]`);
      });
    }
  }
}

function validateFile(filePath) {
  const errors = [];
  const warnings = [];

  let raw;
  try { raw = fs.readFileSync(filePath, 'utf-8'); }
  catch (e) { errors.push({ file: filePath, path: '', msg: `Cannot read: ${e.message}` }); return { errors, warnings }; }

  let doc;
  try { doc = JSON.parse(raw); }
  catch (e) { errors.push({ file: filePath, path: '', msg: `Invalid JSON: ${e.message}` }); return { errors, warnings }; }

  for (const field of REQUIRED_ROOT_FIELDS) {
    if (doc[field] === undefined) {
      errors.push({ file: filePath, path: '', msg: `Missing required field "${field}"` });
    }
  }

  if (doc.root) {
    validateNode(doc.root, filePath, errors, warnings);
  }

  if (doc.components && typeof doc.components === 'object') {
    for (const [name, node] of Object.entries(doc.components)) {
      validateNode(node, filePath, errors, warnings, `components.${name}`);
    }
  }

  return { errors, warnings };
}

// ── Main ──

const files = findTowerJson(path.resolve(scanDir));
let totalErrors = 0;
let totalWarnings = 0;
const results = [];

for (const file of files) {
  const rel = path.relative(process.cwd(), file);
  const { errors, warnings } = validateFile(file);
  totalErrors += errors.length;
  totalWarnings += warnings.length;
  results.push({ file: rel, errors, warnings });
}

if (jsonOutput) {
  console.log(JSON.stringify({ files: files.length, errors: totalErrors, warnings: totalWarnings, results }, null, 2));
} else {
  console.log(`\nScanned ${files.length} .tower.json files\n`);

  for (const r of results) {
    if (r.errors.length === 0 && r.warnings.length === 0) continue;
    console.log(`  ${r.file}`);
    for (const e of r.errors) console.log(`    ERROR: ${e.msg}${e.path ? ` (at ${e.path})` : ''}`);
    for (const w of r.warnings) console.log(`    WARN:  ${w.msg}${w.path ? ` (at ${w.path})` : ''}`);
  }

  const passed = files.length - results.filter(r => r.errors.length > 0).length;
  console.log(`\nResult: ${passed}/${files.length} passed, ${totalErrors} errors, ${totalWarnings} warnings`);

  if (totalErrors > 0) {
    console.log('\nFAILED — fix errors above before committing.\n');
    process.exit(1);
  } else {
    console.log('\nPASSED\n');
  }
}
