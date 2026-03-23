#!/usr/bin/env node
/**
 * Unity Prefab → JSON 转换器
 *
 * 从 .prefab YAML 文件中提取完整 UI 层级树，输出结构化 JSON，
 * 支持嵌套 Prefab 实例解析（通过 guid → file 映射）。
 *
 * Usage:
 *   node prefab-to-json.mjs <prefab-path> [--project <assets-root>] [--out <output.json>]
 *   node prefab-to-json.mjs --batch <dir-with-prefabs> [--project <assets-root>] [--out-dir <output-dir>]
 */
import fs from 'fs';
import path from 'path';
import { PrefabParser, findAssetsRoot, findPrefabsRecursive } from './lib/prefab-parser.mjs';

// ── CLI ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let prefabPath = null;
let batchDir = null;
let projectRoot = null;
let outPath = null;
let outDir = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--project' && args[i + 1]) { projectRoot = args[++i]; continue; }
  if (args[i] === '--out' && args[i + 1]) { outPath = args[++i]; continue; }
  if (args[i] === '--out-dir' && args[i + 1]) { outDir = args[++i]; continue; }
  if (args[i] === '--batch' && args[i + 1]) { batchDir = args[++i]; continue; }
  if (!prefabPath) prefabPath = args[i];
}

if (!prefabPath && !batchDir) {
  console.error('Usage: node prefab-to-json.mjs <prefab> [--project <root>] [--out <json>]');
  console.error('       node prefab-to-json.mjs --batch <dir> [--project <root>] [--out-dir <dir>]');
  process.exit(1);
}

if (!projectRoot) {
  const guess = findAssetsRoot(prefabPath || batchDir);
  if (guess) projectRoot = guess;
}

const parser = new PrefabParser({ projectRoot });

// ── Stats ───────────────────────────────────────────────────────────────────

function countNodes(tree) {
  if (!tree) return 0;
  let c = 1;
  if (tree.children) for (const ch of tree.children) c += countNodes(ch);
  return c;
}

function treeStats(tree) {
  const types = {};
  function walk(node) {
    if (node.components) {
      for (const c of node.components) types[c.type] = (types[c.type] || 0) + 1;
    }
    if (node.children) node.children.forEach(walk);
  }
  walk(tree);
  return { nodeCount: countNodes(tree), componentTypes: types };
}

// ── Main ────────────────────────────────────────────────────────────────────

function processPrefab(filePath) {
  const tree = parser.processPrefab(filePath);
  const stats = treeStats(tree);
  console.error(`  → ${stats.nodeCount} nodes, components: ${JSON.stringify(stats.componentTypes)}`);
  return tree;
}

if (batchDir) {
  const prefabs = findPrefabsRecursive(batchDir);

  if (!outDir) outDir = path.join(batchDir, '_json');
  fs.mkdirSync(outDir, { recursive: true });

  console.error(`\n[batch] Processing ${prefabs.length} prefabs → ${outDir}\n`);

  for (const { abs: pf, rel } of prefabs) {
    try {
      const tree = processPrefab(pf);
      const outRel = rel.replace(/\.prefab$/, '.json');
      const outFile = path.join(outDir, outRel);
      fs.mkdirSync(path.dirname(outFile), { recursive: true });
      fs.writeFileSync(outFile, JSON.stringify(tree, null, 2));
      console.error(`  ✓ ${outRel}`);
    } catch (e) {
      console.error(`  ✗ ${rel}: ${e.message}`);
    }
  }
  console.error('\n[batch] Done.');
} else {
  try {
    const tree = processPrefab(prefabPath);
    const json = JSON.stringify(tree, null, 2);

    if (outPath) {
      fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
      fs.writeFileSync(outPath, json);
      console.error(`\nSaved to ${outPath}`);
    } else {
      process.stdout.write(json + '\n');
    }
  } catch (e) {
    console.error(`\nError processing ${prefabPath}: ${e.message}`);
    process.exit(1);
  }
}
