#!/usr/bin/env node
/**
 * tower-to-proto — Generate Protobuf (.proto) files from .tower.json dataBind annotations.
 *
 * Usage:
 *   node tools/tower-to-proto.mjs <input.tower.json> [-o output_dir]
 *   node tools/tower-to-proto.mjs --dir <dir> [-o output_dir]   (batch all .tower.json in dir)
 */
import fs from 'fs';
import path from 'path';

function collectBindings(node, results = [], nodePath = 'root') {
  if (!node || typeof node !== 'object') return results;

  if (node.dataBind) {
    results.push({
      path: nodePath,
      name: node.props?.name || '',
      type: node.type,
      dataBind: node.dataBind,
    });
  }

  if (Array.isArray(node.children)) {
    node.children.forEach((child, i) => {
      if (typeof child === 'object') {
        collectBindings(child, results, `${nodePath}.${i}`);
      }
    });
  }

  return results;
}

function toPascalCase(str) {
  return str
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^./, c => c.toUpperCase());
}

function toCamelCase(str) {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function generateProto(doc, filePath) {
  const screenName = doc.meta?.name || path.basename(filePath, '.tower.json');
  const msgName = toPascalCase(screenName);
  const bindings = collectBindings(doc.root);

  if (bindings.length === 0) {
    return null;
  }

  const displays = bindings.filter(b => b.dataBind.role === 'display');
  const events = bindings.filter(b => b.dataBind.role === 'event');
  const lists = bindings.filter(b => b.dataBind.role === 'list');

  const lines = [];
  lines.push('syntax = "proto3";');
  lines.push('');
  lines.push(`package tower.${toCamelCase(screenName)};`);
  lines.push('');

  // Data message for display fields
  if (displays.length > 0 || lists.length > 0) {
    lines.push(`// Data pushed to UI when ${screenName} opens`);
    lines.push(`message ${msgName}Data {`);
    let fieldNum = 1;

    for (const d of displays) {
      const fieldName = d.dataBind.field || toCamelCase(d.name || `field${fieldNum}`);
      const protoType = d.dataBind.protoType || 'string';
      lines.push(`  ${protoType} ${fieldName} = ${fieldNum}; // ${d.type} "${d.name}"`);
      fieldNum++;
    }

    for (const l of lists) {
      const fieldName = l.dataBind.field || toCamelCase(l.name || `list${fieldNum}`);
      const itemType = l.dataBind.itemType || `${msgName}${toPascalCase(fieldName)}Item`;
      lines.push(`  repeated ${itemType} ${fieldName} = ${fieldNum}; // ${l.type} "${l.name}"`);
      fieldNum++;
    }

    lines.push('}');
    lines.push('');
  }

  // List item messages
  for (const l of lists) {
    const fieldName = l.dataBind.field || toCamelCase(l.name || 'items');
    const itemType = l.dataBind.itemType || `${msgName}${toPascalCase(fieldName)}Item`;
    lines.push(`message ${itemType} {`);
    lines.push('  string id = 1;');
    lines.push('  string name = 2;');
    lines.push('  string icon = 3;');
    lines.push('  int32 count = 4;');
    lines.push('}');
    lines.push('');
  }

  // Event request/response messages
  for (const ev of events) {
    const evName = ev.dataBind.event || `on${toPascalCase(ev.name || 'Action')}`;
    const reqName = `${msgName}${toPascalCase(evName)}Req`;
    const respName = `${msgName}${toPascalCase(evName)}Resp`;

    lines.push(`// Event: ${evName} from "${ev.name}" (${ev.type})`);
    lines.push(`message ${reqName} {`);
    lines.push('  // Add request fields as needed');
    lines.push('}');
    lines.push('');
    lines.push(`message ${respName} {`);
    lines.push('  int32 code = 1;');
    lines.push('  string message = 2;');
    lines.push('}');
    lines.push('');
  }

  return { screenName, msgName, content: lines.join('\n'), bindings };
}

function processFile(filePath, outputDir) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (e) {
    console.error(`[SKIP] Invalid JSON: ${filePath}`);
    return null;
  }

  if (doc.$schema !== 'tower-ui') {
    console.error(`[SKIP] Not a tower-ui document: ${filePath}`);
    return null;
  }

  const result = generateProto(doc, filePath);
  if (!result) {
    console.log(`[SKIP] No dataBind annotations: ${filePath}`);
    return null;
  }

  const outPath = path.join(outputDir, `${result.screenName}.proto`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, result.content, 'utf-8');
  console.log(`[OK] ${outPath} (${result.bindings.length} bindings)`);
  return result;
}

// CLI
const args = process.argv.slice(2);
let inputPath = null;
let outputDir = null;
let batchDir = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '-o' && args[i + 1]) {
    outputDir = args[++i];
  } else if (args[i] === '--dir' && args[i + 1]) {
    batchDir = args[++i];
  } else if (!inputPath) {
    inputPath = args[i];
  }
}

if (!inputPath && !batchDir) {
  console.log('Usage: node tools/tower-to-proto.mjs <input.tower.json> [-o output_dir]');
  console.log('       node tools/tower-to-proto.mjs --dir <dir> [-o output_dir]');
  process.exit(1);
}

outputDir = outputDir || './generated/proto';

if (batchDir) {
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.tower.json')) files.push(full);
    }
  }
  walk(batchDir);
  console.log(`Found ${files.length} .tower.json files in ${batchDir}`);
  let generated = 0;
  for (const f of files) {
    if (processFile(f, outputDir)) generated++;
  }
  console.log(`Generated ${generated} .proto files`);
} else {
  processFile(inputPath, outputDir);
}
