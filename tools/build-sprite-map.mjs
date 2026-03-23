#!/usr/bin/env node
/**
 * 扫描 Unity Assets 目录中的 .png.meta 文件，建立 GUID → PNG 路径映射。
 * 然后根据 prefab JSON 中引用的 spriteGuid，复制对应的 PNG 到 web 可访问目录，
 * 并生成 sprite-map.json 供 TSX 生成器使用。
 *
 * Usage:
 *   node build-sprite-map.mjs --assets <Assets-root> --json-dir <json-dir> --out-dir <sprites-out> [--map <map.json>]
 */
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
let assetsRoot = null;
let jsonDir = null;
let outDir = null;
let mapPath = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--assets' && args[i + 1]) { assetsRoot = args[++i]; continue; }
  if (args[i] === '--json-dir' && args[i + 1]) { jsonDir = args[++i]; continue; }
  if (args[i] === '--out-dir' && args[i + 1]) { outDir = args[++i]; continue; }
  if (args[i] === '--map' && args[i + 1]) { mapPath = args[++i]; continue; }
}

if (!assetsRoot || !jsonDir || !outDir) {
  console.error('Usage: node build-sprite-map.mjs --assets <Assets> --json-dir <json-dir> --out-dir <sprites-out>');
  process.exit(1);
}

// Step 1: Collect all spriteGuids referenced in JSON files
const referencedGuids = new Set();
const jsonFiles = fs.readdirSync(jsonDir).filter(f => f.endsWith('.json'));

for (const f of jsonFiles) {
  const content = fs.readFileSync(path.join(jsonDir, f), 'utf-8');
  const re = /"spriteGuid":\s*"([a-f0-9]+)"/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    referencedGuids.add(m[1]);
  }
}
console.error(`[sprite-map] Found ${referencedGuids.size} unique sprite GUIDs referenced in JSON files`);

// Step 2: Scan all .png.meta and .jpg.meta files to build GUID → file path mapping
const guidToPath = new Map();
let scanned = 0;

function scanDir(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      scanDir(full);
      continue;
    }
    if (!e.name.endsWith('.png.meta') && !e.name.endsWith('.jpg.meta') && !e.name.endsWith('.tga.meta')) continue;
    scanned++;
    try {
      const meta = fs.readFileSync(full, 'utf-8');
      const gm = meta.match(/^guid:\s*([a-f0-9]+)/m);
      if (gm && referencedGuids.has(gm[1])) {
        const imgPath = full.replace(/\.meta$/, '');
        if (fs.existsSync(imgPath)) {
          guidToPath.set(gm[1], imgPath);
        }
      }
    } catch { /* skip */ }
  }
}

console.error(`[sprite-map] Scanning ${assetsRoot} for image assets...`);
scanDir(assetsRoot);
console.error(`[sprite-map] Scanned ${scanned} meta files, matched ${guidToPath.size}/${referencedGuids.size} GUIDs`);

// Step 3: Copy matched images to output directory and build map
fs.mkdirSync(outDir, { recursive: true });

const spriteMap = {};
let copied = 0;

for (const [guid, srcPath] of guidToPath) {
  const ext = path.extname(srcPath);
  const destName = `${guid}${ext}`;
  const destPath = path.join(outDir, destName);

  try {
    fs.copyFileSync(srcPath, destPath);
    spriteMap[guid] = `/sprites/${destName}`;
    copied++;
  } catch (e) {
    console.error(`  [warn] Failed to copy ${srcPath}: ${e.message}`);
  }
}

console.error(`[sprite-map] Copied ${copied} sprite images to ${outDir}`);

// Step 4: Write sprite map JSON
if (!mapPath) mapPath = path.join(outDir, 'sprite-map.json');
fs.writeFileSync(mapPath, JSON.stringify(spriteMap, null, 2));
console.error(`[sprite-map] Map written to ${mapPath} (${Object.keys(spriteMap).length} entries)`);

// Step 5: Scan SpriteAtlas (.spriteatlas) files for sub-sprite references
let atlasResolved = 0;
function scanAtlases(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { scanAtlases(full); continue; }
    if (!e.name.endsWith('.spriteatlas')) continue;
    try {
      const content = fs.readFileSync(full, 'utf-8');
      const packedRe = /- first:\s*\{fileID:\s*\d+,\s*guid:\s*([a-f0-9]+)/g;
      let pm;
      const atlasDir = path.dirname(full);
      while ((pm = packedRe.exec(content)) !== null) {
        const packedGuid = pm[1];
        if (referencedGuids.has(packedGuid) && !guidToPath.has(packedGuid)) {
          const resolved = resolveGuidToImage(packedGuid, atlasDir);
          if (resolved) {
            guidToPath.set(packedGuid, resolved);
            const ext = path.extname(resolved);
            const destName = `${packedGuid}${ext}`;
            const destPath = path.join(outDir, destName);
            try { fs.copyFileSync(resolved, destPath); spriteMap[packedGuid] = `/sprites/${destName}`; atlasResolved++; } catch {}
          }
        }
      }
    } catch {}
  }
}

function resolveGuidToImage(guid, searchDir) {
  const exts = ['.png', '.jpg', '.tga'];
  const dirs = [searchDir];
  const parentDir = path.dirname(searchDir);
  if (parentDir !== searchDir) dirs.push(parentDir);

  for (const dir of dirs) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.isDirectory()) continue;
      if (!exts.some(ext => e.name.endsWith(ext + '.meta'))) continue;
      try {
        const meta = fs.readFileSync(path.join(dir, e.name), 'utf-8');
        const gm = meta.match(/^guid:\s*([a-f0-9]+)/m);
        if (gm && gm[1] === guid) {
          const imgPath = path.join(dir, e.name.replace(/\.meta$/, ''));
          if (fs.existsSync(imgPath)) return imgPath;
        }
      } catch {}
    }
  }
  return null;
}

scanAtlases(assetsRoot);
if (atlasResolved > 0) {
  console.error(`[sprite-map] Resolved ${atlasResolved} additional sprites from SpriteAtlases`);
  fs.writeFileSync(mapPath, JSON.stringify(spriteMap, null, 2));
}

// Step 5b: Scan texture .meta files for spritesheet sub-sprites (fileIDToRecycleName)
let spritesheetResolved = 0;
function scanSpritesheets(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { scanSpritesheets(full); continue; }
    if (!e.name.endsWith('.png.meta') && !e.name.endsWith('.jpg.meta') && !e.name.endsWith('.tga.meta')) continue;
    try {
      const meta = fs.readFileSync(full, 'utf-8');
      if (!meta.includes('fileIDToRecycleName:') && !meta.includes('internalIDToNameTable:')) continue;
      const mainGuid = meta.match(/^guid:\s*([a-f0-9]+)/m)?.[1];
      if (!mainGuid) continue;

      const idNameRe = /(\d+):\s*(\S+)/g;
      const idSection = meta.match(/fileIDToRecycleName:\s*\n([\s\S]*?)(?=\n\w|\n$)/);
      if (!idSection) continue;
      let im;
      while ((im = idNameRe.exec(idSection[1])) !== null) {
        const fileId = im[1];
        const spriteName = im[2];
        const subGuid = mainGuid;
        if (referencedGuids.has(subGuid) && !guidToPath.has(subGuid)) {
          const imgPath = full.replace(/\.meta$/, '');
          if (fs.existsSync(imgPath)) {
            guidToPath.set(subGuid, imgPath);
            const ext = path.extname(imgPath);
            const destName = `${subGuid}${ext}`;
            const destPath = path.join(outDir, destName);
            try { fs.copyFileSync(imgPath, destPath); spriteMap[subGuid] = `/sprites/${destName}`; spritesheetResolved++; } catch {}
          }
        }
      }
    } catch {}
  }
}
scanSpritesheets(assetsRoot);
if (spritesheetResolved > 0) {
  console.error(`[sprite-map] Resolved ${spritesheetResolved} additional sprites from spritesheets`);
  fs.writeFileSync(mapPath, JSON.stringify(spriteMap, null, 2));
}

// Step 6: Build font map (GUID → font name)
const fontMap = {};
function scanFonts(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { scanFonts(full); continue; }
    if (!e.name.endsWith('.ttf.meta') && !e.name.endsWith('.otf.meta') && !e.name.endsWith('.fontsettings.meta') && !e.name.endsWith('.asset.meta')) continue;
    try {
      const meta = fs.readFileSync(full, 'utf-8');
      const gm = meta.match(/^guid:\s*([a-f0-9]+)/m);
      if (gm) {
        const fontFile = full.replace(/\.meta$/, '');
        const fontName = path.basename(fontFile, path.extname(fontFile));
        fontMap[gm[1]] = fontName;
      }
    } catch {}
  }
}
scanFonts(assetsRoot);
if (Object.keys(fontMap).length > 0) {
  const fontMapPath = path.join(path.dirname(mapPath), 'font-map.json');
  fs.writeFileSync(fontMapPath, JSON.stringify(fontMap, null, 2));
  console.error(`[font-map] Indexed ${Object.keys(fontMap).length} fonts → ${fontMapPath}`);
}

// Report unresolved
const unresolved = [...referencedGuids].filter(g => !guidToPath.has(g));
if (unresolved.length > 0) {
  console.error(`[sprite-map] ${unresolved.length} GUIDs unresolved (may be in atlas/spritesheet or other asset types)`);
}
