#!/usr/bin/env node
/**
 * Prefab JSON → TowerGUI TSX / .tower.json 代码生成器
 *
 * 将 prefab-to-json.mjs 输出的 JSON 布局数据转换为 TowerGUI React TSX 组件代码
 * 或 .tower.json 文档格式（用于编辑器导入）。
 *
 * Usage:
 *   node json-to-tsx.mjs <input.json> [--out <output>] [--sprite-map <map.json>] [--format <tsx|tower>]
 *   node json-to-tsx.mjs --batch <json-dir> [--out-dir <dir>] [--sprite-map <map.json>] [--format <tsx|tower>]
 */
import fs from 'fs';
import path from 'path';
import {
  CHILD_ALIGN, tmpAlignToCSS, round, pctPx,
  rectToAbsoluteProps, rectToFlexChildProps,
  getComp, hasComp, parentHasLayout, childIgnoresLayout,
  isGarbageText, decodeUnicodeEscapes, hexColorToShort,
  buildNodeProps, cleanProps,
  TowerGenerator,
} from './lib/tower-gen.mjs';

const args = process.argv.slice(2);
let inputPath = null;
let batchDir = null;
let outPath = null;
let outDir = null;
let spriteMapPath = null;
let format = 'tsx';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out' && args[i + 1]) { outPath = args[++i]; continue; }
  if (args[i] === '--out-dir' && args[i + 1]) { outDir = args[++i]; continue; }
  if (args[i] === '--batch' && args[i + 1]) { batchDir = args[++i]; continue; }
  if (args[i] === '--sprite-map' && args[i + 1]) { spriteMapPath = args[++i]; continue; }
  if (args[i] === '--format' && args[i + 1]) { format = args[++i]; continue; }
  if (!inputPath) inputPath = args[i];
}

const spriteMap = spriteMapPath ? JSON.parse(fs.readFileSync(spriteMapPath, 'utf-8')) : {};

if (!inputPath && !batchDir) {
  console.error('Usage: node json-to-tsx.mjs <input.json> [--out file] [--sprite-map map.json] [--format tsx|tower]');
  process.exit(1);
}

// ── TSX Code Generator (uses shared utilities from tower-gen.mjs) ───────────

function toComponentName(name) {
  return name
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^(\d)/, '_$1')
    .replace(/_+/g, '_');
}

function pad(n) {
  return '  '.repeat(n);
}

class TsxGenerator {
  constructor(tree) {
    this.tree = tree;
    this.lines = [];
    this.indent = 0;
  }

  generate() {
    const compName = toComponentName(this.tree.name);
    this.line(`// Auto-generated from ${this.tree.name}.prefab — do not edit`);
    this.line(`// Regenerate: node tools/json-to-tsx.mjs`);
    this.line(`import React from 'react';`);
    this.line('');
    this.line(`export function ${compName}() {`);
    this.indent++;
    this.line('return (');
    this.indent++;
    this.emitNode(this.tree, 0, false);
    this.indent--;
    this.line(');');
    this.indent--;
    this.line('}');
    return this.lines.join('\n');
  }

  emitNode(node, depth, insideLayout) {
    if (!node) return;
    const isInactive = !node.active;
    const children = node.children || [];
    const activeChildren = children.filter(c => c.active || (c.children && c.children.length > 0));
    if (isInactive && activeChildren.length === 0) return;

    const isFlexChild = insideLayout && !childIgnoresLayout(node);
    const props = buildNodeProps(node, isFlexChild, spriteMap);
    if (isInactive) props.visible = false;

    const text = getComp(node, 'TMP_Text') || getComp(node, 'Text');
    const img = getComp(node, 'Image') || getComp(node, 'RawImage');
    const scroll = getComp(node, 'ScrollRect');
    const nameComment = node.name ? ` {/* ${node.name} */}` : '';
    const thisHasLayout = parentHasLayout(node);

    if (text && activeChildren.length === 0) {
      this.emitTextNode(node, text, props);
      return;
    }

    if (scroll) {
      this.emitScrollNode(node, scroll, props, activeChildren, depth, thisHasLayout);
      return;
    }

    const isLeafImage = activeChildren.length === 0 && !text && img && props.src;
    const tag = isLeafImage ? 'ui-image' : 'ui-view';
    const propsStr = this.propsToString(props);

    if (activeChildren.length === 0 && !text) {
      this.line(`<${tag} ${propsStr} />${nameComment}`);
      return;
    }

    this.line(`<${tag} ${propsStr}>${nameComment}`);
    this.indent++;
    for (const child of activeChildren) this.emitNode(child, depth + 1, thisHasLayout);
    this.indent--;
    this.line(`</${tag}>`);
  }

  emitTextNode(node, text, baseProps) {
    let rawText = decodeUnicodeEscapes(text.text || '');
    if (rawText.startsWith('"') && rawText.endsWith('"')) rawText = rawText.slice(1, -1);
    if (isGarbageText(rawText)) return;

    const props = { ...baseProps };
    if (text.fontSize) props.fontSize = text.fontSize;
    const color = hexColorToShort(text.color);
    if (color && color !== '#ffffff') props.color = color;
    const fontStyle = text.fontStyle || 0;
    if (fontStyle & 1) props.bold = true;
    if (fontStyle & 2) props.italic = true;
    if (text.hAlign) {
      const align = tmpAlignToCSS(text.hAlign);
      if (align !== 'left') props.align = align;
    }
    const displayText = rawText.replace(/\n/g, ' ').substring(0, 80);
    props.text = displayText;
    const propsStr = this.propsToString(props);
    this.line(`<ui-text ${propsStr} /> {/* ${node.name} */}`);
  }

  emitScrollNode(node, scroll, props, children, depth, thisHasLayout) {
    if (scroll.horizontal) props.horizontal = true;
    if (scroll.vertical !== false) props.vertical = true;
    const propsStr = this.propsToString(props);
    const nameComment = node.name ? ` {/* ${node.name} */}` : '';
    this.line(`<ui-scroll ${propsStr}>${nameComment}`);
    this.indent++;
    for (const child of children) this.emitNode(child, depth + 1, thisHasLayout);
    this.indent--;
    this.line(`</ui-scroll>`);
  }

  propsToString(props) {
    const entries = Object.entries(props).filter(([, v]) => v !== undefined && v !== null);
    if (entries.length === 0) return '';
    const parts = entries.map(([k, v]) => this.propToJsx(k, v));
    if (parts.length <= 5) return parts.join(' ');
    return '\n' + parts.map(p => `${pad(this.indent + 1)}${p}`).join('\n') + '\n' + pad(this.indent);
  }

  propToJsx(key, value) {
    if (value === true) return key;
    if (typeof value === 'string') {
      if (key === 'text' || /[^\x20-\x7e]/.test(value) || value.includes('"') || value.includes("'") || value.includes('{') || value.includes('}') || value.includes('\\')) {
        const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        return `${key}={"${escaped}"}`;
      }
      return `${key}="${value}"`;
    }
    if (typeof value === 'number') return `${key}={${value}}`;
    if (Array.isArray(value)) return `${key}={${JSON.stringify(value)}}`;
    return `${key}={${JSON.stringify(value)}}`;
  }

  line(text) {
    this.lines.push(pad(this.indent) + text);
  }
}

// ── Summary / Tree Printer ──────────────────────────────────────────────────

function printTreeSummary(node, indent = '') {
  if (!node) return;
  const comps = (node.components || []).map(c => c.type).join(', ');
  const sz = node.rect?.size ? `${node.rect.size[0]}x${node.rect.size[1]}` : '?';
  const activeStr = node.active ? '' : ' [OFF]';
  console.error(`${indent}${node.name}${activeStr}  (${sz})  [${comps}]`);
  if (node.children) {
    for (const c of node.children) printTreeSummary(c, indent + '  ');
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

function processFile(jsonPath) {
  const raw = fs.readFileSync(jsonPath, 'utf-8');
  const tree = JSON.parse(raw);

  console.error(`\n=== ${tree.name} ===`);
  printTreeSummary(tree);

  if (format === 'tower') {
    const gen = new TowerGenerator(tree, spriteMap);
    return JSON.stringify(gen.generate(), null, 2);
  }

  const gen = new TsxGenerator(tree);
  return gen.generate();
}

const outputExt = format === 'tower' ? '.tower.json' : '.tsx';

function findJsonRecursive(dir, base) {
  base = base || dir;
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findJsonRecursive(full, base));
    else if (entry.name.endsWith('.json')) results.push({ abs: full, rel: path.relative(base, full) });
  }
  return results;
}

if (batchDir) {
  const files = findJsonRecursive(batchDir);
  if (!outDir) outDir = path.join(batchDir, format === 'tower' ? '_tower' : '_tsx');
  fs.mkdirSync(outDir, { recursive: true });

  console.error(`[batch] Converting ${files.length} JSON files → ${outDir} (format: ${format})\n`);

  for (const { abs: jsonAbs, rel } of files) {
    try {
      const result = processFile(jsonAbs);
      const outRel = rel.replace(/\.json$/, outputExt);
      const outFile = path.join(outDir, outRel);
      fs.mkdirSync(path.dirname(outFile), { recursive: true });
      fs.writeFileSync(outFile, result);
      console.error(`  OK ${outRel}\n`);
    } catch (e) {
      console.error(`  FAIL ${rel}: ${e.message}\n`);
    }
  }
} else {
  const result = processFile(inputPath);
  if (outPath) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, result);
    console.error(`\nSaved to ${outPath}`);
  } else {
    process.stdout.write(result + '\n');
  }
}
