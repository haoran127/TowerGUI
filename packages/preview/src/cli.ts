#!/usr/bin/env node

import { startDevServer } from './server';
import * as path from 'path';

const args = process.argv.slice(2);

function parseArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      result[key] = args[i + 1] || '';
      i++;
    } else if (!result.entry) {
      result.entry = args[i];
    }
  }
  return result;
}

const parsed = parseArgs(args);

if (!parsed.entry) {
  console.log(`
  Usage: tower-ui-preview <entry.tsx> [options]

  Options:
    --port <number>       Port (default: 3000)
    --width <number>      Canvas width (default: 1280)
    --height <number>     Canvas height (default: 720)
    --title <string>      Window title
    --static <path>       Additional static asset directory (can repeat)
    --document <path>     .tower.json file for editor (enables /editor page)

  Example:
    tower-ui-preview src/App.tsx --port 3000 --width 1920 --height 1080
    tower-ui-preview src/App.tsx --document ui/main.tower.json
  `);
  process.exit(0);
}

const staticDirs: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--static' && args[i + 1]) {
    staticDirs.push(path.resolve(args[i + 1]));
    i++;
  }
}

startDevServer({
  entry: path.resolve(parsed.entry),
  port: parsed.port ? Number(parsed.port) : undefined,
  width: parsed.width ? Number(parsed.width) : undefined,
  height: parsed.height ? Number(parsed.height) : undefined,
  title: parsed.title,
  staticDirs: staticDirs.length > 0 ? staticDirs : undefined,
  documentPath: parsed.document ? path.resolve(parsed.document) : undefined,
});
