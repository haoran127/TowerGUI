#!/usr/bin/env node
/**
 * Prefab 增量镜像同步工具
 *
 * 递归扫描 Unity Assets 目录下的 .prefab 文件，通过 mtime 比较
 * 只转换新增或修改过的文件，生成对应的 .tower.json 到目标目录。
 *
 * 每个 prefab 在内存中走完整管道 prefab → JSON tree → .tower.json，不写中间文件。
 *
 * Usage:
 *   node tools/mirror-prefabs.mjs \
 *     --source <unity-assets-dir> \
 *     --target <tower-project-screens-dir> \
 *     [--project <unity-root>] \
 *     [--sprite-map <map.json>] \
 *     [--force] \
 *     [--json-progress]
 *
 * --json-progress: output one JSON object per line for machine consumption (used by server API)
 */
import fs from 'fs';
import path from 'path';
import { PrefabParser, findAssetsRoot, findPrefabsRecursive } from './lib/prefab-parser.mjs';
import { TowerGenerator } from './lib/tower-gen.mjs';

// ── CLI ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let source = null;
let target = null;
let projectRoot = null;
let spriteMapPath = null;
let force = false;
let jsonProgress = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--source' && args[i + 1]) { source = args[++i]; continue; }
  if (args[i] === '--target' && args[i + 1]) { target = args[++i]; continue; }
  if (args[i] === '--project' && args[i + 1]) { projectRoot = args[++i]; continue; }
  if (args[i] === '--sprite-map' && args[i + 1]) { spriteMapPath = args[++i]; continue; }
  if (args[i] === '--force') { force = true; continue; }
  if (args[i] === '--json-progress') { jsonProgress = true; continue; }
}

if (!source || !target) {
  console.error('Usage: node tools/mirror-prefabs.mjs --source <dir> --target <dir> [--project <root>] [--sprite-map <map.json>] [--force] [--json-progress]');
  process.exit(1);
}

source = path.resolve(source);
target = path.resolve(target);

if (!projectRoot) {
  projectRoot = findAssetsRoot(source) || source;
}

let spriteMap = {};
if (spriteMapPath) {
  try {
    spriteMap = JSON.parse(fs.readFileSync(spriteMapPath, 'utf-8'));
  } catch (e) {
    console.error(`[mirror-prefabs] Warning: failed to load sprite map "${spriteMapPath}": ${e.message}`);
  }
}

// ── Progress output ─────────────────────────────────────────────────────────

function emit(type, data) {
  if (jsonProgress) {
    process.stdout.write(JSON.stringify({ type, ...data }) + '\n');
  } else {
    switch (type) {
      case 'scan':
        console.error(`[mirror] Scanning ${data.source} ...`);
        break;
      case 'plan':
        console.error(`[mirror] Found ${data.total} prefabs, ${data.needUpdate} need update, ${data.upToDate} up to date`);
        break;
      case 'progress':
        console.error(`[mirror] [${data.current}/${data.total}] ${data.file} → ${data.status}`);
        break;
      case 'complete':
        console.error(`[mirror] Done: ${data.converted} converted, ${data.failed} failed, ${data.skipped} skipped`);
        break;
      case 'error':
        console.error(`[mirror] ERROR: ${data.message}`);
        break;
    }
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

emit('scan', { source });

const parser = new PrefabParser({ projectRoot, quiet: jsonProgress });

const allPrefabs = findPrefabsRecursive(source);

const toConvert = [];
let upToDate = 0;

for (const { abs, rel } of allPrefabs) {
  const towerRel = rel.replace(/\.prefab$/, '.tower.json');
  const towerAbs = path.join(target, towerRel);

  if (!force && fs.existsSync(towerAbs)) {
    const srcMtime = fs.statSync(abs).mtimeMs;
    const dstMtime = fs.statSync(towerAbs).mtimeMs;
    if (dstMtime >= srcMtime) {
      upToDate++;
      continue;
    }
  }

  toConvert.push({ abs, rel, towerRel, towerAbs });
}

emit('plan', { total: allPrefabs.length, needUpdate: toConvert.length, upToDate });

let converted = 0;
let failed = 0;

for (let i = 0; i < toConvert.length; i++) {
  const { abs: prefabAbs, rel, towerRel, towerAbs } = toConvert[i];

  try {
    const tree = parser.processPrefab(prefabAbs);
    const gen = new TowerGenerator(tree, spriteMap);
    const doc = gen.generate();

    fs.mkdirSync(path.dirname(towerAbs), { recursive: true });
    fs.writeFileSync(towerAbs, JSON.stringify(doc, null, 2));

    converted++;
    emit('progress', { current: i + 1, total: toConvert.length, file: rel, status: 'OK' });
  } catch (e) {
    failed++;
    emit('progress', { current: i + 1, total: toConvert.length, file: rel, status: `FAIL: ${e.message}` });
  }

  if ((i + 1) % 100 === 0) parser.parsedCache.clear();
}

emit('complete', { converted, failed, skipped: upToDate });
process.exit(failed > 0 ? 1 : 0);
