/**
 * Parse Unity Prefab YAML and extract UI hierarchy tree.
 * Usage: node parse-prefab.mjs <prefab-path>
 */
import fs from 'fs';
import path from 'path';

const prefabPath = process.argv[2];
if (!prefabPath) { console.error('Usage: node parse-prefab.mjs <prefab.prefab>'); process.exit(1); }

if (!fs.existsSync(prefabPath)) {
  console.error(`Error: File not found: ${prefabPath}`);
  process.exit(1);
}

let raw;
try {
  raw = fs.readFileSync(prefabPath, 'utf-8');
} catch (e) {
  console.error(`Error reading ${prefabPath}: ${e.message}`);
  process.exit(1);
}

// Split by document separator and parse
const sections = raw.split(/^--- !u!/m).filter(s => s.trim());
const docs = [];
for (const sec of sections) {
  const headerMatch = sec.match(/^(\d+) &(\d+)\s*\n([\s\S]*)$/);
  if (headerMatch) {
    docs.push({ typeId: headerMatch[1], fileId: headerMatch[2], body: headerMatch[3] });
  }
}
console.error(`Parsed ${docs.length} documents`);

// Build lookup maps
const gameObjects = new Map();  // fileId -> { name, components, isActive }
const rectTransforms = new Map(); // fileId -> { goId, anchorMin, anchorMax, anchoredPosition, sizeDelta, pivot, children, father, rootOrder }
const monoBehaviours = new Map(); // fileId -> { goId, scriptGuid, fields }
const images = new Map();
const texts = new Map();
const prefabInstances = new Map(); // fileId -> { sourcePrefab guid }

function parseSimple(body, key) {
  const re = new RegExp(`^\\s*${key}:\\s*(.+)$`, 'm');
  const m = body.match(re);
  return m ? m[1].trim() : null;
}

function parseVec2(body, key) {
  const re = new RegExp(`^\\s*${key}:\\s*\\{x:\\s*([\\d.-]+),\\s*y:\\s*([\\d.-]+)\\}`, 'm');
  const m = body.match(re);
  return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : null;
}

function parseFileRef(body, key) {
  const re = new RegExp(`^\\s*${key}:\\s*\\{fileID:\\s*(\\d+)`, 'm');
  const m = body.match(re);
  return m ? m[1] : null;
}

function parseChildList(body) {
  const children = [];
  const re = /^\s*-\s*\{fileID:\s*(\d+)\}/gm;
  let cm;
  // Only parse m_Children section
  const childSection = body.match(/m_Children:\n((?:\s+-[^\n]+\n)*)/);
  if (childSection) {
    while ((cm = re.exec(childSection[1])) !== null) {
      children.push(cm[1]);
    }
  }
  return children;
}

function parseGuid(body, key) {
  const re = new RegExp(`${key}:\\s*\\{[^}]*guid:\\s*([a-f0-9]+)`, 'm');
  const m = body.match(re);
  return m ? m[1] : null;
}

for (const doc of docs) {
  const { typeId, fileId, body } = doc;

  if (typeId === '1') { // GameObject
    gameObjects.set(fileId, {
      name: parseSimple(body, 'm_Name'),
      isActive: parseSimple(body, 'm_IsActive') !== '0',
    });
  }
  else if (typeId === '224') { // RectTransform
    const goId = parseFileRef(body, 'm_GameObject');
    rectTransforms.set(fileId, {
      goId,
      anchorMin: parseVec2(body, 'm_AnchorMin'),
      anchorMax: parseVec2(body, 'm_AnchorMax'),
      anchoredPosition: parseVec2(body, 'm_AnchoredPosition'),
      sizeDelta: parseVec2(body, 'm_SizeDelta'),
      pivot: parseVec2(body, 'm_Pivot'),
      children: parseChildList(body),
      father: parseFileRef(body, 'm_Father'),
      rootOrder: parseInt(parseSimple(body, 'm_RootOrder') || '0'),
    });
  }
  else if (typeId === '1001') { // PrefabInstance
    const guid = parseGuid(body, 'm_SourcePrefab');
    prefabInstances.set(fileId, { guid });
  }
}

// Build RT lookup by GO
const rtByGo = new Map();
for (const [rtId, rt] of rectTransforms) {
  if (rt.goId) rtByGo.set(rt.goId, { ...rt, rtId });
}

// Find root RT (father = 0 or null)
let rootRtId = null;
for (const [rtId, rt] of rectTransforms) {
  if (!rt.father || rt.father === '0' || rt.father === 0) {
    rootRtId = rtId;
    break;
  }
}

// Build tree
function buildTree(rtId, depth = 0) {
  const rt = rectTransforms.get(rtId);
  if (!rt) return null;

  const go = rt.goId ? gameObjects.get(rt.goId) : null;
  const name = go?.name || `RT_${rtId}`;
  const active = go?.isActive ?? true;

  const node = {
    name,
    active,
    anchor: rt.anchorMin && rt.anchorMax
      ? `(${rt.anchorMin.x},${rt.anchorMin.y})-(${rt.anchorMax.x},${rt.anchorMax.y})`
      : null,
    pos: rt.anchoredPosition ? `(${rt.anchoredPosition.x}, ${rt.anchoredPosition.y})` : null,
    size: rt.sizeDelta ? `${rt.sizeDelta.x} x ${rt.sizeDelta.y}` : null,
    pivot: rt.pivot ? `(${rt.pivot.x}, ${rt.pivot.y})` : null,
    children: [],
  };

  // Sort children by rootOrder
  const childRTs = rt.children
    .map(cid => ({ id: cid, rt: rectTransforms.get(cid) }))
    .filter(c => c.rt)
    .sort((a, b) => (a.rt.rootOrder || 0) - (b.rt.rootOrder || 0));

  for (const child of childRTs) {
    const childNode = buildTree(child.id, depth + 1);
    if (childNode) node.children.push(childNode);
  }

  return node;
}

function printTree(node, indent = '') {
  if (!node) return;
  const activeStr = node.active ? '' : ' [INACTIVE]';
  const sizeStr = node.size && node.size !== '0 x 0' ? ` size=${node.size}` : '';
  const posStr = node.pos && node.pos !== '(0, 0)' ? ` pos=${node.pos}` : '';
  const anchorStr = node.anchor || '';
  console.log(`${indent}${node.name}${activeStr} | anchor=${anchorStr}${sizeStr}${posStr} pivot=${node.pivot}`);

  for (const child of node.children) {
    printTree(child, indent + '  ');
  }
}

if (rootRtId) {
  const tree = buildTree(rootRtId);
  console.log('=== Prefab UI Hierarchy ===\n');
  printTree(tree);
} else {
  console.log('No root RectTransform found. Dumping all top-level nodes:');
  for (const [rtId, rt] of rectTransforms) {
    if (!rt.father || rt.father === '0') {
      const tree = buildTree(rtId);
      printTree(tree);
      console.log('');
    }
  }
}

// Also dump PrefabInstance references
if (prefabInstances.size > 0) {
  console.log('\n=== Nested Prefab Instances ===');
  for (const [id, pi] of prefabInstances) {
    console.log(`  PrefabInstance ${id} -> guid: ${pi.guid}`);
  }
}
