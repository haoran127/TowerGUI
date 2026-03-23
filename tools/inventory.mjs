#!/usr/bin/env node
/**
 * inventory.mjs — Screen inventory & migration dashboard.
 * Scans Unity .prefab files and .tower.json files to show migration progress.
 *
 * Usage:
 *   node tools/inventory.mjs --unity-dir <Assets/UI> [--tower-dir <docs>] [--json]
 *
 * Output:
 *   Total prefabs, migrated (has .tower.json), remaining, errors, per-folder breakdown.
 */
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
let unityDir = null;
let towerDir = null;
let jsonOutput = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--unity-dir' && args[i + 1]) { unityDir = args[++i]; }
  else if (args[i] === '--tower-dir' && args[i + 1]) { towerDir = args[++i]; }
  else if (args[i] === '--json') { jsonOutput = true; }
  else if (args[i] === '--help' || args[i] === '-h') {
    console.log('Usage: node tools/inventory.mjs --unity-dir <Assets/UI> [--tower-dir <docs>] [--json]');
    process.exit(0);
  }
}

if (!unityDir) {
  console.error('Error: --unity-dir is required. Example: --unity-dir Assets/UI');
  process.exit(1);
}

function findFiles(dir, ext) {
  const results = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        results.push(...findFiles(full, ext));
      } else if (entry.name.endsWith(ext)) {
        results.push(full);
      }
    }
  } catch { /* skip */ }
  return results;
}

function stemName(filePath) {
  return path.basename(filePath).replace(/\.(prefab|tower\.json)$/i, '');
}

function folderOf(filePath, baseDir) {
  const rel = path.relative(baseDir, path.dirname(filePath));
  return rel || '.';
}

// ── Main ──

const prefabs = findFiles(path.resolve(unityDir), '.prefab');
const towerFiles = towerDir
  ? findFiles(path.resolve(towerDir), '.tower.json')
  : findFiles(process.cwd(), '.tower.json');

const towerNames = new Set(towerFiles.map(stemName));

const migrated = [];
const remaining = [];

for (const pf of prefabs) {
  const stem = stemName(pf);
  if (towerNames.has(stem)) {
    migrated.push(pf);
  } else {
    remaining.push(pf);
  }
}

const folderStats = {};
for (const pf of prefabs) {
  const folder = folderOf(pf, unityDir);
  if (!folderStats[folder]) folderStats[folder] = { total: 0, migrated: 0, remaining: 0 };
  folderStats[folder].total++;
}
for (const pf of migrated) {
  const folder = folderOf(pf, unityDir);
  if (folderStats[folder]) folderStats[folder].migrated++;
}
for (const pf of remaining) {
  const folder = folderOf(pf, unityDir);
  if (folderStats[folder]) folderStats[folder].remaining++;
}

// tower.json files that have no matching prefab (newly created in editor)
const editorOnly = towerFiles.filter(tf => {
  const stem = stemName(tf);
  return !prefabs.some(pf => stemName(pf) === stem);
});

const report = {
  totalPrefabs: prefabs.length,
  totalTowerJson: towerFiles.length,
  migrated: migrated.length,
  remaining: remaining.length,
  editorOnly: editorOnly.length,
  migrationPercent: prefabs.length > 0
    ? Math.round((migrated.length / prefabs.length) * 100)
    : 100,
  folderBreakdown: folderStats,
  remainingFiles: remaining.map(f => path.relative(unityDir, f)),
  editorOnlyFiles: editorOnly.map(f => path.relative(towerDir || process.cwd(), f)),
};

if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║     TowerGUI Migration Dashboard         ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  Unity Prefabs:      ${String(report.totalPrefabs).padStart(6)}             ║`);
  console.log(`║  Tower JSON:         ${String(report.totalTowerJson).padStart(6)}             ║`);
  console.log(`║  Migrated:           ${String(report.migrated).padStart(6)}  ✓           ║`);
  console.log(`║  Remaining:          ${String(report.remaining).padStart(6)}  ✗           ║`);
  console.log(`║  Editor-only:        ${String(report.editorOnly).padStart(6)}  ★           ║`);
  console.log(`║  Progress:           ${String(report.migrationPercent + '%').padStart(6)}             ║`);
  console.log('╚══════════════════════════════════════════╝');

  const barLen = 40;
  const filled = Math.round((report.migrationPercent / 100) * barLen);
  const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);
  console.log(`\n  [${bar}] ${report.migrationPercent}%\n`);

  console.log('  Per-folder breakdown:');
  const sortedFolders = Object.entries(folderStats).sort((a, b) => b[1].remaining - a[1].remaining);
  for (const [folder, stats] of sortedFolders) {
    const pct = stats.total > 0 ? Math.round((stats.migrated / stats.total) * 100) : 100;
    const fBar = '█'.repeat(Math.round(pct / 5)) + '░'.repeat(20 - Math.round(pct / 5));
    console.log(`    ${folder.padEnd(30)} ${String(stats.migrated).padStart(4)}/${String(stats.total).padStart(4)}  [${fBar}] ${pct}%`);
  }

  if (remaining.length > 0 && remaining.length <= 50) {
    console.log('\n  Remaining prefabs to migrate:');
    for (const f of remaining.slice(0, 50)) {
      console.log(`    - ${path.relative(unityDir, f)}`);
    }
    if (remaining.length > 50) console.log(`    ... and ${remaining.length - 50} more`);
  }

  console.log('');
}
