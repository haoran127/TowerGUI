import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import * as esbuild from 'esbuild';

export interface DevServerOptions {
  port?: number;
  entry: string;
  outdir?: string;
  width?: number;
  height?: number;
  title?: string;
  /** Additional directories to serve static files from (checked in order after outdir) */
  staticDirs?: string[];
  /** Path to the .tower.json file being edited (enables editor API) */
  documentPath?: string;
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

export async function startDevServer(opts: DevServerOptions) {
  const port = opts.port ?? 3000;
  const outdir = opts.outdir ?? path.join(process.cwd(), '.tower-preview');
  const width = opts.width ?? 1280;
  const height = opts.height ?? 720;
  const title = opts.title ?? 'TowerUI Preview';

  if (!fs.existsSync(outdir)) fs.mkdirSync(outdir, { recursive: true });

  const bundlePath = path.join(outdir, 'bundle.js');

  // Generate HTML shell
  const htmlContent = generateHTML(title, width, height);
  const htmlPath = path.join(outdir, 'index.html');
  fs.writeFileSync(htmlPath, htmlContent);

  // Resolve workspace packages
  const packagesDir = path.resolve(__dirname, '../../');

  const ctx = await esbuild.context({
    entryPoints: [opts.entry],
    bundle: true,
    outfile: bundlePath,
    format: 'esm',
    platform: 'browser',
    target: 'es2020',
    jsx: 'automatic',
    sourcemap: true,
    define: {
      'process.env.NODE_ENV': '"development"',
      'CS': 'undefined',
    },
    alias: {
      '@tower-ui/core': path.join(packagesDir, 'core/src/index.ts'),
      '@tower-ui/web-adapter': path.join(packagesDir, 'web-adapter/src/index.ts'),
    },
    external: ['csharp', 'puerts'],
    loader: { '.ts': 'ts', '.tsx': 'tsx' },
    logLevel: 'warning',
  });

  await ctx.rebuild();
  console.log(`[TowerUI Preview] Initial build done`);

  // Build editor app
  const editorEntryPath = path.join(packagesDir, 'editor/src/main.tsx');
  let editorCtx: any = null;
  if (fs.existsSync(editorEntryPath)) {
    const editorBundlePath = path.join(outdir, 'editor-bundle.js');
    const editorCssPath = path.join(outdir, 'editor-styles.css');
    try {
      const previewNodeModules = path.resolve(__dirname, '../node_modules');
      editorCtx = await esbuild.context({
        entryPoints: [editorEntryPath],
        bundle: true,
        outfile: editorBundlePath,
        format: 'esm',
        platform: 'browser',
        target: 'es2020',
        charset: 'utf8',
        jsx: 'automatic',
        sourcemap: true,
        define: {
          'process.env.NODE_ENV': '"development"',
        },
        alias: {
          '@tower-ui/core': path.join(packagesDir, 'core/src/index.ts'),
          '@tower-ui/web-adapter': path.join(packagesDir, 'web-adapter/src/index.ts'),
          '@tower-ui/schema': path.join(packagesDir, 'schema/src/index.ts'),
        },
        nodePaths: [previewNodeModules],
        external: ['csharp', 'puerts'],
        loader: { '.ts': 'ts', '.tsx': 'tsx', '.css': 'css' },
        logLevel: 'warning',
      });
      await editorCtx.rebuild();
      console.log(`[TowerUI Editor] Editor build done`);
    } catch (e) {
      console.warn('[TowerUI Editor] Editor build failed:', e);
    }

    const editorHtml = generateEditorHTML();
    fs.writeFileSync(path.join(outdir, 'editor.html'), editorHtml);
  }

  // WebSocket for HMR
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Set<WebSocket>();

  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.on('close', () => clients.delete(ws));
  });

  function notifyClients() {
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'reload' }));
      }
    }
  }

  // Watch for changes (app entry)
  const watcher = fs.watch(path.dirname(opts.entry), { recursive: true }, async (event, filename) => {
    if (!filename) return;
    if (!filename.match(/\.(tsx?|css)$/)) return;
    try {
      const start = Date.now();
      await ctx.rebuild();
      const elapsed = Date.now() - start;
      console.log(`[HMR] Rebuilt in ${elapsed}ms: ${filename}`);
      notifyClients();
    } catch (e) {
      console.error('[HMR] Build error:', e);
    }
  });

  // Watch for editor source changes
  if (editorCtx) {
    const editorSrcDir = path.join(packagesDir, 'editor/src');
    if (fs.existsSync(editorSrcDir)) {
      fs.watch(editorSrcDir, { recursive: true }, async (event, filename) => {
        if (!filename) return;
        if (!filename.match(/\.(tsx?|css)$/)) return;
        try {
          const start = Date.now();
          await editorCtx.rebuild();
          const elapsed = Date.now() - start;
          console.log(`[Editor HMR] Rebuilt in ${elapsed}ms: ${filename}`);
          notifyEditorClients({ type: 'editor-reload' });
        } catch (e) {
          console.error('[Editor HMR] Build error:', e);
        }
      });
    }
  }

  const staticDirs = opts.staticDirs ?? [];
  let documentPath = opts.documentPath ?? null;
  const projectState: { dir: string | null } = { dir: null };
  if (!documentPath) {
    documentPath = path.join(process.cwd(), 'current.tower.json');
  }

  // ── User presence tracking ──
  interface UserPresence {
    userId: string;
    userName: string;
    color: string;
    documentPath: string | null;
    lastActive: number;
    ws: WebSocket;
  }
  const presenceMap = new Map<WebSocket, UserPresence>();
  const USER_COLORS = ['#4da6ff','#ff6b6b','#51cf66','#fcc419','#cc5de8','#ff922b','#20c997','#f06595'];
  let colorIdx = 0;

  function broadcastPresence() {
    const users = Array.from(presenceMap.values()).map(u => ({
      userId: u.userId,
      userName: u.userName,
      color: u.color,
      documentPath: u.documentPath,
      lastActive: u.lastActive,
    }));
    const payload = JSON.stringify({ type: 'presence', users });
    for (const c of editorClients) {
      if (c.readyState === WebSocket.OPEN) c.send(payload);
    }
  }

  // ── Edit locks ──
  const editLocks = new Map<string, { userId: string; userName: string; since: number }>();

  function tryLock(docPath: string, userId: string, userName: string): boolean {
    const existing = editLocks.get(docPath);
    if (existing && existing.userId !== userId) {
      if (Date.now() - existing.since < 5 * 60 * 1000) return false;
    }
    editLocks.set(docPath, { userId, userName, since: Date.now() });
    return true;
  }

  function releaseLock(docPath: string, userId: string) {
    const lock = editLocks.get(docPath);
    if (lock && lock.userId === userId) editLocks.delete(docPath);
  }

  function releaseAllLocks(userId: string) {
    for (const [k, v] of editLocks) {
      if (v.userId === userId) editLocks.delete(k);
    }
  }

  // If document already exists, try to auto-register sprite directories
  if (documentPath && fs.existsSync(documentPath)) {
    try {
      const existingDoc = JSON.parse(fs.readFileSync(documentPath, 'utf-8'));

      // Auto-flatten $ref nodes in existing document
      if (existingDoc?.components && existingDoc?.root) {
        const refCount = Object.keys(existingDoc.components).length;
        if (refCount > 0) {
          flattenRefs(existingDoc.root, existingDoc.components);
          fs.writeFileSync(documentPath, JSON.stringify(existingDoc, null, 2), 'utf-8');
          console.log(`[Startup] Flattened ${refCount} component refs in existing document`);
        }
      }

      const source = existingDoc?.meta?.source;
      if (source && typeof source === 'string' && source.startsWith('fairygui:')) {
        const pkgName = source.split(':')[1];
        const candidates = [
          path.join(process.cwd(), 'apps', pkgName, 'assets', pkgName),
          path.join(process.cwd(), 'assets', pkgName),
          path.join(process.cwd(), pkgName),
        ];
        for (const c of candidates) {
          if (fs.existsSync(c) && fs.existsSync(path.join(c, 'package.xml'))) {
            if (!staticDirs.includes(c)) {
              staticDirs.push(c);
              console.log(`[Startup] Auto-registered sprite dir: ${c}`);
            }
            break;
          }
        }
      }
    } catch {}
  }

  // Editor WebSocket clients (separate from HMR)
  const editorWss = new WebSocketServer({ noServer: true });
  const editorClients = new Set<WebSocket>();
  editorWss.on('connection', (ws) => {
    editorClients.add(ws);

    ws.on('close', () => {
      editorClients.delete(ws);
      const presence = presenceMap.get(ws);
      if (presence) {
        releaseAllLocks(presence.userId);
        presenceMap.delete(ws);
        broadcastPresence();
      }
    });

    ws.on('message', (data) => {
      const raw = data.toString();
      try {
        const msg = JSON.parse(raw);

        if (msg.type === 'join') {
          const userId = msg.userId || `user-${Date.now()}`;
          const userName = msg.userName || 'Anonymous';
          presenceMap.set(ws, {
            userId, userName,
            color: USER_COLORS[colorIdx++ % USER_COLORS.length],
            documentPath: null,
            lastActive: Date.now(),
            ws,
          });
          broadcastPresence();
          // send current locks
          const locks: Record<string, any> = {};
          for (const [k, v] of editLocks) locks[k] = v;
          ws.send(JSON.stringify({ type: 'locks', locks }));
          return;
        }

        if (msg.type === 'focus-document') {
          const presence = presenceMap.get(ws);
          if (presence) {
            if (presence.documentPath) releaseLock(presence.documentPath, presence.userId);
            presence.documentPath = msg.path || null;
            presence.lastActive = Date.now();
            if (msg.path) tryLock(msg.path, presence.userId, presence.userName);
          }
          broadcastPresence();
          const locks: Record<string, any> = {};
          for (const [k, v] of editLocks) locks[k] = v;
          notifyEditorClients({ type: 'locks', locks });
          return;
        }

        if (msg.type === 'cursor-move' || msg.type === 'selection-change') {
          const presence = presenceMap.get(ws);
          if (presence) {
            for (const c of editorClients) {
              if (c !== ws && c.readyState === WebSocket.OPEN) {
                c.send(JSON.stringify({ ...msg, userId: presence.userId, userName: presence.userName, color: presence.color }));
              }
            }
          }
          return;
        }

        if (msg.type === 'node-update') {
          const presence = presenceMap.get(ws);
          if (presence) presence.lastActive = Date.now();
          for (const c of editorClients) {
            if (c !== ws && c.readyState === WebSocket.OPEN) {
              c.send(raw);
            }
          }
          return;
        }
      } catch {}

      for (const c of editorClients) {
        if (c !== ws && c.readyState === WebSocket.OPEN) {
          c.send(raw);
        }
      }
    });
  });

  function notifyEditorClients(msg: object) {
    const payload = JSON.stringify(msg);
    for (const c of editorClients) {
      if (c.readyState === WebSocket.OPEN) c.send(payload);
    }
  }

  function resolveFile(urlPath: string): { filePath: string; contentType: string } | null {
    const searchDirs = [outdir, ...staticDirs];
    const ext = path.extname(urlPath);

    for (const dir of searchDirs) {
      const candidate = path.join(dir, urlPath);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return { filePath: candidate, contentType: MIME_TYPES[path.extname(candidate)] || 'application/octet-stream' };
      }
      if (!ext) {
        for (const tryExt of ['.png', '.jpg', '.jpeg', '.svg']) {
          const withExt = candidate + tryExt;
          if (fs.existsSync(withExt) && fs.statSync(withExt).isFile()) {
            return { filePath: withExt, contentType: MIME_TYPES[tryExt] || 'application/octet-stream' };
          }
        }
      }
    }
    return null;
  }

  function readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }

  function sendJson(res: http.ServerResponse, data: any, status = 200) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(data));
  }

  function sendError(res: http.ServerResponse, message: string, status = 400) {
    sendJson(res, { error: message }, status);
  }

  // HTTP server
  const server = http.createServer(async (req, res) => {
    const method = req.method ?? 'GET';
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const urlPath = url.pathname;

    // CORS preflight
    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    // ── Project API ──

    if (urlPath === '/api/project' && method === 'GET') {
      // Return current project info
      const projectDir = projectState.dir;
      if (!projectDir) {
        sendJson(res, { open: false });
        return;
      }
      const cfgPath = path.join(projectDir, 'tower.project.json');
      let config: any = {};
      if (fs.existsSync(cfgPath)) {
        try { config = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')); } catch {}
      }
      sendJson(res, { open: true, dir: projectDir, config });
      return;
    }

    if (urlPath === '/api/project/create' && method === 'POST') {
      try {
        const body = await readBody(req);
        const { dir, name, designWidth, designHeight } = JSON.parse(body);
        if (!dir || !name) { sendError(res, 'dir and name are required'); return; }

        const projectDir = path.resolve(dir, name);
        fs.mkdirSync(projectDir, { recursive: true });
        fs.mkdirSync(path.join(projectDir, 'screens'), { recursive: true });
        fs.mkdirSync(path.join(projectDir, 'components'), { recursive: true });
        fs.mkdirSync(path.join(projectDir, 'assets'), { recursive: true });

        const config = {
          name,
          designWidth: designWidth || 1080,
          designHeight: designHeight || 1920,
          created: new Date().toISOString(),
        };
        fs.writeFileSync(path.join(projectDir, 'tower.project.json'), JSON.stringify(config, null, 2), 'utf-8');

        // Create a default screen
        const defaultDoc = {
          $schema: 'tower-ui',
          version: '1.0',
          meta: { name: 'MainScreen', designWidth: config.designWidth, designHeight: config.designHeight },
          root: { type: 'ui-view', props: { width: config.designWidth, height: config.designHeight }, children: [] },
        };
        fs.writeFileSync(path.join(projectDir, 'screens', 'MainScreen.tower.json'), JSON.stringify(defaultDoc, null, 2), 'utf-8');

        projectState.dir = projectDir;
        documentPath = path.join(projectDir, 'screens', 'MainScreen.tower.json');
        sendJson(res, { ok: true, dir: projectDir, config });
      } catch (e: any) {
        sendError(res, e.message, 500);
      }
      return;
    }

    if (urlPath === '/api/project/open' && method === 'POST') {
      try {
        const body = await readBody(req);
        const { dir } = JSON.parse(body);
        if (!dir || !fs.existsSync(dir)) { sendError(res, 'Directory not found'); return; }

        const projectDir = path.resolve(dir);
        // Find tower.project.json (may be in dir or subdirectory)
        let cfgPath = path.join(projectDir, 'tower.project.json');
        if (!fs.existsSync(cfgPath)) {
          sendError(res, 'No tower.project.json found. Use "New Project" to create one, or select a project directory.');
          return;
        }

        const config = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
        projectState.dir = projectDir;

        // Auto-open first screen
        const screensDir = path.join(projectDir, 'screens');
        if (fs.existsSync(screensDir)) {
          const screens = fs.readdirSync(screensDir).filter((f: string) => f.endsWith('.tower.json'));
          if (screens.length > 0) {
            documentPath = path.join(screensDir, screens[0]);
          }
        }
        // Register asset dirs for sprites
        const assetsDir = path.join(projectDir, 'assets');
        if (fs.existsSync(assetsDir) && !staticDirs.includes(assetsDir)) {
          staticDirs.push(assetsDir);
        }
        sendJson(res, { ok: true, dir: projectDir, config });
      } catch (e: any) {
        sendError(res, e.message, 500);
      }
      return;
    }

    // ── Multi-project listing ──
    if (urlPath === '/api/projects' && method === 'GET') {
      const projectsRoot = process.env.TOWER_PROJECTS_DIR || null;
      const dirs: { name: string; path: string; lastModified: number }[] = [];

      function scanForProjects(baseDir: string) {
        try {
          for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
            if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
            const full = path.join(baseDir, entry.name);
            const cfgPath = path.join(full, 'tower.project.json');
            if (fs.existsSync(cfgPath)) {
              const stat = fs.statSync(cfgPath);
              dirs.push({ name: entry.name, path: full, lastModified: stat.mtimeMs });
            }
          }
        } catch {}
      }

      if (projectsRoot && fs.existsSync(projectsRoot)) {
        scanForProjects(projectsRoot);
      }
      const cwd = process.cwd();
      if (fs.existsSync(path.join(cwd, 'projects'))) {
        scanForProjects(path.join(cwd, 'projects'));
      }

      dirs.sort((a, b) => b.lastModified - a.lastModified);
      sendJson(res, {
        projects: dirs,
        current: projectState.dir,
        projectsRoot,
      });
      return;
    }

    // ── User presence & locks query ──
    if (urlPath === '/api/presence' && method === 'GET') {
      const users = Array.from(presenceMap.values()).map(u => ({
        userId: u.userId,
        userName: u.userName,
        color: u.color,
        documentPath: u.documentPath,
        lastActive: u.lastActive,
      }));
      const locks: Record<string, any> = {};
      for (const [k, v] of editLocks) locks[k] = v;
      sendJson(res, { users, locks, onlineCount: users.length });
      return;
    }

    // ── File management API ──

    if (urlPath === '/api/files' && method === 'GET') {
      const dirParam = url.searchParams.get('dir');
      const baseDir = dirParam ? path.resolve(dirParam) : projectState.dir;
      if (!baseDir || !fs.existsSync(baseDir)) {
        sendJson(res, { files: [] });
        return;
      }
      const result = listProjectFiles(baseDir, baseDir);
      sendJson(res, { root: baseDir, files: result });
      return;
    }

    if (urlPath === '/api/files' && method === 'POST') {
      try {
        const body = await readBody(req);
        const { filePath, type, content } = JSON.parse(body);
        if (!filePath) { sendError(res, 'filePath required'); return; }
        const absPath = path.resolve(filePath);

        if (type === 'directory') {
          fs.mkdirSync(absPath, { recursive: true });
        } else {
          fs.mkdirSync(path.dirname(absPath), { recursive: true });
          const docContent = content || JSON.stringify({
            $schema: 'tower-ui',
            version: '1.0',
            meta: { name: path.basename(filePath, '.tower.json'), designWidth: 1080, designHeight: 1920 },
            root: { type: 'ui-view', props: { width: 1080, height: 1920 }, children: [] },
          }, null, 2);
          fs.writeFileSync(absPath, docContent, 'utf-8');
        }
        sendJson(res, { ok: true, path: absPath });
      } catch (e: any) {
        sendError(res, e.message, 500);
      }
      return;
    }

    if (urlPath === '/api/files' && method === 'PUT') {
      try {
        const body = await readBody(req);
        const { oldPath, newPath } = JSON.parse(body);
        if (!oldPath || !newPath) { sendError(res, 'oldPath and newPath required'); return; }
        fs.renameSync(path.resolve(oldPath), path.resolve(newPath));
        sendJson(res, { ok: true });
      } catch (e: any) {
        sendError(res, e.message, 500);
      }
      return;
    }

    if (urlPath === '/api/files' && method === 'DELETE') {
      try {
        const body = await readBody(req);
        const { filePath } = JSON.parse(body);
        if (!filePath) { sendError(res, 'filePath required'); return; }
        const absPath = path.resolve(filePath);
        if (fs.statSync(absPath).isDirectory()) {
          fs.rmSync(absPath, { recursive: true });
        } else {
          fs.unlinkSync(absPath);
        }
        sendJson(res, { ok: true });
      } catch (e: any) {
        sendError(res, e.message, 500);
      }
      return;
    }

    // Open a specific document by path
    if (urlPath === '/api/document/open' && method === 'POST') {
      try {
        const body = await readBody(req);
        const { filePath } = JSON.parse(body);
        if (!filePath || !fs.existsSync(filePath)) { sendError(res, 'File not found'); return; }
        documentPath = path.resolve(filePath);
        const content = fs.readFileSync(documentPath, 'utf-8');
        const doc = JSON.parse(content);
        if (doc.components) {
          flattenRefs(doc.root, doc.components);
          fs.writeFileSync(documentPath, JSON.stringify(doc, null, 2), 'utf-8');
        }
        // Auto-register sprite dirs from source
        const source = doc?.meta?.source;
        if (source && typeof source === 'string' && source.startsWith('fairygui:')) {
          const pkgName = source.split(':')[1];
          const candidates = [
            path.join(process.cwd(), 'apps', pkgName, 'assets', pkgName),
            path.join(process.cwd(), 'assets', pkgName),
          ];
          for (const c of candidates) {
            if (fs.existsSync(c) && !staticDirs.includes(c)) { staticDirs.push(c); break; }
          }
        }
        sendJson(res, doc);
      } catch (e: any) {
        sendError(res, e.message, 500);
      }
      return;
    }

    // ── Editor REST API ──
    if (urlPath === '/api/document' && method === 'GET') {
      if (documentPath && fs.existsSync(documentPath)) {
        const content = fs.readFileSync(documentPath, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(content);
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end('null');
      }
      return;
    }

    if (urlPath === '/api/document' && method === 'PUT') {
      try {
        const body = await readBody(req);
        const doc = JSON.parse(body);
        if (doc.$schema !== 'tower-ui') {
          sendError(res, 'Invalid document: missing $schema');
          return;
        }
        fs.writeFileSync(documentPath, JSON.stringify(doc, null, 2), 'utf-8');
        notifyEditorClients({ type: 'document-updated', source: 'api' });
        notifyClients(); // trigger HMR reload
        sendJson(res, { ok: true });
      } catch (e: any) {
        sendError(res, e.message);
      }
      return;
    }

    if (urlPath === '/api/import/fairygui' && method === 'POST') {
      try {
        const body = await readBody(req);
        const { dir, spritePrefix: sp } = JSON.parse(body);
        if (!dir || !fs.existsSync(dir)) {
          sendError(res, `Directory not found: ${dir}`);
          return;
        }

        // Auto-find the directory containing package.xml (search up to 3 levels deep)
        let pkgDir = dir;
        if (!fs.existsSync(path.join(pkgDir, 'package.xml'))) {
          let found = false;
          const search = (d: string, depth: number) => {
            if (found || depth > 3) return;
            try {
              const entries = fs.readdirSync(d, { withFileTypes: true });
              if (entries.some((e: any) => e.name === 'package.xml' && !e.isDirectory())) {
                pkgDir = d;
                found = true;
                return;
              }
              for (const e of entries) {
                if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') {
                  search(path.join(d, e.name), depth + 1);
                  if (found) return;
                }
              }
            } catch {}
          };
          search(dir, 0);
          if (!found) {
            sendError(res, `No package.xml found in ${dir} (searched 3 levels deep). Please select a FairyGUI package directory containing package.xml.`);
            return;
          }
          console.log(`[Import] Auto-found package.xml in: ${pkgDir}`);
        }

        const { execSync } = require('child_process');
        const tmpOut = path.join(outdir, '_import_tmp');
        if (fs.existsSync(tmpOut)) {
          fs.rmSync(tmpOut, { recursive: true });
        }
        fs.mkdirSync(tmpOut, { recursive: true });
        const prefix = sp || path.basename(pkgDir);

        let toolPath = path.resolve(process.cwd(), 'tools/fairy-to-tsx.mjs');
        if (!fs.existsSync(toolPath)) {
          toolPath = path.resolve(__dirname, '../../../tools/fairy-to-tsx.mjs');
        }
        if (!fs.existsSync(toolPath)) {
          sendError(res, `Converter tool not found. Searched: ${toolPath}`, 500);
          return;
        }

        const cmd = `node "${toolPath}" "${pkgDir}" --out-dir "${tmpOut}" --sprite-prefix "${prefix}" --format tower`;
        console.log('[Import] Running:', cmd);
        try {
          execSync(cmd, { stdio: 'pipe', cwd: process.cwd() });
        } catch (cmdErr: any) {
          const stderr = cmdErr.stderr?.toString?.() || '';
          const stdout = cmdErr.stdout?.toString?.() || '';
          console.error('[Import] Command failed:', stderr || stdout || cmdErr.message);
          sendError(res, `Converter failed: ${stderr || stdout || cmdErr.message}`, 500);
          return;
        }

        const files = fs.readdirSync(tmpOut).filter((f: string) => f.endsWith('.tower.json'));
        if (files.length === 0) {
          sendError(res, 'No .tower.json generated');
          return;
        }
        const content = fs.readFileSync(path.join(tmpOut, files[0]), 'utf-8');
        const doc = JSON.parse(content);

        // Flatten all $ref nodes by inlining component definitions
        if (doc.components) {
          flattenRefs(doc.root, doc.components);
          console.log(`[Import] Flattened $ref nodes (${Object.keys(doc.components).length} components)`);
        }

        // Add FairyGUI package dir to static search paths so sprites resolve
        if (!staticDirs.includes(pkgDir)) {
          staticDirs.push(pkgDir);
          console.log(`[Import] Added sprite dir: ${pkgDir}`);
        }

        if (documentPath) {
          fs.writeFileSync(documentPath, JSON.stringify(doc, null, 2), 'utf-8');
          notifyEditorClients({ type: 'document-updated', source: 'import' });
        }
        sendJson(res, doc);
      } catch (e: any) {
        console.error('[Import] Unexpected error:', e);
        sendError(res, e.message, 500);
      }
      return;
    }

    // ── Import: Unity Prefab (single file or directory batch) ──
    if (urlPath === '/api/import/prefab' && method === 'POST') {
      try {
        const body = await readBody(req);
        const { prefabPath, projectRoot, spriteMap: spriteMapArg } = JSON.parse(body);
        if (!prefabPath || !fs.existsSync(prefabPath)) {
          sendError(res, `Path not found: ${prefabPath}`);
          return;
        }

        const { execSync } = require('child_process');
        const tmpOut = path.join(outdir, '_import_tmp');
        if (fs.existsSync(tmpOut)) {
          fs.rmSync(tmpOut, { recursive: true });
        }
        fs.mkdirSync(tmpOut, { recursive: true });

        // Resolve tool paths
        let prefabToJsonPath = path.resolve(process.cwd(), 'tools/prefab-to-json.mjs');
        if (!fs.existsSync(prefabToJsonPath)) {
          prefabToJsonPath = path.resolve(__dirname, '../../../tools/prefab-to-json.mjs');
        }
        let jsonToTsxPath = path.resolve(process.cwd(), 'tools/json-to-tsx.mjs');
        if (!fs.existsSync(jsonToTsxPath)) {
          jsonToTsxPath = path.resolve(__dirname, '../../../tools/json-to-tsx.mjs');
        }
        if (!fs.existsSync(prefabToJsonPath) || !fs.existsSync(jsonToTsxPath)) {
          sendError(res, 'Conversion tools not found', 500);
          return;
        }

        const isDirectory = fs.statSync(prefabPath).isDirectory();
        const jsonDir = path.join(tmpOut, '_json');
        const towerDir = path.join(tmpOut, '_tower');

        // ── Step 1: prefab → intermediate JSON ──
        if (isDirectory) {
          let cmd1 = `node "${prefabToJsonPath}" --batch "${prefabPath}" --out-dir "${jsonDir}"`;
          if (projectRoot && fs.existsSync(projectRoot)) {
            cmd1 += ` --project "${projectRoot}"`;
          }
          console.log('[Import Prefab Batch] Step 1:', cmd1);
          try {
            execSync(cmd1, { stdio: 'pipe', cwd: process.cwd(), timeout: 120000 });
          } catch (cmdErr: any) {
            const stderr = cmdErr.stderr?.toString?.() || '';
            console.error('[Import Prefab Batch] prefab-to-json failed:', stderr || cmdErr.message);
            sendError(res, `prefab-to-json batch failed: ${stderr || cmdErr.message}`, 500);
            return;
          }
        } else {
          if (!prefabPath.endsWith('.prefab')) {
            sendError(res, `Not a .prefab file: ${prefabPath}`);
            return;
          }
          fs.mkdirSync(jsonDir, { recursive: true });
          const intermediateJson = path.join(jsonDir, path.basename(prefabPath, '.prefab') + '.json');
          let cmd1 = `node "${prefabToJsonPath}" "${prefabPath}" --out "${intermediateJson}"`;
          if (projectRoot && fs.existsSync(projectRoot)) {
            cmd1 += ` --project "${projectRoot}"`;
          }
          console.log('[Import Prefab] Step 1:', cmd1);
          try {
            execSync(cmd1, { stdio: 'pipe', cwd: process.cwd() });
          } catch (cmdErr: any) {
            const stderr = cmdErr.stderr?.toString?.() || '';
            console.error('[Import Prefab] prefab-to-json failed:', stderr || cmdErr.message);
            sendError(res, `prefab-to-json failed: ${stderr || cmdErr.message}`, 500);
            return;
          }
        }

        if (!fs.existsSync(jsonDir)) {
          sendError(res, 'prefab-to-json produced no output', 500);
          return;
        }

        // ── Step 2: intermediate JSON → .tower.json ──
        let cmd2 = `node "${jsonToTsxPath}" --batch "${jsonDir}" --out-dir "${towerDir}" --format tower`;
        if (spriteMapArg && fs.existsSync(spriteMapArg)) {
          cmd2 += ` --sprite-map "${spriteMapArg}"`;
        }
        console.log('[Import Prefab] Step 2:', cmd2);
        try {
          execSync(cmd2, { stdio: 'pipe', cwd: process.cwd(), timeout: 120000 });
        } catch (cmdErr: any) {
          const stderr = cmdErr.stderr?.toString?.() || '';
          console.error('[Import Prefab] json-to-tsx failed:', stderr || cmdErr.message);
          sendError(res, `json-to-tsx failed: ${stderr || cmdErr.message}`, 500);
          return;
        }

        if (!fs.existsSync(towerDir)) {
          sendError(res, 'json-to-tsx produced no output', 500);
          return;
        }

        // ── Step 3: collect all .tower.json results ──
        function findTowerFiles(dir: string): string[] {
          const results: string[] = [];
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              results.push(...findTowerFiles(full));
            } else if (entry.name.endsWith('.tower.json')) {
              results.push(full);
            }
          }
          return results;
        }
        const towerFiles = findTowerFiles(towerDir);

        if (towerFiles.length === 0) {
          sendError(res, 'No .tower.json files produced', 500);
          return;
        }

        console.log(`[Import Prefab] Produced ${towerFiles.length} .tower.json files`);

        // ── Step 4: copy to project dir if open ──
        const projDir = projectState.dir;
        if (projDir) {
          const screensDir = path.join(projDir, 'screens');
          fs.mkdirSync(screensDir, { recursive: true });
          for (const tf of towerFiles) {
            const rel = path.relative(towerDir, tf);
            const dest = path.join(screensDir, rel);
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.copyFileSync(tf, dest);
          }
          console.log(`[Import Prefab] Copied ${towerFiles.length} files to ${screensDir}`);
        }

        // Register sprite dirs
        if (projectRoot) {
          const spriteCandidates = [
            path.join(projectRoot, 'Assets'),
            projectRoot,
          ];
          for (const c of spriteCandidates) {
            if (fs.existsSync(c) && !staticDirs.includes(c)) {
              staticDirs.push(c);
              console.log(`[Import Prefab] Added sprite dir: ${c}`);
              break;
            }
          }
        }

        // ── Step 5: load first document, flattenRefs, return ──
        const firstFile = towerFiles[0];
        const content = fs.readFileSync(firstFile, 'utf-8');
        const doc = JSON.parse(content);

        if (doc.components) {
          flattenRefs(doc.root, doc.components);
        }

        if (documentPath) {
          fs.writeFileSync(documentPath, JSON.stringify(doc, null, 2), 'utf-8');
          notifyEditorClients({ type: 'document-updated', source: 'import' });
        }

        sendJson(res, {
          document: doc,
          count: towerFiles.length,
          files: towerFiles.map(f => path.relative(towerDir, f)),
        });
      } catch (e: any) {
        console.error('[Import Prefab] Unexpected error:', e);
        sendError(res, e.message, 500);
      }
      return;
    }

    // ── Sync: Incremental prefab mirror ──
    if (urlPath === '/api/sync/prefabs' && method === 'POST') {
      try {
        const body = await readBody(req);
        const { source, project, spriteMap: smPath, force } = JSON.parse(body);
        if (!source || !fs.existsSync(source)) {
          sendError(res, `Source directory not found: ${source}`);
          return;
        }

        const projDir = projectState.dir;
        if (!projDir) {
          sendError(res, 'No project is open. Open or create a project first.');
          return;
        }

        const targetDir = path.join(projDir, 'screens');
        fs.mkdirSync(targetDir, { recursive: true });

        let toolPath = path.resolve(process.cwd(), 'tools/mirror-prefabs.mjs');
        if (!fs.existsSync(toolPath)) {
          toolPath = path.resolve(__dirname, '../../../tools/mirror-prefabs.mjs');
        }
        if (!fs.existsSync(toolPath)) {
          sendError(res, 'mirror-prefabs.mjs not found', 500);
          return;
        }

        const spawnArgs = [toolPath, '--source', source, '--target', targetDir, '--json-progress'];
        if (project && fs.existsSync(project)) spawnArgs.push('--project', project);
        if (smPath && fs.existsSync(smPath)) spawnArgs.push('--sprite-map', smPath);
        if (force) spawnArgs.push('--force');

        const { spawn } = require('child_process');
        const child = spawn('node', ['--max-old-space-size=4096', ...spawnArgs], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });

        let stdoutBuf = '';
        child.stdout.on('data', (chunk: Buffer) => {
          stdoutBuf += chunk.toString();
          const lines = stdoutBuf.split('\n');
          stdoutBuf = lines.pop()!;
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const msg = JSON.parse(line);
              const { type: progressType, ...rest } = msg;
              notifyEditorClients({ type: 'sync-progress', progressType, ...rest });
            } catch {}
          }
        });

        let stderrBuf = '';
        child.stderr.on('data', (chunk: Buffer) => { stderrBuf += chunk.toString(); });

        child.on('close', (code: number) => {
          if (stdoutBuf.trim()) {
            try {
              const msg = JSON.parse(stdoutBuf.trim());
              const { type: progressType, ...rest } = msg;
              notifyEditorClients({ type: 'sync-progress', progressType, ...rest });
            } catch {}
          }
          notifyEditorClients({
            type: 'sync-finished',
            exitCode: code,
            stderr: stderrBuf.substring(0, 2000),
          });
          console.log(`[Sync] mirror-prefabs exited with code ${code}`);

          if (project && fs.existsSync(project)) {
            const assetsDir = path.join(project, 'Assets');
            const dir = fs.existsSync(assetsDir) ? assetsDir : project;
            if (!staticDirs.includes(dir)) {
              staticDirs.push(dir);
              console.log(`[Sync] Added sprite dir: ${dir}`);
            }
          }
        });

        sendJson(res, { ok: true, target: targetDir, message: 'Sync started' });
      } catch (e: any) {
        console.error('[Sync] Error:', e);
        sendError(res, e.message, 500);
      }
      return;
    }

    // ── Generate Protocol: proto + proxy from dataBind annotations ──
    if (urlPath === '/api/generate/protocol' && method === 'POST') {
      try {
        const body = await readBody(req);
        const { protoDir, proxyDir, namespace } = JSON.parse(body);
        const projDir = projectState.dir;
        if (!projDir) {
          sendError(res, 'No project is open.');
          return;
        }

        const screensDir = path.join(projDir, 'screens');
        if (!fs.existsSync(screensDir)) {
          sendError(res, 'No screens directory found in project.');
          return;
        }

        const outProto = protoDir || path.join(projDir, 'generated', 'proto');
        const outProxy = proxyDir || path.join(projDir, 'generated', 'proxy');
        const ns = namespace || 'TowerUI.Generated';

        const toolsDir = path.resolve(__dirname, '../../../tools');
        const protoTool = path.join(toolsDir, 'tower-to-proto.mjs');
        const proxyTool = path.join(toolsDir, 'tower-to-proxy.mjs');

        const protoFiles: string[] = [];
        const proxyFiles: string[] = [];

        const { execSync } = await import('child_process');

        try {
          execSync(`node "${protoTool}" --dir "${screensDir}" -o "${outProto}"`, { encoding: 'utf-8', timeout: 30000 });
          if (fs.existsSync(outProto)) {
            for (const f of fs.readdirSync(outProto)) {
              if (f.endsWith('.proto')) protoFiles.push(f);
            }
          }
        } catch (e: any) {
          console.error('[Generate Proto] Error:', e.message);
        }

        try {
          execSync(`node "${proxyTool}" --dir "${screensDir}" -o "${outProxy}" --namespace "${ns}"`, { encoding: 'utf-8', timeout: 30000 });
          if (fs.existsSync(outProxy)) {
            for (const f of fs.readdirSync(outProxy)) {
              if (f.endsWith('.cs')) proxyFiles.push(f);
            }
          }
        } catch (e: any) {
          console.error('[Generate Proxy] Error:', e.message);
        }

        sendJson(res, { ok: true, protoFiles, proxyFiles, protoDir: outProto, proxyDir: outProxy });
      } catch (e: any) {
        console.error('[Generate Protocol] Error:', e);
        sendError(res, e.message, 500);
      }
      return;
    }

    // Directory browsing API
    if (urlPath.startsWith('/api/browse') && method === 'GET') {
      try {
        const url = new URL(req.url!, `http://${req.headers.host}`);
        let dirPath = url.searchParams.get('path') || '';
        if (!dirPath) {
          dirPath = process.cwd();
        }
        dirPath = path.resolve(dirPath);
        if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
          sendError(res, `Not a directory: ${dirPath}`, 400);
          return;
        }
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        const dirs: string[] = [];
        const files: string[] = [];
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue;
          if (entry.isDirectory()) dirs.push(entry.name);
          else files.push(entry.name);
        }
        dirs.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        files.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        const parent = path.dirname(dirPath);
        sendJson(res, {
          current: dirPath,
          parent: parent !== dirPath ? parent : null,
          dirs,
          files,
          sep: path.sep,
        });
      } catch (e: any) {
        sendError(res, e.message, 500);
      }
      return;
    }

    // ── AI Modify API ──
    if (urlPath === '/api/ai/modify' && method === 'POST') {
      try {
        const body = await readBody(req);
        const { prompt, document: doc } = JSON.parse(body);
        if (!prompt || !doc) { sendError(res, 'prompt and document are required'); return; }

        const apiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
          sendError(res, 'No AI API key configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY env var.', 503);
          return;
        }

        const isAnthropic = !!process.env.ANTHROPIC_API_KEY;
        const systemPrompt = `You are a TowerGUI UI editor assistant. Modify the given .tower.json document according to the user's instruction. Return ONLY the modified JSON document, no explanations or markdown.`;
        const userPrompt = `Document:\n${JSON.stringify(doc, null, 2)}\n\nInstruction: ${prompt}`;

        let aiResponse: string;
        const https = await import('https');

        if (isAnthropic) {
          const reqBody = JSON.stringify({
            model: 'claude-sonnet-4-20250514', max_tokens: 8192,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
          });
          const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            body: reqBody,
          });
          const data = await aiRes.json() as any;
          aiResponse = data?.content?.[0]?.text || '';
        } else {
          const reqBody = JSON.stringify({
            model: 'gpt-4o', temperature: 0.2,
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
          });
          const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: reqBody,
          });
          const data = await aiRes.json() as any;
          aiResponse = data?.choices?.[0]?.message?.content || '';
        }

        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (!jsonMatch) { sendError(res, 'AI did not return valid JSON', 502); return; }

        const modifiedDoc = JSON.parse(jsonMatch[0]);
        sendJson(res, { ok: true, document: modifiedDoc });
      } catch (e: any) {
        console.error('[AI Modify] Error:', e);
        sendError(res, e.message, 500);
      }
      return;
    }

    // ── Templates API ──
    if (urlPath === '/api/templates' && method === 'GET') {
      const projDir = projectState.dir;
      if (!projDir) { sendJson(res, { templates: [] }); return; }
      const tplDir = path.join(projDir, 'templates');
      if (!fs.existsSync(tplDir)) { sendJson(res, { templates: [] }); return; }
      const templates = fs.readdirSync(tplDir)
        .filter(f => f.endsWith('.json'))
        .map(f => {
          try {
            const data = JSON.parse(fs.readFileSync(path.join(tplDir, f), 'utf-8'));
            const meta = data.__meta || {};
            const node = { ...data };
            delete node.__meta;
            return { name: f.replace('.json', ''), node, category: meta.category, tags: meta.tags };
          } catch { return null; }
        })
        .filter(Boolean);
      sendJson(res, { templates });
      return;
    }

    if (urlPath === '/api/templates' && method === 'POST') {
      try {
        const body = await readBody(req);
        const { name, node, category, tags } = JSON.parse(body);
        if (!name || !node) { sendError(res, 'name and node are required'); return; }
        const projDir = projectState.dir;
        if (!projDir) { sendError(res, 'No project open'); return; }
        const tplDir = path.join(projDir, 'templates');
        fs.mkdirSync(tplDir, { recursive: true });
        const tplData = { ...node, __meta: { category, tags } };
        fs.writeFileSync(path.join(tplDir, `${name}.json`), JSON.stringify(tplData, null, 2));
        sendJson(res, { ok: true });
      } catch (e: any) { sendError(res, e.message, 500); }
      return;
    }

    if (urlPath === '/api/templates' && method === 'DELETE') {
      try {
        const body = await readBody(req);
        const { name } = JSON.parse(body);
        const projDir = projectState.dir;
        if (!projDir || !name) { sendError(res, 'No project or name'); return; }
        const filePath = path.join(projDir, 'templates', `${name}.json`);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        sendJson(res, { ok: true });
      } catch (e: any) { sendError(res, e.message, 500); }
      return;
    }

    // ── Sprites API ──
    if (urlPath === '/api/sprites' && method === 'GET') {
      const sprites: { name: string; path: string }[] = [];
      const projDir = projectState.dir;

      function collectSprites(dir: string, prefix: string) {
        try {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.name.startsWith('.')) continue;
            const full = path.join(dir, entry.name);
            const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
              collectSprites(full, rel);
            } else if (/\.(png|jpg|jpeg|svg|webp)$/i.test(entry.name)) {
              sprites.push({ name: entry.name.replace(/\.[^.]+$/, ''), path: rel });
            }
          }
        } catch {}
      }

      if (projDir) {
        const assetsDir = path.join(projDir, 'assets');
        if (fs.existsSync(assetsDir)) collectSprites(assetsDir, '');
      }
      for (const sd of staticDirs) {
        collectSprites(sd, '');
      }

      const seen = new Set<string>();
      const unique = sprites.filter(s => { if (seen.has(s.path)) return false; seen.add(s.path); return true; });
      sendJson(res, { sprites: unique });
      return;
    }

    // ── Theme API ──
    if (urlPath === '/api/theme' && method === 'GET') {
      const projDir = projectState.dir;
      if (projDir) {
        const themePath = path.join(projDir, 'theme.json');
        if (fs.existsSync(themePath)) {
          try {
            const theme = JSON.parse(fs.readFileSync(themePath, 'utf-8'));
            sendJson(res, { theme });
            return;
          } catch {}
        }
      }
      sendJson(res, { theme: null });
      return;
    }

    if (urlPath === '/api/theme' && method === 'PUT') {
      try {
        const body = await readBody(req);
        const { theme } = JSON.parse(body);
        const projDir = projectState.dir;
        if (!projDir) { sendError(res, 'No project open'); return; }
        fs.writeFileSync(path.join(projDir, 'theme.json'), JSON.stringify(theme, null, 2), 'utf-8');
        sendJson(res, { ok: true });
      } catch (e: any) { sendError(res, e.message, 500); }
      return;
    }

    if (urlPath === '/api/schema' && method === 'GET') {
      try {
        const schemaModulePath = path.resolve(__dirname, '../../schema/src/schema.ts');
        if (fs.existsSync(schemaModulePath)) {
          const content = fs.readFileSync(schemaModulePath, 'utf-8');
          sendJson(res, { version: '1.0.0', source: content });
        } else {
          sendError(res, 'Schema file not found', 404);
        }
      } catch (e: any) {
        sendError(res, e.message, 500);
      }
      return;
    }

    // ── Editor page ──
    if (urlPath === '/editor' || urlPath === '/editor/') {
      const editorHtmlPath = path.join(outdir, 'editor.html');
      if (fs.existsSync(editorHtmlPath)) {
        const content = fs.readFileSync(editorHtmlPath);
        res.writeHead(200, { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' });
        res.end(content);
        return;
      }
    }

    // ── Live preview page (document only) ──
    if (urlPath === '/preview-doc' || urlPath === '/preview-doc/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(generatePreviewDocHTML());
      return;
    }

    // ── Sprite image serving ──
    if (urlPath.startsWith('/sprites/')) {
      const spritePath = urlPath.slice('/sprites/'.length);
      const resolved = resolveFile(spritePath);
      if (resolved) {
        const content = fs.readFileSync(resolved.filePath);
        res.writeHead(200, { 'Content-Type': resolved.contentType, 'Access-Control-Allow-Origin': '*' });
        res.end(content);
        return;
      }
    }

    // ── Static files ──
    let staticPath = urlPath;
    if (staticPath === '/') staticPath = '/index.html';

    if (staticPath.startsWith('/api/')) {
      sendError(res, `Unknown API endpoint: ${method} ${urlPath}`, 404);
      return;
    }

    const resolved = resolveFile(staticPath);
    if (resolved) {
      const content = fs.readFileSync(resolved.filePath);
      res.writeHead(200, { 'Content-Type': resolved.contentType, 'Access-Control-Allow-Origin': '*' });
      res.end(content);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.on('upgrade', (req, socket, head) => {
    if (req.url === '/__hmr') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } else if (req.url === '/__editor') {
      editorWss.handleUpgrade(req, socket, head, (ws) => {
        editorWss.emit('connection', ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  server.listen(port, () => {
    console.log(`\n  TowerUI Preview running at http://localhost:${port}`);
    console.log(`  Canvas: ${width}x${height}`);
    console.log(`  Entry: ${opts.entry}`);
    if (editorCtx) {
      console.log(`  Editor: http://localhost:${port}/editor`);
    }
    if (documentPath) {
      console.log(`  Document: ${documentPath}`);
    }
    console.log(`  HMR enabled\n`);
  });

  return { server, watcher, ctx };
}

function listProjectFiles(dir: string, rootDir: string): any[] {
  const result: any[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(rootDir, fullPath);
      if (entry.isDirectory()) {
        result.push({
          name: entry.name,
          path: fullPath,
          relPath,
          type: 'directory',
          children: listProjectFiles(fullPath, rootDir),
        });
      } else if (entry.name.endsWith('.tower.json') || entry.name.endsWith('.project.json') || entry.name.endsWith('.png') || entry.name.endsWith('.jpg')) {
        result.push({
          name: entry.name,
          path: fullPath,
          relPath,
          type: entry.name.endsWith('.tower.json') ? 'document' : entry.name.endsWith('.project.json') ? 'config' : 'asset',
        });
      }
    }
  } catch {}
  return result;
}

function flattenRefs(node: any, components: Record<string, any>, visited?: Set<string>): void {
  if (!node || typeof node !== 'object') return;
  const seen = visited || new Set<string>();
  if (!node.children || !Array.isArray(node.children)) return;

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (!child || typeof child !== 'object') continue;

    if (child.type === '$ref' && child.ref && components[child.ref]) {
      if (seen.has(child.ref)) continue; // prevent circular refs
      seen.add(child.ref);

      const def = components[child.ref];
      const resolved: any = {
        type: def.type,
        props: { ...def.props, ...child.props, name: child.ref },
        children: child.children && child.children.length > 0
          ? child.children
          : def.children ? JSON.parse(JSON.stringify(def.children)) : undefined,
      };
      node.children[i] = resolved;

      // Recursively flatten children of the resolved node
      flattenRefs(resolved, components, new Set(seen));
      seen.delete(child.ref);
    } else {
      flattenRefs(child, components, seen);
    }
  }
}

function generateHTML(title: string, width: number, height: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #1a1a2e;
      color: #e0e0e0;
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    #toolbar {
      height: 40px;
      background: #16213e;
      display: flex;
      align-items: center;
      padding: 0 16px;
      gap: 12px;
      border-bottom: 1px solid #333;
      font-size: 13px;
      flex-shrink: 0;
    }
    #toolbar .title { font-weight: 600; color: #4da6ff; }
    #toolbar .sep { width: 1px; height: 20px; background: #444; }
    #toolbar select, #toolbar button {
      background: #0f3460;
      color: #e0e0e0;
      border: 1px solid #444;
      border-radius: 4px;
      padding: 4px 10px;
      font-size: 12px;
      cursor: pointer;
    }
    #toolbar button:hover { background: #1a5276; }
    #toolbar .status { margin-left: auto; font-size: 11px; color: #6c757d; }
    #main {
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: center;
      overflow: auto;
      background: #111;
    }
    #canvas-frame {
      width: ${width}px;
      height: ${height}px;
      background: #0a0e1a;
      position: relative;
      overflow: hidden;
      box-shadow: 0 0 40px rgba(0,0,0,0.5);
      border: 1px solid #333;
    }
    #props-panel {
      position: fixed;
      right: 0;
      top: 40px;
      width: 280px;
      height: calc(100vh - 40px);
      background: #16213e;
      border-left: 1px solid #333;
      overflow-y: auto;
      display: none;
      padding: 12px;
      font-size: 12px;
    }
    #props-panel.open { display: block; }
    #props-panel h3 { color: #4da6ff; margin-bottom: 8px; font-size: 14px; }
    #props-panel .prop-row {
      display: flex; justify-content: space-between; padding: 3px 0;
      border-bottom: 1px solid #222;
    }
    #props-panel .prop-key { color: #888; }
    #props-panel .prop-val { color: #e0e0e0; max-width: 160px; overflow: hidden; text-overflow: ellipsis; }
    .hmr-indicator {
      width: 8px; height: 8px; border-radius: 50%;
      background: #4caf50; display: inline-block; margin-right: 6px;
    }
    .hmr-indicator.disconnected { background: #f44336; }
  </style>
</head>
<body>
  <div id="toolbar">
    <span class="title">TowerUI Preview</span>
    <div class="sep"></div>
    <select id="resolution">
      <option value="${width}x${height}" selected>${width}x${height}</option>
      <option value="1920x1080">1920x1080</option>
      <option value="1280x720">1280x720</option>
      <option value="750x1334">750x1334 (iPhone)</option>
      <option value="1080x1920">1080x1920 (Android)</option>
      <option value="2560x1440">2560x1440</option>
    </select>
    <button id="btn-inspector">Inspector</button>
    <button id="btn-refresh">Refresh</button>
    <span class="status">
      <span class="hmr-indicator" id="hmr-dot"></span>
      <span id="hmr-status">Connecting...</span>
    </span>
  </div>
  <div id="main">
    <div id="canvas-frame"></div>
  </div>
  <div id="props-panel">
    <h3>Inspector</h3>
    <div id="props-content">Click an element to inspect</div>
  </div>

  <script type="module">
    // HMR WebSocket
    const ws = new WebSocket('ws://' + location.host + '/__hmr');
    const dot = document.getElementById('hmr-dot');
    const status = document.getElementById('hmr-status');
    ws.onopen = () => { dot.className = 'hmr-indicator'; status.textContent = 'HMR Connected'; };
    ws.onclose = () => { dot.className = 'hmr-indicator disconnected'; status.textContent = 'Disconnected'; };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'reload') {
        status.textContent = 'Reloading...';
        location.reload();
      }
    };

    // Resolution switcher
    document.getElementById('resolution').addEventListener('change', (e) => {
      const [w, h] = e.target.value.split('x').map(Number);
      const frame = document.getElementById('canvas-frame');
      frame.style.width = w + 'px';
      frame.style.height = h + 'px';
    });

    // Refresh
    document.getElementById('btn-refresh').addEventListener('click', () => location.reload());

    // Inspector toggle
    document.getElementById('btn-inspector').addEventListener('click', () => {
      document.getElementById('props-panel').classList.toggle('open');
    });

    // Inspector click handler
    document.getElementById('canvas-frame').addEventListener('click', (e) => {
      const panel = document.getElementById('props-panel');
      if (!panel.classList.contains('open')) return;

      const el = e.target;
      if (!(el instanceof HTMLElement)) return;

      const content = document.getElementById('props-content');
      const type = el.dataset.type || 'unknown';
      const style = el.style;
      const rows = [
        '<div class="prop-row"><span class="prop-key">type</span><span class="prop-val">' + type + '</span></div>',
      ];

      const interesting = ['width', 'height', 'backgroundColor', 'color', 'fontSize',
        'flexDirection', 'justifyContent', 'alignItems', 'padding', 'margin',
        'opacity', 'display', 'position', 'top', 'left', 'overflow', 'flex'];

      for (const prop of interesting) {
        const val = style[prop];
        if (val) {
          rows.push('<div class="prop-row"><span class="prop-key">' + prop + '</span><span class="prop-val">' + val + '</span></div>');
        }
      }

      content.innerHTML = rows.join('');
      e.stopPropagation();
    });

    // Load the app bundle
    import('./bundle.js').catch(err => {
      document.getElementById('canvas-frame').innerHTML =
        '<div style="padding:20px;color:#f44336;">Load error: ' + err.message + '</div>';
    });
  </script>
</body>
</html>`;
}

function generateEditorHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>TowerUI Editor</title>
  <link rel="stylesheet" href="/editor-bundle.css" />
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/editor-bundle.js"></script>
</body>
</html>`;
}

function generatePreviewDocHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>TowerUI Live Preview</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #1a1a2e; }
    #preview-root {
      position: absolute; top: 50%; left: 50%;
      transform-origin: center center;
    }
    #status {
      position: fixed; bottom: 8px; right: 8px;
      font: 12px monospace; color: rgba(255,255,255,0.3);
      pointer-events: none; z-index: 999;
    }
  </style>
</head>
<body>
  <div id="preview-root"></div>
  <div id="status">connecting...</div>
  <script>
    const root = document.getElementById('preview-root');
    const status = document.getElementById('status');
    let currentDoc = null;

    function renderNode(node, components) {
      if (!node) return '';
      if (typeof node === 'string') return '<span>' + escapeHtml(node) + '</span>';

      let resolved = node;
      if (node.type === '$ref' && components && components[node.ref]) {
        const comp = components[node.ref];
        resolved = { ...comp, props: { ...comp.props, ...node.props } };
      }

      const p = resolved.props || {};
      const type = resolved.type;
      const children = resolved.children || [];
      let style = '';
      let content = '';

      if (p.width != null)  style += 'width:' + p.width + 'px;';
      if (p.height != null) style += 'height:' + p.height + 'px;';
      if (p.left != null)   style += 'position:absolute;left:' + p.left + 'px;';
      if (p.top != null)    style += 'top:' + p.top + 'px;';
      if (p.right != null)  style += 'right:' + p.right + 'px;';
      if (p.bottom != null) style += 'bottom:' + p.bottom + 'px;';
      if (p.visible === false) style += 'opacity:0.3;';
      if (p.position === 'absolute') style += 'position:absolute;';
      if (p.minWidth != null) style += 'min-width:' + p.minWidth + 'px;';
      if (p.minHeight != null) style += 'min-height:' + p.minHeight + 'px;';
      if (p.maxWidth != null) style += 'max-width:' + p.maxWidth + 'px;';
      if (p.maxHeight != null) style += 'max-height:' + p.maxHeight + 'px;';
      if (p.opacity != null) style += 'opacity:' + p.opacity + ';';
      if (p.zIndex != null) style += 'z-index:' + p.zIndex + ';';

      // Background
      if (p.backgroundColor) style += 'background-color:' + p.backgroundColor + ';';
      if (p.backgroundImage) style += 'background-image:url(' + p.backgroundImage + ');';
      if (p.backgroundSize) style += 'background-size:' + p.backgroundSize + ';';
      if (p.backgroundPosition) style += 'background-position:' + p.backgroundPosition + ';';
      if (p.backgroundRepeat) style += 'background-repeat:' + p.backgroundRepeat + ';';

      // Border
      if (p.borderWidth != null) style += 'border-width:' + p.borderWidth + 'px;border-style:' + (p.borderStyle || 'solid') + ';';
      if (p.borderColor) style += 'border-color:' + p.borderColor + ';';
      if (p.borderStyle && p.borderWidth == null) style += 'border-style:' + p.borderStyle + ';';
      if (p.borderRadius != null) style += 'border-radius:' + p.borderRadius + 'px;';

      // Padding sides
      if (p.paddingTop != null) style += 'padding-top:' + p.paddingTop + 'px;';
      if (p.paddingRight != null) style += 'padding-right:' + p.paddingRight + 'px;';
      if (p.paddingBottom != null) style += 'padding-bottom:' + p.paddingBottom + 'px;';
      if (p.paddingLeft != null) style += 'padding-left:' + p.paddingLeft + 'px;';

      // Margin
      if (p.margin != null) style += 'margin:' + p.margin + 'px;';
      if (p.marginTop != null) style += 'margin-top:' + p.marginTop + 'px;';
      if (p.marginRight != null) style += 'margin-right:' + p.marginRight + 'px;';
      if (p.marginBottom != null) style += 'margin-bottom:' + p.marginBottom + 'px;';
      if (p.marginLeft != null) style += 'margin-left:' + p.marginLeft + 'px;';

      // Effects
      if (p.boxShadow) style += 'box-shadow:' + p.boxShadow + ';';
      if (p.backdropFilter) style += 'backdrop-filter:' + p.backdropFilter + ';';

      // Transform
      var transforms = [];
      if (p.scaleX != null || p.scaleY != null) transforms.push('scale(' + (p.scaleX||1) + ',' + (p.scaleY||1) + ')');
      if (p.rotation) transforms.push('rotate(' + p.rotation + 'deg)');
      if (transforms.length) style += 'transform:' + transforms.join(' ') + ';';

      // Cursor
      if (p.cursor) style += 'cursor:' + p.cursor + ';';
      if (p.pointerEvents) style += 'pointer-events:' + p.pointerEvents + ';';

      if (type === 'ui-view') {
        style += 'display:flex;';
        style += 'flex-direction:' + (p.flexDirection || 'column') + ';';
        if (p.justifyContent) style += 'justify-content:' + p.justifyContent + ';';
        if (p.alignItems) style += 'align-items:' + p.alignItems + ';';
        if (p.flexWrap) style += 'flex-wrap:' + p.flexWrap + ';';
        if (p.gap != null) style += 'gap:' + p.gap + 'px;';
        if (p.padding != null) style += 'padding:' + p.padding + 'px;';
        if (!p.overflow) style += 'overflow:visible;';
        else style += 'overflow:' + p.overflow + ';';
        if (p.tint && !p.backgroundColor) style += 'background-color:' + p.tint + ';';
        content = children.map(c => renderNode(c, components)).join('');
      }
      else if (type === 'ui-text') {
        const fs = p.fontSize || 16;
        style += 'font-size:' + fs + 'px;';
        style += 'color:' + (p.color || '#ffffff') + ';';
        style += 'font-family:system-ui,sans-serif;white-space:pre-wrap;word-break:break-word;overflow:visible;';
        if (p.bold) style += 'font-weight:bold;';
        if (p.italic) style += 'font-style:italic;';
        if (p.textAlign || p.align) style += 'text-align:' + (p.textAlign || p.align) + ';';
        if (p.verticalAlign) {
          style += 'display:flex;';
          style += 'align-items:' + (p.verticalAlign === 'middle' ? 'center' : p.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start') + ';';
          if (p.align === 'center') style += 'justify-content:center;';
          else if (p.align === 'right') style += 'justify-content:flex-end;';
        }
        if (p.fontWeight) style += 'font-weight:' + p.fontWeight + ';';
        if (p.lineHeight) style += 'line-height:' + p.lineHeight + ';';
        content = escapeHtml(p.text || '');
      }
      else if (type === 'ui-image') {
        style += 'display:flex;align-items:center;justify-content:center;overflow:visible;';
        var hasSrc = !!p.src;
        var hasSlice = p.sliceLeft || p.sliceTop || p.sliceRight || p.sliceBottom;
        if (hasSrc && hasSlice) {
          var sl = p.sliceTop || 0, sr = p.sliceRight || 0, sb = p.sliceBottom || 0, sll = p.sliceLeft || 0;
          style += 'border-image:url(' + p.src + ') ' + sl + ' ' + sr + ' ' + sb + ' ' + sll + ' fill stretch;';
          style += 'border-image-width:' + sl + 'px ' + sr + 'px ' + sb + 'px ' + sll + 'px;';
          style += 'border-style:solid;border-color:transparent;';
          if (p.tint) style += 'background-color:' + p.tint + ';';
        } else if (hasSrc) {
          style += 'background-image:url(' + p.src + ');background-size:' + (p.objectFit || p.backgroundSize || '100% 100%') + ';background-repeat:no-repeat;background-position:' + (p.backgroundPosition || 'center') + ';';
          if (p.tint) style += 'background-color:' + p.tint + ';background-blend-mode:multiply;';
        } else {
          if (p.tint) style += 'background-color:' + p.tint + ';';
          else if (p.backgroundColor) style += 'background-color:' + p.backgroundColor + ';';
        }
        var hasKids = children.length > 0;
        if (!hasSrc && !hasKids) content = '<span style="color:#666;font-size:14px">image</span>';
        else content = children.map(function(c) { return renderNode(c, components); }).join('');
      }
      else if (type === 'ui-button') {
        style += 'display:flex;align-items:center;justify-content:center;';
        if (!p.cursor) style += 'cursor:pointer;';
        if (!p.backgroundColor && !p.tint) style += 'background-color:#2a5298;';
        else if (p.tint && !p.backgroundColor) style += 'background-color:' + p.tint + ';';
        if (p.borderWidth == null && !p.borderStyle) style += 'border:1px solid #4a7ac7;';
        if (p.borderRadius == null) style += 'border-radius:4px;';
        style += 'color:' + (p.color || '#fff') + ';';
        style += 'font-size:' + (p.fontSize || 14) + 'px;';
        content = escapeHtml(p.text || 'Button');
      }
      else if (type === 'ui-input') {
        style += 'display:flex;align-items:center;';
        if (!p.padding && !p.paddingLeft) style += 'padding:4px 8px;';
        if (!p.backgroundColor && !p.tint) style += 'background-color:#1a1a2e;';
        else if (p.tint && !p.backgroundColor) style += 'background-color:' + p.tint + ';';
        if (p.borderWidth == null && !p.borderStyle) style += 'border:1px solid #444;';
        if (p.borderRadius == null) style += 'border-radius:4px;';
        style += 'color:' + (p.color || '#ccc') + ';font-size:' + (p.fontSize || 13) + 'px;';
        content = escapeHtml(p.placeholder || p.value || 'input');
      }
      else if (type === 'ui-scroll') {
        style += 'overflow:auto;display:flex;';
        if (p.flexDirection) style += 'flex-direction:' + p.flexDirection + ';';
        else if (p.vertical) style += 'flex-direction:column;';
        if (p.gap != null) style += 'gap:' + p.gap + 'px;';
        if (p.padding != null) style += 'padding:' + p.padding + 'px;';
        content = children.map(c => renderNode(c, components)).join('');
      }
      else {
        style += 'display:flex;';
        content = children.map(c => renderNode(c, components)).join('');
      }

      return '<div style="' + style + '">' + content + '</div>';
    }

    function escapeHtml(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function renderDocument(doc) {
      if (!doc || !doc.root) { root.innerHTML = '<div style="color:#999;padding:40px">No document</div>'; return; }
      const dw = doc.meta.designWidth || 1080;
      const dh = doc.meta.designHeight || 1920;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const scale = Math.min(vw / dw, vh / dh) * 0.95;
      root.style.width = dw + 'px';
      root.style.height = dh + 'px';
      root.style.background = '#1e1e32';
      root.style.overflow = 'hidden';
      root.style.transform = 'translate(-50%,-50%) scale(' + scale + ')';
      root.innerHTML = renderNode(doc.root, doc.components || {});
    }

    async function loadAndRender() {
      try {
        const res = await fetch('/api/document');
        if (!res.ok) { root.innerHTML = '<div style="color:#f44;padding:40px">No document loaded</div>'; return; }
        currentDoc = await res.json();
        renderDocument(currentDoc);
        status.textContent = 'live';
      } catch (e) {
        root.innerHTML = '<div style="color:#f44;padding:40px">' + e.message + '</div>';
      }
    }

    function connectWS() {
      const ws = new WebSocket('ws://' + location.host + '/__editor');
      ws.onopen = () => { status.textContent = 'live'; };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'document-updated') {
            loadAndRender();
          } else if (msg.type === 'preview-sync' && msg.document) {
            currentDoc = msg.document;
            renderDocument(currentDoc);
            status.textContent = 'live';
          }
        } catch {}
      };
      ws.onclose = () => {
        status.textContent = 'disconnected';
        setTimeout(connectWS, 2000);
      };
    }

    loadAndRender();
    connectWS();
    window.addEventListener('resize', () => { if (currentDoc) renderDocument(currentDoc); });
  </script>
</body>
</html>`;
}
