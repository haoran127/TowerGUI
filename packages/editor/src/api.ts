import type { TowerDocument } from './state';

const API_BASE = '';

export async function fetchDocument(): Promise<TowerDocument | null> {
  try {
    const res = await fetch(`${API_BASE}/api/document`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function saveDocument(doc: TowerDocument): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/document`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doc),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function importFairyGUI(dir: string, spritePrefix?: string): Promise<TowerDocument | null> {
  try {
    const res = await fetch(`${API_BASE}/api/import/fairygui`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dir, spritePrefix }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function importPrefab(prefabPath: string, projectRoot?: string, spriteMap?: string): Promise<{ doc: TowerDocument | null; count?: number; files?: string[]; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/import/prefab`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefabPath, projectRoot, spriteMap }),
    });
    if (!res.ok) {
      try {
        const err = await res.json();
        return { doc: null, error: err.error || `HTTP ${res.status}` };
      } catch {
        return { doc: null, error: `HTTP ${res.status}` };
      }
    }
    const data = await res.json();
    return { doc: data.document, count: data.count, files: data.files };
  } catch {
    return { doc: null, error: 'Network error' };
  }
}

let _editorWs: WebSocket | null = null;

function getUserIdentity(): { userId: string; userName: string } {
  let userId = localStorage.getItem('tower-user-id');
  let userName = localStorage.getItem('tower-user-name');
  if (!userId) {
    userId = `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    localStorage.setItem('tower-user-id', userId);
  }
  if (!userName) {
    userName = `Designer ${userId.slice(-4)}`;
    localStorage.setItem('tower-user-name', userName);
  }
  return { userId, userName };
}

export function setUserName(name: string) {
  localStorage.setItem('tower-user-name', name);
  if (_editorWs && _editorWs.readyState === WebSocket.OPEN) {
    const { userId } = getUserIdentity();
    _editorWs.send(JSON.stringify({ type: 'join', userId, userName: name }));
  }
}

export function connectEditorWS(onMessage: (data: any) => void): WebSocket {
  const ws = new WebSocket(`ws://${location.host}/__editor`);
  ws.onopen = () => {
    const { userId, userName } = getUserIdentity();
    ws.send(JSON.stringify({ type: 'join', userId, userName }));
  };
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      onMessage(msg);
    } catch { /* ignore */ }
  };
  _editorWs = ws;
  return ws;
}

export function notifyFocusDocument(docPath: string | null) {
  if (_editorWs && _editorWs.readyState === WebSocket.OPEN) {
    _editorWs.send(JSON.stringify({ type: 'focus-document', path: docPath }));
  }
}

export function broadcastNodeUpdate(nodeId: string, props: Record<string, any>) {
  if (_editorWs && _editorWs.readyState === WebSocket.OPEN) {
    _editorWs.send(JSON.stringify({ type: 'node-update', nodeId, props }));
  }
}

// ── Presence & Projects API ──

export interface OnlineUser {
  userId: string;
  userName: string;
  color: string;
  documentPath: string | null;
  lastActive: number;
}

export async function getPresence(): Promise<{ users: OnlineUser[]; locks: Record<string, any> }> {
  try {
    const res = await fetch(`${API_BASE}/api/presence`);
    return await res.json();
  } catch {
    return { users: [], locks: {} };
  }
}

export interface ProjectListItem {
  name: string;
  path: string;
  lastModified: number;
}

export async function listProjects(): Promise<{ projects: ProjectListItem[]; current: string | null }> {
  try {
    const res = await fetch(`${API_BASE}/api/projects`);
    return await res.json();
  } catch {
    return { projects: [], current: null };
  }
}

export interface BrowseResult {
  current: string;
  parent: string | null;
  dirs: string[];
  files: string[];
  sep: string;
}

export async function browseDirectory(dirPath?: string): Promise<BrowseResult | null> {
  try {
    const params = dirPath ? `?path=${encodeURIComponent(dirPath)}` : '';
    const res = await fetch(`${API_BASE}/api/browse${params}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── Project API ──

export interface ProjectConfig {
  name: string;
  designWidth: number;
  designHeight: number;
  created?: string;
}

export interface ProjectInfo {
  open: boolean;
  dir?: string;
  config?: ProjectConfig;
}

export async function getProject(): Promise<ProjectInfo> {
  try {
    const res = await fetch(`${API_BASE}/api/project`);
    return await res.json();
  } catch {
    return { open: false };
  }
}

export async function createProject(dir: string, name: string, designWidth = 1080, designHeight = 1920): Promise<{ ok: boolean; dir?: string; config?: ProjectConfig; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/project/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dir, name, designWidth, designHeight }),
    });
    return await res.json();
  } catch {
    return { ok: false, error: 'Network error' };
  }
}

export async function openProject(dir: string): Promise<{ ok: boolean; dir?: string; config?: ProjectConfig; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/project/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dir }),
    });
    return await res.json();
  } catch {
    return { ok: false, error: 'Network error' };
  }
}

// ── File management API ──

export interface FileEntry {
  name: string;
  path: string;
  relPath: string;
  type: 'directory' | 'document' | 'config' | 'asset';
  children?: FileEntry[];
}

export async function listFiles(dir?: string): Promise<{ root: string; files: FileEntry[] }> {
  try {
    const params = dir ? `?dir=${encodeURIComponent(dir)}` : '';
    const res = await fetch(`${API_BASE}/api/files${params}`);
    return await res.json();
  } catch {
    return { root: '', files: [] };
  }
}

export async function createFile(filePath: string, type: 'file' | 'directory' = 'file'): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath, type: type === 'directory' ? 'directory' : 'file' }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function renameFile(oldPath: string, newPath: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/files`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPath, newPath }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function deleteFile(filePath: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/files`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function openDocument(filePath: string): Promise<TowerDocument | null> {
  try {
    const res = await fetch(`${API_BASE}/api/document/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function syncPrefabs(
  source: string,
  project?: string,
  spriteMap?: string,
  force?: boolean,
): Promise<{ ok: boolean; target?: string; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/sync/prefabs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, project, spriteMap: spriteMap || undefined, force }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || `HTTP ${res.status}` };
    return { ok: true, target: data.target };
  } catch {
    return { ok: false, error: 'Network error' };
  }
}

export async function generateProtocol(options?: {
  protoDir?: string;
  proxyDir?: string;
  namespace?: string;
}): Promise<{ ok: boolean; protoFiles?: string[]; proxyFiles?: string[]; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/generate/protocol`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options || {}),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || `HTTP ${res.status}` };
    return { ok: true, protoFiles: data.protoFiles, proxyFiles: data.proxyFiles };
  } catch {
    return { ok: false, error: 'Network error' };
  }
}

// ── AI API ──

export async function aiModifyDocument(prompt: string, document: any): Promise<{ ok: boolean; document?: any; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/ai/modify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, document }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || `HTTP ${res.status}` };
    return { ok: true, document: data.document };
  } catch {
    return { ok: false, error: 'Network error' };
  }
}

// ── Templates API ──

export interface TemplateEntry {
  name: string;
  node: any;
  category?: string;
  tags?: string[];
  version?: string;
  author?: string;
}

export async function listTemplates(): Promise<TemplateEntry[]> {
  try {
    const res = await fetch(`${API_BASE}/api/templates`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.templates || [];
  } catch {
    return [];
  }
}

export async function saveTemplate(name: string, node: any, category?: string, tags?: string[]): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, node, category, tags }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function deleteTemplate(name: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/templates`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function broadcastPreviewSync(doc: TowerDocument) {
  if (_editorWs && _editorWs.readyState === WebSocket.OPEN) {
    _editorWs.send(JSON.stringify({ type: 'preview-sync', document: doc }));
  }
}
