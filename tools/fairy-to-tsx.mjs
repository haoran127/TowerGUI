#!/usr/bin/env node
/**
 * FairyGUI XML → TowerGUI TSX converter
 *
 * Reads a FairyGUI package directory (with package.xml + component XMLs),
 * generates TowerGUI TSX components with correct sprite paths and 9-slice data.
 *
 * Usage:
 *   node fairy-to-tsx.mjs <fairy-package-dir> --out-dir <output-dir> [--sprite-prefix <prefix>]
 *
 * Example:
 *   node fairy-to-tsx.mjs apps/UIActivity/assets/UIActivity --out-dir apps/unity-demo/TsProject/src/lfgame/gen-fairy --sprite-prefix UIActivity
 */
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
let pkgDir = null;
let outDir = null;
let spritePrefix = '';
let outputFormat = 'tsx'; // 'tsx' or 'tower'

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out-dir' && args[i + 1]) { outDir = args[++i]; continue; }
  if (args[i] === '--sprite-prefix' && args[i + 1]) { spritePrefix = args[++i]; continue; }
  if (args[i] === '--format' && args[i + 1]) { outputFormat = args[++i]; continue; }
  if (!pkgDir) pkgDir = args[i];
}

if (!pkgDir) {
  console.error('Usage: node fairy-to-tsx.mjs <fairy-package-dir> --out-dir <dir> [--sprite-prefix <prefix>] [--format tsx|tower]');
  process.exit(1);
}
if (!outDir) outDir = path.join(pkgDir, '_tsx_out');

// ── XML mini-parser (good enough for FairyGUI's simple XML) ──────────────

function parseXmlAttrs(tag) {
  const attrs = {};
  const re = /(\w+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(tag)) !== null) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

function parseXml(xml) {
  const nodes = [];
  const stack = [{ children: nodes }];
  const re = /<\/?([a-zA-Z_][\w]*)((?:\s+\w+="[^"]*")*)\s*\/?>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const full = m[0];
    const tagName = m[1];
    const attrStr = m[2];
    const isSelfClose = full.endsWith('/>');
    const isClose = full.startsWith('</');

    if (isClose) {
      stack.pop();
    } else {
      const node = { tag: tagName, attrs: parseXmlAttrs(attrStr), children: [] };
      stack[stack.length - 1].children.push(node);
      if (!isSelfClose) stack.push(node);
    }
  }
  return nodes;
}

// ── Parse package.xml → resource map ─────────────────────────────────────

function parsePackageXml(pkgXmlPath) {
  const xml = fs.readFileSync(pkgXmlPath, 'utf-8');
  const doc = parseXml(xml);
  const resources = {};

  function walk(nodes) {
    for (const n of nodes) {
      if (n.tag === 'image' || n.tag === 'component') {
        const id = n.attrs.id;
        resources[id] = {
          type: n.tag,
          name: n.attrs.name,
          path: n.attrs.path || '/',
          scale: n.attrs.scale || null,
          scale9grid: n.attrs.scale9grid || null,
          exported: n.attrs.exported === 'true',
        };
      }
      walk(n.children);
    }
  }
  walk(doc);
  return resources;
}

// ── Parse component XML ──────────────────────────────────────────────────

function parseComponentXml(xmlPath) {
  const xml = fs.readFileSync(xmlPath, 'utf-8');
  const doc = parseXml(xml);
  const root = doc.find(n => n.tag === 'component');
  if (!root) return null;

  const [w, h] = (root.attrs.size || '100,100').split(',').map(Number);
  const ext = root.attrs.extention || null;

  const displayList = root.children.find(n => n.tag === 'displayList');
  const elements = displayList ? displayList.children : [];

  const controllers = root.children
    .filter(n => n.tag === 'controller')
    .map(n => n.attrs);

  return { width: w, height: h, extension: ext, elements, controllers };
}

// ── 9-slice calculation ──────────────────────────────────────────────────

const IMAGE_SIZES = {};

function getImageSize(filename) {
  if (IMAGE_SIZES[filename]) return IMAGE_SIZES[filename];
  const filePath = path.join(pkgDir, filename);
  if (!fs.existsSync(filePath)) return null;

  const buf = fs.readFileSync(filePath);
  // PNG: width at offset 16, height at offset 20 (big-endian uint32)
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    IMAGE_SIZES[filename] = { w, h };
    return { w, h };
  }
  return null;
}

function calc9Slice(gridStr, imgFilename) {
  if (!gridStr) return null;
  const [gx, gy, gw, gh] = gridStr.split(',').map(Number);
  const size = getImageSize(imgFilename);
  if (!size) return { sliceLeft: gx, sliceTop: gy, sliceRight: gw, sliceBottom: gh };

  return {
    sliceLeft: gx,
    sliceTop: gy,
    sliceRight: Math.max(0, size.w - gx - gw),
    sliceBottom: Math.max(0, size.h - gy - gh),
  };
}

// ── TSX code generation ──────────────────────────────────────────────────

function pad(n) { return '  '.repeat(n); }

function spritePath(filename) {
  const base = filename.replace(/\.\w+$/, '');
  return spritePrefix ? `${spritePrefix}/${base}` : base;
}

function propToJsx(key, value) {
  if (value === true) return key;
  if (typeof value === 'string') {
    if (/[^\x20-\x7e]/.test(value) || value.includes('"')) {
      return `${key}={"${value.replace(/"/g, '\\"')}"}`;
    }
    return `${key}="${value}"`;
  }
  if (typeof value === 'number') return `${key}={${value}}`;
  if (Array.isArray(value)) return `${key}={${JSON.stringify(value)}}`;
  return `${key}={${JSON.stringify(value)}}`;
}

function propsStr(props, indent) {
  const entries = Object.entries(props).filter(([, v]) => v !== undefined && v !== null);
  if (entries.length === 0) return '';
  const parts = entries.map(([k, v]) => propToJsx(k, v));
  if (parts.join(' ').length <= 100) return ' ' + parts.join(' ');
  return '\n' + parts.map(p => `${pad(indent + 1)}${p}`).join('\n') + '\n' + pad(indent);
}

function generateComponent(compData, resources, allComponents, componentName) {
  const lines = [];
  let ind = 0;

  function line(s) { lines.push(pad(ind) + s); }

  function emitElement(el, depth) {
    const tag = el.tag;
    const a = el.attrs;

    if (tag === 'image') {
      emitImage(a, depth);
    } else if (tag === 'text') {
      emitText(a, depth);
    } else if (tag === 'component') {
      emitComponentRef(a, depth);
    } else if (tag === 'list') {
      emitList(a, depth);
    } else if (tag === 'graph') {
      emitGraph(a, depth);
    } else if (tag === 'group') {
      // skip groups
    }
  }

  function emitList(a, depth) {
    const props = {};
    props.position = 'absolute';

    if (a.xy) {
      const [x, y] = a.xy.split(',').map(Number);
      props.left = x;
      props.top = y;
    }
    if (a.size) {
      const [w, h] = a.size.split(',').map(Number);
      props.width = w;
      props.height = h;
    }

    props.overflow = 'hidden';

    const layout = a.layout || 'column';
    const margin = a.margin ? a.margin.split(',').map(Number) : [0, 0, 0, 0];
    const colGap = Number(a.columnGap) || 0;
    const rowGap = Number(a.lineGap) || 0;
    const cols = Number(a.lineItemCount) || 4;

    if (a.visible === 'false') props.visible = false;

    let itemRefName = null;
    if (a.defaultItem) {
      const match = a.defaultItem.match(/ui:\/\/\w+(\w{5})$/);
      if (match) {
        const itemResId = match[1];
        const itemRes = resources[itemResId];
        if (itemRes) itemRefName = itemRes.name.replace('.xml', '');
      }
    }
    if (!itemRefName && a.fileName) {
      itemRefName = a.fileName.replace('.xml', '');
    }

    const isGrid = layout === 'flow_hz';
    const isRow = layout === 'row';

    if (!isGrid) {
      if (isRow) props.flexDirection = 'row';
      else props.flexDirection = 'column';
      // FairyGUI margin: top,bottom,left,right → CSS padding: top,right,bottom,left
      const cssPadding = [margin[0], margin[3], margin[1], margin[2]];
      if (cssPadding.some(v => v > 0)) props.padding = cssPadding;
      if (colGap) props.columnGap = colGap;
      if (rowGap) props.rowGap = rowGap;
    }

    const totalItems = isGrid ? cols * 3 : cols;

    const ps = buildPropsString(props, depth);
    line(`<ui-view${ps}>`);
    ind++;

    if (itemRefName && allComponents[itemRefName]) {
      const itemComp = allComponents[itemRefName];
      const itemW = itemComp.width;
      const itemH = itemComp.height;

      for (let i = 0; i < totalItems; i++) {
        if (isGrid) {
          const col = i % cols;
          const row = Math.floor(i / cols);
          // FairyGUI margin: top,bottom,left,right
          const x = margin[2] + col * (itemW + colGap);
          const y = margin[0] + row * (itemH + rowGap);
          line(`<ui-view position="absolute" left={${x}} top={${y}} width={${itemW}} height={${itemH}}>`);
        } else {
          line(`<ui-view position="relative" width={${itemW}} height={${itemH}}>`);
        }
        ind++;
        for (const child of itemComp.elements) {
          emitElement(child, depth + 2);
        }
        ind--;
        line(`</ui-view>`);
      }
    } else {
      line(`{/* List items: ${itemRefName || 'unknown'} x${totalItems} */}`);
    }

    ind--;
    line(`</ui-view>`);
  }

  function emitGraph(a, depth) {
    if (a.type !== 'rect') return;
    const props = {};
    props.position = 'absolute';

    if (a.xy) {
      const [x, y] = a.xy.split(',').map(Number);
      props.left = x;
      props.top = y;
    }
    if (a.size) {
      const [w, h] = a.size.split(',').map(Number);
      props.width = w;
      props.height = h;
    }

    // fillColor is ARGB in FairyGUI: #AARRGGBB
    if (a.fillColor) {
      const fc = a.fillColor.replace(/^#/, '');
      if (fc.length === 8) {
        const alpha = parseInt(fc.slice(0, 2), 16);
        const rgb = fc.slice(2);
        if (alpha > 0) {
          props.tint = `#${rgb}`;
          props.opacity = Math.round((alpha / 255) * 100) / 100;
        }
      } else {
        props.tint = a.fillColor;
      }
    }

    if (a.visible === 'false') props.visible = false;

    const ps = buildPropsString(props, depth);
    line(`<ui-view${ps} />`);
  }

  function emitImage(a, depth) {
    const props = {};
    props.position = 'absolute';

    let x = 0, y = 0, w = 0, h = 0;
    if (a.xy) { [x, y] = a.xy.split(',').map(Number); }
    if (a.size) { [w, h] = a.size.split(',').map(Number); }

    // Resolve auto-size (0 = keep original dimension)
    // 9-slice images: use original dimension directly (they stretch independently)
    // Non-9-slice images: scale proportionally to maintain aspect ratio
    const resId = a.src;
    const res = resId ? resources[resId] : null;
    if ((w === 0 || h === 0) && res) {
      const imgSize = getImageSize(res.name);
      if (imgSize) {
        const is9Slice = !!res.scale9grid;
        if (w === 0 && h === 0) {
          w = imgSize.w;
          h = imgSize.h;
        } else if (w > 0 && h === 0) {
          h = is9Slice ? imgSize.h : Math.round(imgSize.h * (w / imgSize.w));
        } else if (h > 0 && w === 0) {
          w = is9Slice ? imgSize.w : Math.round(imgSize.w * (h / imgSize.h));
        }
      }
    }

    // FairyGUI stores xy as the pivot position. When pivot=(0.5,0.5) the xy
    // is the CENTER of the element. Detect this: xy ≈ size/2 within 2px.
    if (w > 0 && h > 0 && Math.abs(x - w / 2) <= 2 && Math.abs(y - h / 2) <= 2) {
      props.left = Math.round(x - w / 2);
      props.top = Math.round(y - h / 2);
    } else {
      props.left = x;
      props.top = y;
    }
    if (w > 0) props.width = w;
    if (h > 0) props.height = h;

    if (res && res.type === 'image') {
      props.src = `{S('${res.name.replace(/\.\w+$/, '')}')}`;

      if (a.color && a.color !== '#ffffff') {
        props.tint = a.color;
      }

      if (res.scale9grid) {
        const slice = calc9Slice(res.scale9grid, res.name);
        if (slice) {
          Object.assign(props, slice);
        }
      }
    }

    if (a.visible === 'false') props.visible = false;

    const ps = buildPropsString(props, depth);
    line(`<ui-image${ps} />`);
  }

  function emitText(a, depth) {
    const props = {};
    props.position = 'absolute';

    if (a.xy) {
      const [x, y] = a.xy.split(',').map(Number);
      props.left = x;
      props.top = y;
    }
    if (a.size) {
      const [w, h] = a.size.split(',').map(Number);
      props.width = w;
      props.height = h;
    }

    if (a.text) props.text = a.text;
    if (a.fontSize) props.fontSize = Number(a.fontSize);
    if (a.color) props.color = a.color;
    if (a.align) props.align = a.align;
    if (a.vAlign === 'middle') props.verticalAlign = 'middle';
    else if (a.vAlign === 'bottom') props.verticalAlign = 'bottom';
    if (a.bold === 'true') props.bold = true;
    if (a.visible === 'false') props.visible = false;

    const ps = buildPropsString(props, depth);
    line(`<ui-text${ps} />`);
  }

  function emitComponentRef(a, depth) {
    const resId = a.src;
    const res = resId ? resources[resId] : null;
    const refName = res ? res.name.replace('.xml', '') : a.name;
    const refComp = allComponents[refName];

    if (!refComp) {
      line(`{/* Missing component: ${refName} */}`);
      return;
    }

    const props = {};
    props.position = 'absolute';
    if (a.xy) {
      const [x, y] = a.xy.split(',').map(Number);
      props.left = x;
      props.top = y;
    }
    // Use override size from XML reference if specified, fallback to native
    if (a.size) {
      const [w, h] = a.size.split(',').map(Number);
      props.width = w || refComp.width;
      props.height = h || refComp.height;
    } else {
      props.width = refComp.width;
      props.height = refComp.height;
    }
    if (a.visible === 'false') props.visible = false;

    const ps = buildPropsString(props, depth);
    line(`<ui-view${ps}>`);
    ind++;
    for (const child of refComp.elements) {
      emitElement(child, depth + 1);
    }
    ind--;
    line(`</ui-view>`);
  }

  function buildPropsString(props, depth) {
    const entries = Object.entries(props).filter(([, v]) => v !== undefined && v !== null);
    const parts = entries.map(([k, v]) => {
      if (v === true) return k;
      if (v === false) return `${k}={false}`;
      if (typeof v === 'string' && v.startsWith('{') && v.endsWith('}')) {
        return `${k}=${v}`;
      }
      if (typeof v === 'string') {
        if (/[^\x20-\x7e]/.test(v) || v.includes('"')) {
          return `${k}={"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"}`;
        }
        return `${k}="${v}"`;
      }
      if (typeof v === 'number') return `${k}={${v}}`;
      return `${k}={${JSON.stringify(v)}}`;
    });

    const inline = ' ' + parts.join(' ');
    if (inline.length <= 120) return inline;
    return '\n' + parts.map(p => `${pad(ind + 1)}${p}`).join('\n') + '\n' + pad(ind);
  }

  // Generate header
  line(`// Auto-generated from FairyGUI: ${componentName}`);
  line(`// Regenerate: node tools/fairy-to-tsx.mjs`);
  line(`import React from 'react';`);
  line('');
  line(`const S = (name: string) => \`${spritePrefix ? spritePrefix + '/' : ''}\${name}\`;`);
  line('');

  const funcName = componentName
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/^(\d)/, '_$1')
    .replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    .replace(/^[a-z]/, c => c.toUpperCase());

  line(`export function ${funcName}() {`);
  ind++;
  line('return (');
  ind++;

  line(`<ui-view width={${compData.width}} height={${compData.height}}>`);
  ind++;
  for (const el of compData.elements) {
    emitElement(el, 0);
  }
  ind--;
  line('</ui-view>');

  ind--;
  line(');');
  ind--;
  line('}');

  return lines.join('\n') + '\n';
}

// ── JSON (TowerDocument) generation ──────────────────────────────────────

function spriteKey(filename) {
  return filename.replace(/\.\w+$/, '');
}

function emitImageJSON(a, resources) {
  const node = { type: 'ui-image', props: { position: 'absolute' } };
  const p = node.props;

  let x = 0, y = 0, w = 0, h = 0;
  if (a.xy) { [x, y] = a.xy.split(',').map(Number); }
  if (a.size) { [w, h] = a.size.split(',').map(Number); }

  const resId = a.src;
  const res = resId ? resources[resId] : null;
  if ((w === 0 || h === 0) && res) {
    const imgSize = getImageSize(res.name);
    if (imgSize) {
      const is9Slice = !!res.scale9grid;
      if (w === 0 && h === 0) { w = imgSize.w; h = imgSize.h; }
      else if (w > 0 && h === 0) { h = is9Slice ? imgSize.h : Math.round(imgSize.h * (w / imgSize.w)); }
      else if (h > 0 && w === 0) { w = is9Slice ? imgSize.w : Math.round(imgSize.w * (h / imgSize.h)); }
    }
  }

  if (w > 0 && h > 0 && Math.abs(x - w / 2) <= 2 && Math.abs(y - h / 2) <= 2) {
    p.left = Math.round(x - w / 2);
    p.top = Math.round(y - h / 2);
  } else {
    p.left = x;
    p.top = y;
  }
  if (w > 0) p.width = w;
  if (h > 0) p.height = h;

  if (res && res.type === 'image') {
    p.src = spriteKey(res.name);
    if (a.color && a.color !== '#ffffff') p.tint = a.color;
    if (res.scale9grid) {
      const slice = calc9Slice(res.scale9grid, res.name);
      if (slice) Object.assign(p, slice);
    }
  }
  if (a.visible === 'false') p.visible = false;
  return node;
}

function emitTextJSON(a) {
  const node = { type: 'ui-text', props: { position: 'absolute' } };
  const p = node.props;

  if (a.xy) { const [x, y] = a.xy.split(',').map(Number); p.left = x; p.top = y; }
  if (a.size) { const [w, h] = a.size.split(',').map(Number); p.width = w; p.height = h; }
  if (a.text) p.text = a.text;
  if (a.fontSize) p.fontSize = Number(a.fontSize);
  if (a.color) p.color = a.color;
  if (a.align) p.align = a.align;
  if (a.vAlign === 'middle') p.verticalAlign = 'middle';
  else if (a.vAlign === 'bottom') p.verticalAlign = 'bottom';
  if (a.bold === 'true') p.bold = true;
  if (a.visible === 'false') p.visible = false;
  return node;
}

function emitGraphJSON(a) {
  if (a.type !== 'rect') return null;
  const node = { type: 'ui-view', props: { position: 'absolute' } };
  const p = node.props;

  if (a.xy) { const [x, y] = a.xy.split(',').map(Number); p.left = x; p.top = y; }
  if (a.size) { const [w, h] = a.size.split(',').map(Number); p.width = w; p.height = h; }

  if (a.fillColor) {
    const fc = a.fillColor.replace(/^#/, '');
    if (fc.length === 8) {
      const alpha = parseInt(fc.slice(0, 2), 16);
      const rgb = fc.slice(2);
      if (alpha > 0) { p.tint = `#${rgb}`; p.opacity = Math.round((alpha / 255) * 100) / 100; }
    } else {
      p.tint = a.fillColor;
    }
  }
  if (a.visible === 'false') p.visible = false;
  return node;
}

function emitComponentRefJSON(a, resources, allComponents) {
  const resId = a.src;
  const res = resId ? resources[resId] : null;
  const refName = res ? res.name.replace('.xml', '') : a.name;
  const refComp = allComponents[refName];

  if (!refComp) return null;

  const node = { type: '$ref', ref: refName, props: { position: 'absolute' } };
  const p = node.props;

  if (a.xy) { const [x, y] = a.xy.split(',').map(Number); p.left = x; p.top = y; }
  if (a.size) {
    const [iw, ih] = a.size.split(',').map(Number);
    // Use the larger of instance size vs component native size
    // FairyGUI's relation system often stretches components, so the native
    // size is more representative of the intended layout
    p.width = Math.max(iw || 0, refComp.width);
    p.height = Math.max(ih || 0, refComp.height);
  } else {
    p.width = refComp.width;
    p.height = refComp.height;
  }
  if (a.visible === 'false') p.visible = false;
  return node;
}

function emitListJSON(a, resources, allComponents) {
  const node = { type: 'ui-view', props: { position: 'absolute', overflow: 'hidden' }, children: [] };
  const p = node.props;

  if (a.xy) { const [x, y] = a.xy.split(',').map(Number); p.left = x; p.top = y; }
  if (a.size) { const [w, h] = a.size.split(',').map(Number); p.width = w; p.height = h; }

  const layout = a.layout || 'column';
  const margin = a.margin ? a.margin.split(',').map(Number) : [0, 0, 0, 0];
  const colGap = Number(a.columnGap) || 0;
  const rowGap = Number(a.lineGap) || 0;
  const cols = Number(a.lineItemCount) || 4;

  if (a.visible === 'false') p.visible = false;

  let itemRefName = null;
  if (a.defaultItem) {
    const match = a.defaultItem.match(/ui:\/\/\w+(\w{5})$/);
    if (match) {
      const itemRes = resources[match[1]];
      if (itemRes) itemRefName = itemRes.name.replace('.xml', '');
    }
  }
  if (!itemRefName && a.fileName) itemRefName = a.fileName.replace('.xml', '');

  const isGrid = layout === 'flow_hz';
  const isRow = layout === 'row';

  if (!isGrid) {
    p.flexDirection = isRow ? 'row' : 'column';
    const cssPadding = [margin[0], margin[3], margin[1], margin[2]];
    if (cssPadding.some(v => v > 0)) p.padding = cssPadding;
    if (colGap) p.columnGap = colGap;
    if (rowGap) p.rowGap = rowGap;
  }

  const totalItems = isGrid ? cols * 3 : cols;

  if (itemRefName && allComponents[itemRefName]) {
    const itemComp = allComponents[itemRefName];
    for (let i = 0; i < totalItems; i++) {
      const itemNode = { type: 'ui-view', props: {}, children: [] };
      const ip = itemNode.props;
      if (isGrid) {
        ip.position = 'absolute';
        const col = i % cols;
        const row = Math.floor(i / cols);
        ip.left = margin[2] + col * (itemComp.width + colGap);
        ip.top = margin[0] + row * (itemComp.height + rowGap);
      } else {
        ip.position = 'relative';
      }
      ip.width = itemComp.width;
      ip.height = itemComp.height;

      for (const child of itemComp.elements) {
        const childNode = emitElementJSON(child, resources, allComponents);
        if (childNode) itemNode.children.push(childNode);
      }
      node.children.push(itemNode);
    }
  }

  return node;
}

function emitElementJSON(el, resources, allComponents) {
  const tag = el.tag;
  const a = el.attrs;

  if (tag === 'image') return emitImageJSON(a, resources);
  if (tag === 'text') return emitTextJSON(a);
  if (tag === 'component') return emitComponentRefJSON(a, resources, allComponents);
  if (tag === 'list') return emitListJSON(a, resources, allComponents);
  if (tag === 'graph') return emitGraphJSON(a);
  return null;
}

function generateComponentJSON(compData, resources, allComponents) {
  const root = { type: 'ui-view', props: { width: compData.width, height: compData.height }, children: [] };
  for (const el of compData.elements) {
    const child = emitElementJSON(el, resources, allComponents);
    if (child) root.children.push(child);
  }
  return root;
}

function generateTowerDocument(allComponents, resources, mainComponents) {
  const sprites = {};
  for (const [id, res] of Object.entries(resources)) {
    if (res.type !== 'image') continue;
    const key = spriteKey(res.name);
    const entry = { path: spritePrefix ? `${spritePrefix}/${key}` : key };
    if (res.scale9grid) {
      const slice = calc9Slice(res.scale9grid, res.name);
      if (slice) entry.slice = [slice.sliceLeft, slice.sliceTop, slice.sliceRight, slice.sliceBottom];
    }
    sprites[key] = entry;
  }

  const mainName = mainComponents[0] || Object.keys(allComponents)[0];
  const mainComp = allComponents[mainName];

  const components = {};
  for (const [name, comp] of Object.entries(allComponents)) {
    if (name === mainName) continue;
    components[name] = generateComponentJSON(comp, resources, allComponents);
  }

  const doc = {
    $schema: 'tower-ui',
    version: '1.0',
    meta: {
      name: mainName,
      designWidth: mainComp ? mainComp.width : 1080,
      designHeight: mainComp ? mainComp.height : 1920,
      source: `fairygui:${spritePrefix || path.basename(pkgDir)}`,
    },
    assets: {
      spritePrefix: spritePrefix || path.basename(pkgDir),
      sprites,
    },
    components,
    root: mainComp ? generateComponentJSON(mainComp, resources, allComponents) : { type: 'ui-view', props: { width: 1080, height: 1920 }, children: [] },
  };

  return doc;
}

// ── Main ────────────────────────────────────────────────────────────────

const pkgXmlPath = path.join(pkgDir, 'package.xml');
if (!fs.existsSync(pkgXmlPath)) {
  console.error(`package.xml not found in ${pkgDir}`);
  process.exit(1);
}

const resources = parsePackageXml(pkgXmlPath);
console.error(`[fairy-to-tsx] Found ${Object.keys(resources).length} resources in package.xml`);

// Parse all component XMLs
const allComponents = {};
for (const [id, res] of Object.entries(resources)) {
  if (res.type !== 'component') continue;
  const xmlPath = path.join(pkgDir, res.name);
  if (!fs.existsSync(xmlPath)) {
    console.error(`  SKIP ${res.name} (file not found)`);
    continue;
  }
  const comp = parseComponentXml(xmlPath);
  if (comp) {
    const name = res.name.replace('.xml', '');
    allComponents[name] = comp;
    console.error(`  Parsed ${name} (${comp.width}x${comp.height}, ${comp.elements.length} elements)`);
  }
}

// Determine export order: exported components first, then by dependency
fs.mkdirSync(outDir, { recursive: true });
const exported = Object.entries(resources)
  .filter(([, r]) => r.type === 'component' && r.exported)
  .map(([, r]) => r.name.replace('.xml', ''));

const allNames = Object.keys(allComponents);
const toConvert = [...exported, ...allNames.filter(n => !exported.includes(n))];

if (outputFormat === 'tower') {
  console.error(`\n[fairy-to-tower] Generating .tower.json → ${outDir}\n`);
  const doc = generateTowerDocument(allComponents, resources, exported);
  const outFile = path.join(outDir, `${doc.meta.name}.tower.json`);
  fs.writeFileSync(outFile, JSON.stringify(doc, null, 2));
  console.error(`  OK  ${doc.meta.name}.tower.json`);
  console.error('\nDone.');
} else {
  console.error(`\n[fairy-to-tsx] Converting ${toConvert.length} components → ${outDir}\n`);
  for (const name of toConvert) {
    const comp = allComponents[name];
    if (!comp) continue;
    try {
      const tsx = generateComponent(comp, resources, allComponents, name);
      const outFile = path.join(outDir, `${name}.tsx`);
      fs.writeFileSync(outFile, tsx);
      console.error(`  OK  ${name}.tsx`);
    } catch (e) {
      console.error(`  FAIL ${name}: ${e.message}`);
    }
  }
  console.error('\nDone.');
}
