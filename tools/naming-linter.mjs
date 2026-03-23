#!/usr/bin/env node
/**
 * naming-linter.mjs — Enforce naming conventions for .tower.json nodes.
 * Ensures team-wide consistency across 100s of designers.
 *
 * Usage:
 *   node tools/naming-linter.mjs [--dir <path>] [--fix] [--config <rules.json>] [--json]
 *
 * Default rules:
 *   ui-button  → name must start with "btn" or "Btn"
 *   ui-text    → name must start with "txt" or "Txt" or "lbl" or "Lbl"
 *   ui-image   → name must start with "img" or "Img" or "icon" or "Icon" or "bg" or "Bg"
 *   ui-input   → name must start with "ipt" or "Ipt" or "input" or "Input"
 *   ui-toggle  → name must start with "tog" or "Tog" or "chk" or "Chk"
 *   ui-slider  → name must start with "sld" or "Sld" or "slider" or "Slider"
 *   ui-scroll  → name must start with "scr" or "Scr" or "scroll" or "Scroll"
 *   ui-dropdown→ name must start with "dd" or "Dd" or "drop" or "Drop"
 */
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
let scanDir = '.';
let fix = false;
let jsonOutput = false;
let configPath = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dir' && args[i + 1]) { scanDir = args[++i]; }
  else if (args[i] === '--fix') { fix = true; }
  else if (args[i] === '--json') { jsonOutput = true; }
  else if (args[i] === '--config' && args[i + 1]) { configPath = args[++i]; }
  else if (args[i] === '--help' || args[i] === '-h') {
    console.log('Usage: node tools/naming-linter.mjs [--dir <path>] [--fix] [--config <rules.json>] [--json]');
    process.exit(0);
  }
}

const DEFAULT_RULES = {
  'ui-button':   { prefixes: ['btn', 'Btn', 'button', 'Button'], suggestedPrefix: 'btn' },
  'ui-text':     { prefixes: ['txt', 'Txt', 'lbl', 'Lbl', 'text', 'Text', 'label', 'Label'], suggestedPrefix: 'txt' },
  'ui-image':    { prefixes: ['img', 'Img', 'icon', 'Icon', 'bg', 'Bg', 'image', 'Image'], suggestedPrefix: 'img' },
  'ui-input':    { prefixes: ['ipt', 'Ipt', 'input', 'Input'], suggestedPrefix: 'ipt' },
  'ui-toggle':   { prefixes: ['tog', 'Tog', 'chk', 'Chk', 'toggle', 'Toggle'], suggestedPrefix: 'tog' },
  'ui-slider':   { prefixes: ['sld', 'Sld', 'slider', 'Slider'], suggestedPrefix: 'sld' },
  'ui-scroll':   { prefixes: ['scr', 'Scr', 'scroll', 'Scroll', 'list', 'List'], suggestedPrefix: 'scr' },
  'ui-dropdown': { prefixes: ['dd', 'Dd', 'drop', 'Drop', 'dropdown', 'Dropdown'], suggestedPrefix: 'dd' },
};

let rules = DEFAULT_RULES;
if (configPath) {
  try { rules = { ...DEFAULT_RULES, ...JSON.parse(fs.readFileSync(configPath, 'utf-8')) }; }
  catch (e) { console.error(`Failed to load config: ${e.message}`); process.exit(1); }
}

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
  } catch { /* skip */ }
  return results;
}

function lintNode(node, violations, nodePath = 'root') {
  if (!node || !node.props?.name) {
    if (node?.children) {
      node.children.forEach((c, i) => lintNode(c, violations, `${nodePath}[${i}]`));
    }
    return;
  }

  const name = node.props.name;
  const rule = rules[node.type];

  if (rule) {
    const matches = rule.prefixes.some(p => name.startsWith(p));
    if (!matches) {
      violations.push({
        path: nodePath,
        type: node.type,
        name,
        expected: rule.prefixes.slice(0, 3).join('/') + '...',
        suggestedName: rule.suggestedPrefix + name.charAt(0).toUpperCase() + name.slice(1),
      });

      if (fix) {
        node.props.name = rule.suggestedPrefix + name.charAt(0).toUpperCase() + name.slice(1);
      }
    }
  }

  if (node.children) {
    node.children.forEach((c, i) => lintNode(c, violations, `${nodePath}[${i}]`));
  }
}

// ── Main ──

const files = findTowerJson(path.resolve(scanDir));
let totalViolations = 0;
let totalFixed = 0;
const allResults = [];

for (const file of files) {
  const rel = path.relative(process.cwd(), file);
  let raw, doc;
  try { raw = fs.readFileSync(file, 'utf-8'); doc = JSON.parse(raw); }
  catch { continue; }

  const violations = [];
  if (doc.root) lintNode(doc.root, violations);

  totalViolations += violations.length;
  if (violations.length > 0) {
    allResults.push({ file: rel, violations });

    if (fix) {
      fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n', 'utf-8');
      totalFixed += violations.length;
    }
  }
}

if (jsonOutput) {
  console.log(JSON.stringify({ files: files.length, violations: totalViolations, fixed: totalFixed, results: allResults }, null, 2));
} else {
  console.log(`\nScanned ${files.length} .tower.json files\n`);

  for (const r of allResults) {
    console.log(`  ${r.file}`);
    for (const v of r.violations) {
      const fixNote = fix ? ` → fixed to "${v.suggestedName}"` : ` → suggest "${v.suggestedName}"`;
      console.log(`    ${v.type} "${v.name}" should start with ${v.expected}${fixNote}`);
    }
  }

  console.log(`\n${totalViolations} naming violations found${fix ? `, ${totalFixed} auto-fixed` : ''}.`);
  if (totalViolations > 0 && !fix) {
    console.log('Run with --fix to auto-rename.\n');
  }
}
