#!/usr/bin/env node
/**
 * coverage-check.mjs — Automated pipeline coverage verifier.
 *
 * Introspects the ACTUAL source code of:
 *   1. prefab-parser.mjs  → what Unity components are PARSED
 *   2. tower-gen.mjs      → what node types / props are GENERATED
 *   3. TowerUICore.cs     → what node types / props are COMPILED back to prefab
 *   4. UIBridge.cs         → what Create* methods exist
 *   5. PropsPanel.tsx      → what props are EDITABLE in the editor
 *
 * Outputs a coverage matrix showing gaps.
 *
 * Usage: node tools/coverage-check.mjs [--json]
 */
import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');
const jsonOutput = process.argv.includes('--json');

// ── 1. Scan prefab-parser.mjs for parsed component types ──

function scanParser() {
  const src = fs.readFileSync(path.join(root, 'tools/lib/prefab-parser.mjs'), 'utf-8');

  // Extract case 'XXX': patterns
  const caseMatches = [...src.matchAll(/case\s+['"](\w+)['"]\s*:/g)];
  const types = new Set(caseMatches.map(m => m[1]));

  // Extract GUID_TYPE entries
  const guidMatches = [...src.matchAll(/['"]([a-f0-9]{32})['"]\s*:\s*['"]([\w]+)['"]/g)];
  for (const m of guidMatches) types.add(m[2]);

  // Extract heuristic detection patterns (type = 'XXX')
  const heuristicMatches = [...src.matchAll(/type\s*=\s*['"](\w+)['"]/g)];
  for (const m of heuristicMatches) types.add(m[1]);

  // Extract properties per component type
  const propsByType = {};
  const blocks = src.split(/case\s+['"]/);
  for (const block of blocks.slice(1)) {
    const typeEnd = block.indexOf("'");
    if (typeEnd < 0) continue;
    const typeName = block.slice(0, typeEnd);
    const props = new Set();
    // comp.XXX = pattern
    const propAssigns = [...block.matchAll(/comp\.(\w+)\s*=/g)];
    for (const m of propAssigns) props.add(m[1]);
    if (props.size > 0) propsByType[typeName] = [...props];
  }

  return { types: [...types].sort(), propsByType };
}

// ── 2. Scan tower-gen.mjs for generated node types and props ──

function scanGenerator() {
  const src = fs.readFileSync(path.join(root, 'tools/lib/tower-gen.mjs'), 'utf-8');

  const nodeTypes = new Set();
  // type: 'ui-xxx'  or  = 'ui-xxx'
  const typeMatches = [...src.matchAll(/(?:type:\s*|=\s*)['"](\w[\w-]+)['"]/g)];
  for (const m of typeMatches) {
    if (m[1].startsWith('ui-')) nodeTypes.add(m[1]);
  }
  // Also detect string assignments like nodeType = 'ui-image'
  const assignMatches = [...src.matchAll(/['"]ui-([\w]+)['"]/g)];
  for (const m of assignMatches) nodeTypes.add(`ui-${m[1]}`);

  // Detect all props.xxx = assignments
  const genProps = new Set();
  const propMatches = [...src.matchAll(/props\.(\w+)\s*=/g)];
  for (const m of propMatches) genProps.add(m[1]);

  // PRESERVED_INTERNAL entries
  const preservedMatches = [...src.matchAll(/'(_\w+)'/g)];
  for (const m of preservedMatches) genProps.add(m[1]);

  return { nodeTypes: [...nodeTypes].sort(), props: [...genProps].sort() };
}

// ── 3. Scan TowerUICore.cs for compiled node types and applied props ──

function scanCompiler() {
  const corePath = path.join(root, 'packages/unity-runtime/Runtime/Scripts/TowerUICore.cs');
  const src = fs.readFileSync(corePath, 'utf-8');

  const nodeTypes = new Set();
  // case "ui-xxx":
  const caseMatches = [...src.matchAll(/case\s+"(ui-[\w]+)":/g)];
  for (const m of caseMatches) nodeTypes.add(m[1]);
  // default branch handles ui-view
  if (src.includes('default:') && src.includes('ApplyViewProps')) nodeTypes.add('ui-view');

  // Detect Apply*Props methods
  const applyMethods = [...src.matchAll(/public static void (Apply\w+Props)/g)];

  // Detect props.GetString("xxx"), props.GetFloat("xxx"), props.GetBool("xxx")
  const compiledProps = new Set();
  const getPropMatches = [...src.matchAll(/props\.Get(?:String|Float|Bool|Object|Raw)\s*\(\s*"(\w+)"/g)];
  for (const m of getPropMatches) compiledProps.add(m[1]);

  return {
    nodeTypes: [...nodeTypes].sort(),
    applyMethods: applyMethods.map(m => m[1]),
    compiledProps: [...compiledProps].sort(),
  };
}

// ── 4. Scan UIBridge.cs for Create* methods ──

function scanBridge() {
  const src = fs.readFileSync(path.join(root, 'packages/unity-runtime/Runtime/Scripts/UIBridge.cs'), 'utf-8');

  const createMethods = [];
  const matches = [...src.matchAll(/public static GameObject (Create\w+)\s*\(/g)];
  for (const m of matches) createMethods.push(m[1]);

  return { createMethods };
}

// ── 5. Scan PropsPanel.tsx for editable props ──

function scanEditor() {
  const src = fs.readFileSync(path.join(root, 'packages/editor/src/PropsPanel.tsx'), 'utf-8');

  const editableProps = new Set();
  // Array literal strings in *_PROPS arrays
  const propArrayMatches = [...src.matchAll(/'(\w+)'/g)];
  for (const m of propArrayMatches) editableProps.add(m[1]);

  // ComponentPalette node types
  const paletteSrc = fs.readFileSync(path.join(root, 'packages/editor/src/ComponentPalette.tsx'), 'utf-8');
  const paletteTypes = new Set();
  const paletteMatches = [...paletteSrc.matchAll(/type:\s*'(ui-[\w]+)'/g)];
  for (const m of paletteMatches) paletteTypes.add(m[1]);

  return { editableProps: [...editableProps].sort(), paletteTypes: [...paletteTypes].sort() };
}

// ── 6. Scan for all .cs runtime scripts ──

function scanRuntimeScripts() {
  const dir = path.join(root, 'packages/unity-runtime/Runtime/Scripts');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.cs')).sort();
}

// ── Main ──

const parser = scanParser();
const generator = scanGenerator();
const compiler = scanCompiler();
const bridge = scanBridge();
const editor = scanEditor();
const runtimeScripts = scanRuntimeScripts();

// ── Build coverage matrix ──

const allNodeTypes = new Set([
  ...generator.nodeTypes.filter(t => t.startsWith('ui-')),
  ...compiler.nodeTypes,
  ...editor.paletteTypes,
]);

const nodeTypeMatrix = [];
for (const type of [...allNodeTypes].sort()) {
  nodeTypeMatrix.push({
    type,
    generated: generator.nodeTypes.includes(type),
    compiled: compiler.nodeTypes.includes(type),
    editorPalette: editor.paletteTypes.includes(type),
    hasBridgeCreate: bridge.createMethods.some(m =>
      m.toLowerCase().includes(type.replace('ui-', '').toLowerCase())
    ),
  });
}

// ── Property coverage: generated → compiled ──

const genPropsSet = new Set(generator.props);
const compiledPropsSet = new Set(compiler.compiledProps);

const propsGenNotCompiled = generator.props.filter(p => !compiledPropsSet.has(p) && !p.startsWith('$'));
const propsCompiledNotGen = compiler.compiledProps.filter(p => !genPropsSet.has(p));

// ── Gap analysis ──

const gaps = [];

for (const row of nodeTypeMatrix) {
  if (!row.compiled) gaps.push({ severity: 'CRITICAL', msg: `Node type "${row.type}" generated but NOT compiled → becomes empty view` });
  if (!row.editorPalette) gaps.push({ severity: 'LOW', msg: `Node type "${row.type}" not in editor palette → can't add via UI` });
  if (!row.hasBridgeCreate && row.compiled) gaps.push({ severity: 'MEDIUM', msg: `Node type "${row.type}" compiled but no dedicated UIBridge.Create method` });
}

for (const p of propsGenNotCompiled) {
  if (p.startsWith('_')) {
    gaps.push({ severity: 'MEDIUM', msg: `Internal prop "${p}" generated by tower-gen but not read by compiler` });
  }
}

// ── Output ──

if (jsonOutput) {
  console.log(JSON.stringify({
    parser: { componentTypes: parser.types, propsByType: parser.propsByType },
    generator: { nodeTypes: generator.nodeTypes, props: generator.props },
    compiler: { nodeTypes: compiler.nodeTypes, applyMethods: compiler.applyMethods, props: compiler.compiledProps },
    bridge: { createMethods: bridge.createMethods },
    editor: { paletteTypes: editor.paletteTypes, editableProps: editor.editableProps },
    runtimeScripts,
    nodeTypeMatrix,
    propsGenNotCompiled,
    propsCompiledNotGen,
    gaps,
  }, null, 2));
} else {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║       TowerGUI Pipeline Coverage Report            ║');
  console.log('╠════════════════════════════════════════════════════╣\n');

  // Node type matrix
  console.log('  ┌───────────────┬───────────┬──────────┬─────────┬───────────┐');
  console.log('  │ Node Type     │ Generated │ Compiled │ Editor  │ UIBridge  │');
  console.log('  ├───────────────┼───────────┼──────────┼─────────┼───────────┤');
  for (const row of nodeTypeMatrix) {
    const t = row.type.padEnd(13);
    const g = (row.generated ? '  ✓' : '  ✗').padEnd(9);
    const c = (row.compiled ? '  ✓' : '  ✗').padEnd(8);
    const e = (row.editorPalette ? '  ✓' : '  -').padEnd(7);
    const b = (row.hasBridgeCreate ? '  ✓' : '  -').padEnd(9);
    console.log(`  │ ${t} │ ${g} │ ${c} │ ${e} │ ${b} │`);
  }
  console.log('  └───────────────┴───────────┴──────────┴─────────┴───────────┘\n');

  // Parsed component types
  console.log(`  Parsed Unity components (${parser.types.length}):`);
  console.log(`    ${parser.types.join(', ')}\n`);

  // Compiler Apply methods
  console.log(`  Compiler Apply* methods (${compiler.applyMethods.length}):`);
  console.log(`    ${compiler.applyMethods.join(', ')}\n`);

  // UIBridge Create methods
  console.log(`  UIBridge Create* methods (${bridge.createMethods.length}):`);
  console.log(`    ${bridge.createMethods.join(', ')}\n`);

  // Props coverage
  console.log(`  Generated props: ${generator.props.length}`);
  console.log(`  Compiled props:  ${compiler.compiledProps.length}`);

  if (propsGenNotCompiled.length > 0) {
    console.log(`\n  Props generated but NOT compiled (${propsGenNotCompiled.length}):`);
    for (const p of propsGenNotCompiled) console.log(`    - ${p}`);
  }

  // Gaps
  if (gaps.length > 0) {
    console.log('\n  ══ GAPS FOUND ══\n');
    const critical = gaps.filter(g => g.severity === 'CRITICAL');
    const medium = gaps.filter(g => g.severity === 'MEDIUM');
    const low = gaps.filter(g => g.severity === 'LOW');
    if (critical.length > 0) {
      console.log('  CRITICAL (pipeline broken):');
      for (const g of critical) console.log(`    ✗ ${g.msg}`);
    }
    if (medium.length > 0) {
      console.log('  MEDIUM (data loss):');
      for (const g of medium) console.log(`    ⚠ ${g.msg}`);
    }
    if (low.length > 0) {
      console.log('  LOW (convenience):');
      for (const g of low) console.log(`    ○ ${g.msg}`);
    }
  } else {
    console.log('\n  ✓ NO GAPS FOUND — full coverage!\n');
  }

  console.log(`\n  Runtime C# scripts (${runtimeScripts.length}):`);
  for (const s of runtimeScripts) console.log(`    ${s}`);

  console.log('\n╚════════════════════════════════════════════════════╝\n');
}
