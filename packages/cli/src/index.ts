#!/usr/bin/env node

/**
 * @tower-ui/cli — AI-assisted game UI development tool
 *
 * Commands:
 *   tower-ui generate <description> -o <file>   Generate UI from natural language
 *   tower-ui modify <file> <description>         Modify existing UI component
 *   tower-ui from-image <image> -o <file>        Generate UI from screenshot
 *   tower-ui preview                             Start preview server
 *   tower-ui validate <file>                     Validate UI JSON
 *   tower-ui watch                               Watch + HMR dev server
 */

import { TOWER_UI_SCHEMA, validateUI, validateDocument, jsonToTSX, type UINode } from '@tower-ui/schema';
import { startDevServer } from '@tower-ui/preview';
import { handleCreate } from './create';

const args = process.argv.slice(2);
const command = args[0];

function printHelp(): void {
  console.log(`
  tower-ui — AI-assisted Game UI CLI

  Commands:
    create <name> [--dir <path>]   Create a new TowerUI game project
    dev [entry.tsx] [options]      Start web preview dev server (HMR)
    serve [options]                Start production editor server (team deployment)
    generate <desc> -o <file>      Generate TSX from description
    modify <file> <desc>           Modify existing component
    from-image <img> -o <file>     Generate TSX from screenshot
    validate <json-file>           Validate UI JSON against schema
    schema                         Print component schema
    watch                          Watch files + rebuild
    import <dir> --from fairygui --out <file.tower.json>
                                   Import FairyGUI to .tower.json
    export <file.tower.json> --to tsx --out <dir>
                                   Export .tower.json to TSX

  Options:
    -o, --output <file>    Output file path
    --dir <path>           Target directory for create (default: ./apps)
    --help                 Show help
  `);
}

function handleSchema(): void {
  const schema = TOWER_UI_SCHEMA;
  console.log(`TowerUI Schema v${schema.version}`);
  console.log(`\nComponents (${Object.keys(schema.components).length}):\n`);
  for (const [name, comp] of Object.entries(schema.components)) {
    const props = Object.entries(comp.props)
      .filter(([, d]) => d.required)
      .map(([k]) => k);
    const reqStr = props.length > 0 ? ` [required: ${props.join(', ')}]` : '';
    console.log(`  <${name}> — ${comp.description}${reqStr}`);
  }
}

function handleValidate(file: string): void {
  const fs = require('fs');
  const content = fs.readFileSync(file, 'utf-8');
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    console.error(`Error: Invalid JSON in ${file}`);
    process.exit(1);
    return;
  }

  const isTowerDoc = parsed.$schema === 'tower-ui';
  const errors = isTowerDoc ? validateDocument(parsed) : validateUI(parsed);
  if (errors.length === 0) {
    console.log(`Validation passed (${isTowerDoc ? 'TowerDocument' : 'UINode'}). No errors found.`);
  } else {
    console.error(`Found ${errors.length} error(s):`);
    for (const err of errors) {
      console.error(`  ${err.path}: ${err.message}`);
    }
    process.exit(1);
  }
}

async function callAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
  const isAnthropic = !!process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error('Set OPENAI_API_KEY or ANTHROPIC_API_KEY environment variable');
  }

  if (isAnthropic) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    const data = await res.json() as any;
    return data?.content?.[0]?.text || '';
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
    }),
  });
  const data = await res.json() as any;
  return data?.choices?.[0]?.message?.content || '';
}

function getSchemaPrompt(): string {
  const s = TOWER_UI_SCHEMA;
  const components = Object.entries(s.components).map(([name, def]) => {
    const props = Object.entries(def.props).map(([k, v]) => `${k}:${v.type}${v.required ? '(required)' : ''}`).join(', ');
    return `<${name}>: ${def.description}. Props: ${props}`;
  }).join('\n');
  return `TowerUI components:\n${components}\n\nOutput format: valid .tower.json with $schema:"tower-ui", version:"1.0", meta:{name,designWidth,designHeight}, root:{type,props,children}`;
}

async function handleGenerate(description: string, output: string): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.log('[tower-ui] No AI API key found, generating template...');
    const template: UINode = {
      type: 'ui-view',
      props: { width: 600, height: 400, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, tint: '#0d1b2aee' },
      children: [
        { type: 'ui-text', props: { text: description, fontSize: 24, color: '#e0e1dd', width: 552, height: 36, align: 'center', bold: true } },
        { type: 'ui-text', props: { text: 'Set OPENAI_API_KEY or ANTHROPIC_API_KEY for AI generation', fontSize: 12, color: '#778da9', width: 552, height: 20, align: 'center' } },
      ],
    };
    const fs = require('fs');
    const isTowerJson = output.endsWith('.tower.json');
    if (isTowerJson) {
      const doc = { $schema: 'tower-ui', version: '1.0', meta: { name: pascalCase(output), designWidth: 1080, designHeight: 1920 }, root: template };
      fs.writeFileSync(output, JSON.stringify(doc, null, 2), 'utf-8');
    } else {
      fs.writeFileSync(output, jsonToTSX(template, pascalCase(output)), 'utf-8');
    }
    console.log(`Generated template: ${output}`);
    return;
  }

  console.log(`[tower-ui] Generating UI from: "${description}"`);
  try {
    const system = `You are a UI designer for TowerGUI. Generate a .tower.json document. ${getSchemaPrompt()}. Return ONLY the JSON, no markdown.`;
    const response = await callAI(system, `Create a game UI panel: ${description}. Use designWidth=1080, designHeight=1920.`);

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('AI response did not contain valid JSON');

    const doc = JSON.parse(jsonMatch[0]);
    const errors = validateDocument(doc);
    if (errors.length > 0) {
      console.warn(`AI output has ${errors.length} validation warnings:`);
      errors.slice(0, 5).forEach((e: any) => console.warn(`  ${e.path}: ${e.message}`));
    }

    const fs = require('fs');
    fs.writeFileSync(output, JSON.stringify(doc, null, 2), 'utf-8');
    console.log(`Generated: ${output}`);
  } catch (e: any) {
    console.error(`AI generation failed: ${e.message}`);
    process.exit(1);
  }
}

async function handleModify(file: string, description: string): Promise<void> {
  const fs = require('fs');
  const content = fs.readFileSync(file, 'utf-8');

  const apiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Set OPENAI_API_KEY or ANTHROPIC_API_KEY to use AI modify');
    process.exit(1);
  }

  console.log(`[tower-ui] Modifying ${file}: "${description}"`);
  const system = `You are a UI designer for TowerGUI. Modify the given .tower.json document according to instructions. ${getSchemaPrompt()}. Return ONLY the modified JSON, no markdown.`;
  const response = await callAI(system, `Current document:\n${content}\n\nModification: ${description}`);

  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI response did not contain valid JSON');

  const doc = JSON.parse(jsonMatch[0]);
  fs.writeFileSync(file, JSON.stringify(doc, null, 2), 'utf-8');
  console.log(`Modified: ${file}`);
}

async function handleFromImage(imagePath: string, output: string): Promise<void> {
  const fs = require('fs');
  const path = require('path');

  const apiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
  const isAnthropic = !!process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.error('Set OPENAI_API_KEY or ANTHROPIC_API_KEY to use from-image');
    process.exit(1);
  }

  if (!fs.existsSync(imagePath)) {
    console.error(`Image not found: ${imagePath}`);
    process.exit(1);
  }

  console.log(`[tower-ui] Analyzing image: ${imagePath}`);
  const imageData = fs.readFileSync(imagePath);
  const base64 = imageData.toString('base64');
  const ext = path.extname(imagePath).toLowerCase();
  const mimeType = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/webp';

  const systemPrompt = `You are a UI designer for TowerGUI. Analyze the screenshot and generate a .tower.json. ${getSchemaPrompt()}. Return ONLY JSON, no markdown.`;

  let response: string;

  if (isAnthropic) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
            { type: 'text', text: 'Convert this UI screenshot to a .tower.json document.' },
          ],
        }],
      }),
    });
    const data = await res.json() as any;
    response = data?.content?.[0]?.text || '';
  } else {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: [
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
            { type: 'text', text: 'Convert this UI screenshot to a .tower.json document.' },
          ]},
        ],
        temperature: 0.3,
      }),
    });
    const data = await res.json() as any;
    response = data?.choices?.[0]?.message?.content || '';
  }

  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI response did not contain valid JSON');

  const doc = JSON.parse(jsonMatch[0]);
  fs.writeFileSync(output, JSON.stringify(doc, null, 2), 'utf-8');
  console.log(`Generated from image: ${output}`);
}

function handleWatch(): void {
  console.log('[tower-ui] Watch mode started');
  console.log('[tower-ui] Watching for TSX file changes...');
  console.log('[tower-ui] In production: chokidar + esbuild incremental + WebSocket to Unity');
  console.log('[tower-ui] Press Ctrl+C to stop');

  // Placeholder: in production this uses chokidar + esbuild + ws
  // chokidar.watch('src/**/*.tsx').on('change', async (path) => {
  //   await esbuild.rebuild();
  //   ws.send('reload');
  // });
}

function pascalCase(s: string): string {
  return s.replace(/\.tsx?$/, '')
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^./, c => c.toUpperCase());
}

function handleImport(dir: string, from: string, output: string): void {
  if (from !== 'fairygui') {
    console.error(`Unsupported import source: "${from}". Supported: fairygui`);
    process.exit(1);
    return;
  }
  const { execSync } = require('child_process');
  const path = require('path');
  const outDir = path.dirname(output);
  const prefix = path.basename(dir);
  const toolsDir = path.resolve(__dirname, '../../../tools');
  const cmd = `node "${path.join(toolsDir, 'fairy-to-tsx.mjs')}" "${dir}" --out-dir "${outDir}" --sprite-prefix "${prefix}" --format tower`;
  try {
    execSync(cmd, { stdio: 'inherit' });
    console.log(`Imported: ${output}`);
  } catch (e: any) {
    console.error(`Import failed: ${e.message}`);
    process.exit(1);
  }
}

function handleExport(file: string, to: string, outDir: string): void {
  if (to !== 'tsx') {
    console.error(`Unsupported export target: "${to}". Supported: tsx`);
    process.exit(1);
    return;
  }
  const fs = require('fs');
  const path = require('path');
  const content = fs.readFileSync(file, 'utf-8');
  let doc: any;
  try { doc = JSON.parse(content); } catch {
    console.error(`Error: Invalid JSON in ${file}`);
    process.exit(1);
    return;
  }

  const errors = validateDocument(doc);
  if (errors.length > 0) {
    console.error(`Document validation errors:`);
    errors.forEach((e: any) => console.error(`  ${e.path}: ${e.message}`));
    process.exit(1);
    return;
  }

  fs.mkdirSync(outDir, { recursive: true });
  const tsx = jsonToTSX(doc.root, pascalCase(doc.meta.name));
  const outFile = path.join(outDir, `${doc.meta.name}.tsx`);
  fs.writeFileSync(outFile, tsx, 'utf-8');
  console.log(`Exported: ${outFile}`);
}

// ── Main ──────────────────────────────────────────────────

switch (command) {
  case 'create': {
    const name = args[1];
    if (!name) { console.error('Usage: tower-ui create <project-name>'); process.exit(1); }
    const dirIdx = args.indexOf('--dir');
    const targetDir = dirIdx >= 0 ? args[dirIdx + 1] : require('path').resolve('apps');
    handleCreate({ name, targetDir });
    break;
  }
  case 'schema':
    handleSchema();
    break;
  case 'validate':
    if (!args[1]) { console.error('Usage: tower-ui validate <file>'); process.exit(1); }
    handleValidate(args[1]);
    break;
  case 'generate': {
    const desc = args[1];
    const oIdx = args.indexOf('-o');
    const output = oIdx >= 0 ? args[oIdx + 1] : 'GeneratedUI.tower.json';
    if (!desc) { console.error('Usage: tower-ui generate <description> -o <file>'); process.exit(1); }
    handleGenerate(desc, output).catch(e => { console.error(e.message); process.exit(1); });
    break;
  }
  case 'modify': {
    const modFile = args[1];
    const modDesc = args.slice(2).join(' ');
    if (!modFile || !modDesc) { console.error('Usage: tower-ui modify <file> <description>'); process.exit(1); }
    handleModify(modFile, modDesc).catch(e => { console.error(e.message); process.exit(1); });
    break;
  }
  case 'from-image': {
    const imgFile = args[1];
    const imgOIdx = args.indexOf('-o');
    const imgOutput = imgOIdx >= 0 ? args[imgOIdx + 1] : 'FromImage.tower.json';
    if (!imgFile) { console.error('Usage: tower-ui from-image <image> -o <file>'); process.exit(1); }
    handleFromImage(imgFile, imgOutput).catch(e => { console.error(e.message); process.exit(1); });
    break;
  }
  case 'serve': {
    const pIdx2 = args.indexOf('--port');
    const projIdx = args.indexOf('--projects-dir');
    const servePort = pIdx2 >= 0 ? Number(args[pIdx2 + 1]) : Number(process.env.PORT || 3000);
    const projectsDir = projIdx >= 0
      ? require('path').resolve(args[projIdx + 1])
      : process.env.TOWER_PROJECTS_DIR
        ? require('path').resolve(process.env.TOWER_PROJECTS_DIR)
        : require('path').resolve('projects');

    const fss = require('fs');
    if (!fss.existsSync(projectsDir)) fss.mkdirSync(projectsDir, { recursive: true });

    const previewEntry = require('path').resolve(__dirname, '../../preview/src/preview-entry.tsx');
    const fallbackEntry = fss.existsSync(previewEntry) ? previewEntry : undefined;
    const entry = fallbackEntry || require('path').resolve('src/preview.tsx');

    console.log(`\n  TowerUI Editor — Team Server`);
    console.log(`  Projects dir: ${projectsDir}`);

    startDevServer({
      entry,
      port: servePort,
      width: 1280,
      height: 720,
      staticDirs: [projectsDir],
    });
    break;
  }
  case 'dev':
  case 'preview': {
    const entryArg = args[1];
    const pIdx = args.indexOf('--port');
    const wIdx = args.indexOf('--width');
    const hIdx = args.indexOf('--height');
    const docIdx = args.indexOf('--document');
    const entry = entryArg || require('path').resolve('src/preview.tsx');
    const devStaticDirs: string[] = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--static' && args[i + 1]) {
        devStaticDirs.push(require('path').resolve(args[i + 1]));
        i++;
      }
    }
    startDevServer({
      entry,
      port: pIdx >= 0 ? Number(args[pIdx + 1]) : 3000,
      width: wIdx >= 0 ? Number(args[wIdx + 1]) : 1280,
      height: hIdx >= 0 ? Number(args[hIdx + 1]) : 720,
      staticDirs: devStaticDirs.length > 0 ? devStaticDirs : undefined,
      documentPath: docIdx >= 0 ? require('path').resolve(args[docIdx + 1]) : undefined,
    });
    break;
  }
  case 'watch':
    handleWatch();
    break;
  case 'import': {
    const importDir = args[1];
    const fromIdx = args.indexOf('--from');
    const importOutIdx = args.indexOf('--out');
    if (!importDir || fromIdx < 0 || importOutIdx < 0) {
      console.error('Usage: tower-ui import <dir> --from fairygui --out <file.tower.json>');
      process.exit(1);
    }
    handleImport(importDir, args[fromIdx + 1], args[importOutIdx + 1]);
    break;
  }
  case 'export': {
    const exportFile = args[1];
    const toIdx = args.indexOf('--to');
    const exportOutIdx = args.indexOf('--out');
    if (!exportFile || toIdx < 0 || exportOutIdx < 0) {
      console.error('Usage: tower-ui export <file.tower.json> --to tsx --out <dir>');
      process.exit(1);
    }
    handleExport(exportFile, args[toIdx + 1], args[exportOutIdx + 1]);
    break;
  }
  case '--help':
  case 'help':
  case undefined:
    printHelp();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
}
