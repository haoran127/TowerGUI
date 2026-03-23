import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useEditor, type TowerDocument, type UINode } from './state';
import { saveDocument, importFairyGUI, importPrefab, syncPrefabs, createProject, openProject, generateProtocol } from './api';
import { InputModal, ConfirmModal, SelectModal } from './components/Modal';
import { useToast } from './components/Toast';
import { DirectoryPicker } from './components/DirectoryPicker';

interface MenuDef {
  label: string;
  icon?: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  divider?: boolean;
  action?: () => void;
}

function ToolbarMenu({ label, items, openMenu, onToggle }: {
  label: string;
  items: MenuDef[];
  openMenu: string | null;
  onToggle: (label: string | null) => void;
}) {
  const isOpen = openMenu === label;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onToggle(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onToggle]);

  return (
    <div className="menu-root" ref={ref}>
      <button
        className={`menu-trigger${isOpen ? ' menu-trigger-open' : ''}`}
        onClick={() => onToggle(isOpen ? null : label)}
        onMouseEnter={() => { if (openMenu && openMenu !== label) onToggle(label); }}
      >
        {label}
      </button>
      {isOpen && (
        <div className="menu-dropdown">
          {items.map((item, i) =>
            item.divider ? <div key={i} className="menu-divider" /> : (
              <button
                key={i}
                className={`menu-item${item.disabled ? ' menu-item-disabled' : ''}${item.danger ? ' menu-item-danger' : ''}`}
                disabled={item.disabled}
                onClick={() => { onToggle(null); item.action?.(); }}
              >
                {item.icon && <span className="menu-item-icon">{item.icon}</span>}
                <span className="menu-item-label">{item.label}</span>
                {item.shortcut && <span className="menu-item-shortcut">{item.shortcut}</span>}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

const RESOLUTIONS = [
  { label: '1080×1920 (Mobile)', w: 1080, h: 1920 },
  { label: '750×1334 (iPhone 6/7/8)', w: 750, h: 1334 },
  { label: '1170×2532 (iPhone 14)', w: 1170, h: 2532 },
  { label: '1440×2560 (QHD)', w: 1440, h: 2560 },
  { label: '1920×1080 (Landscape)', w: 1920, h: 1080 },
  { label: '1280×720 (HD)', w: 1280, h: 720 },
  { label: '2560×1440 (2K)', w: 2560, h: 1440 },
];

const NODE_TYPES = [
  { value: 'ui-view', label: 'View (Container)' },
  { value: 'ui-text', label: 'Text' },
  { value: 'ui-image', label: 'Image' },
  { value: 'ui-button', label: 'Button' },
  { value: 'ui-input', label: 'Input' },
  { value: 'ui-scroll', label: 'Scroll' },
  { value: 'ui-toggle', label: 'Toggle' },
  { value: 'ui-slider', label: 'Slider' },
  { value: 'ui-dropdown', label: 'Dropdown' },
];

const NODE_DEFAULTS: Record<string, any> = {
  'ui-view': { width: 400, height: 300, tint: 'rgba(255,255,255,0.05)' },
  'ui-text': { text: 'New Text', fontSize: 32, color: '#ffffff', width: 300, height: 50 },
  'ui-image': { src: '', width: 200, height: 200 },
  'ui-button': { text: 'Button', fontSize: 28, width: 240, height: 80 },
  'ui-input': { placeholder: 'Enter text...', fontSize: 24, width: 400, height: 64 },
  'ui-scroll': { width: 500, height: 400, vertical: true },
  'ui-toggle': { checked: false, width: 60, height: 32 },
  'ui-slider': { min: 0, max: 1, value: 0.5, width: 300, height: 32 },
  'ui-dropdown': { options: ['Option 1', 'Option 2', 'Option 3'], value: 0, width: 300, height: 48 },
};

interface ToolbarProps {
  onTogglePreview: () => void;
  previewActive: boolean;
  onProjectOpen?: (dir: string, name?: string) => void;
  onSyncComplete?: () => void;
  projectName?: string | null;
}

export function Toolbar({ onTogglePreview, previewActive, onProjectOpen, onSyncComplete, projectName }: ToolbarProps) {
  const { state, dispatch } = useEditor();
  const { toast } = useToast();

  const [newModal, setNewModal] = useState(false);
  const [addModal, setAddModal] = useState(false);
  const [importModal, setImportModal] = useState(false);
  const [dirPickerOpen, setDirPickerOpen] = useState(false);
  const [importDir, setImportDir] = useState('');
  const [importPrefix, setImportPrefix] = useState('');
  const [unsavedModal, setUnsavedModal] = useState<(() => void) | null>(null);

  const [prefabModal, setPrefabModal] = useState(false);
  const [prefabDirPicker, setPrefabDirPicker] = useState(false);
  const [prefabDir, setPrefabDir] = useState('');
  const [prefabProjectPicker, setPrefabProjectPicker] = useState(false);
  const [prefabProjectRoot, setPrefabProjectRoot] = useState('');
  const [prefabSpriteMap, setPrefabSpriteMap] = useState('');

  const [syncModal, setSyncModal] = useState(false);
  const [syncSourcePicker, setSyncSourcePicker] = useState(false);
  const [syncSource, setSyncSource] = useState('');
  const [syncProject, setSyncProject] = useState('');
  const [syncProjectPicker, setSyncProjectPicker] = useState(false);
  const [syncSpriteMap, setSyncSpriteMap] = useState('');
  const [syncForce, setSyncForce] = useState(false);
  const [syncRunning, setSyncRunning] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{
    total?: number;
    needUpdate?: number;
    upToDate?: number;
    current?: number;
    file?: string;
    status?: string;
    converted?: number;
    failed?: number;
    skipped?: number;
    finished?: boolean;
    errorMsg?: string;
  }>({});

  const [projectModal, setProjectModal] = useState<'create' | 'open' | null>(null);
  const [projectDirPicker, setProjectDirPicker] = useState(false);
  const [newProjectDir, setNewProjectDir] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectWidth, setNewProjectWidth] = useState(1080);
  const [newProjectHeight, setNewProjectHeight] = useState(1920);
  const [openProjectDir, setOpenProjectDir] = useState('');
  const [openProjectDirPicker, setOpenProjectDirPicker] = useState(false);

  const [protoGenerating, setProtoGenerating] = useState(false);

  const handleGenerateProtocol = useCallback(async () => {
    setProtoGenerating(true);
    try {
      const result = await generateProtocol();
      if (result.ok) {
        const protoCount = result.protoFiles?.length || 0;
        const proxyCount = result.proxyFiles?.length || 0;
        toast(`Generated ${protoCount} .proto + ${proxyCount} .cs proxy files`, 'success');
      } else {
        toast(`Protocol generation failed: ${result.error}`, 'error');
      }
    } catch (e: any) {
      toast(`Error: ${e.message}`, 'error');
    }
    setProtoGenerating(false);
  }, [toast]);

  const doSave = useCallback(async () => {
    if (!state.document) return;
    const ok = await saveDocument(state.document);
    if (ok) {
      dispatch({ type: 'MARK_SAVED' });
      toast('Saved', 'success');
    } else {
      toast('Save failed - is server configured with --document?', 'error');
    }
  }, [state.document, dispatch, toast]);

  const handleSave = useCallback(() => doSave(), [doSave]);

  const confirmIfDirty = useCallback((action: () => void) => {
    if (state.dirty) {
      setUnsavedModal(() => action);
    } else {
      action();
    }
  }, [state.dirty]);

  const handleNew = useCallback(() => {
    confirmIfDirty(() => setNewModal(true));
  }, [confirmIfDirty]);

  const handleNewConfirm = useCallback((name: string) => {
    const doc: TowerDocument = {
      $schema: 'tower-ui',
      version: '1.0',
      meta: { name, designWidth: 1080, designHeight: 1920 },
      root: {
        type: 'ui-view',
        props: { width: 1080, height: 1920 },
        children: [],
      },
    };
    dispatch({ type: 'LOAD_DOCUMENT', document: doc });
    setNewModal(false);
    toast(`Created "${name}"`, 'success');
  }, [dispatch, toast]);

  const handleOpen = useCallback(() => {
    confirmIfDirty(() => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,.tower.json';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        const text = await file.text();
        try {
          const doc = JSON.parse(text) as TowerDocument;
          if (doc.$schema !== 'tower-ui') {
            toast('Not a valid .tower.json file', 'error');
            return;
          }
          dispatch({ type: 'LOAD_DOCUMENT', document: doc });
          toast(`Opened "${doc.meta.name}"`, 'success');
        } catch {
          toast('Invalid JSON file', 'error');
        }
      };
      input.click();
    });
  }, [confirmIfDirty, dispatch, toast]);

  const handleExportJSON = useCallback(() => {
    if (!state.document) return;
    downloadFile(
      JSON.stringify(state.document, null, 2),
      `${state.document.meta.name}.tower.json`,
      'application/json',
    );
    toast('Exported .tower.json', 'success');
  }, [state.document, toast]);

  const handleExportTSX = useCallback(() => {
    if (!state.document) return;
    const tsx = jsonToTSXSimple(state.document.root, state.document.meta.name);
    downloadFile(tsx, `${state.document.meta.name}.tsx`, 'text/typescript');
    toast('Exported .tsx', 'success');
  }, [state.document, toast]);

  const handleImportOpen = useCallback(() => {
    confirmIfDirty(() => {
      setImportDir('');
      setImportPrefix('');
      setImportModal(true);
    });
  }, [confirmIfDirty]);

  const handleImportConfirm = useCallback(async () => {
    if (!importDir.trim()) { toast('Please enter a directory path', 'warning'); return; }
    setImportModal(false);
    toast('Importing...', 'info');
    const doc = await importFairyGUI(importDir.trim(), importPrefix.trim() || undefined);
    if (doc) {
      dispatch({ type: 'LOAD_DOCUMENT', document: doc });
      toast(`Imported "${doc.meta.name}"`, 'success');
    } else {
      toast('Import failed', 'error');
    }
  }, [importDir, importPrefix, dispatch, toast]);

  const handlePrefabImportOpen = useCallback(() => {
    confirmIfDirty(() => {
      setPrefabDir('');
      setPrefabProjectRoot('');
      setPrefabSpriteMap('');
      setPrefabModal(true);
    });
  }, [confirmIfDirty]);

  const handlePrefabImportConfirm = useCallback(async () => {
    if (!prefabDir.trim()) { toast('Please select a directory', 'warning'); return; }
    setPrefabModal(false);
    toast('Importing prefabs...', 'info');
    const result = await importPrefab(
      prefabDir.trim(),
      prefabProjectRoot.trim() || undefined,
      prefabSpriteMap.trim() || undefined,
    );
    if (result.doc) {
      dispatch({ type: 'LOAD_DOCUMENT', document: result.doc });
      const count = result.count || 1;
      toast(`Imported ${count} prefab${count > 1 ? 's' : ''} — loaded "${result.doc.meta.name}"`, 'success');
    } else {
      toast(`Import failed: ${result.error || 'Unknown error'}`, 'error');
    }
  }, [prefabDir, prefabProjectRoot, prefabSpriteMap, dispatch, toast]);

  const handleAddOpen = useCallback(() => {
    if (!state.document) { toast('Create or open a document first', 'warning'); return; }
    setAddModal(true);
  }, [state.document, toast]);

  const handleAddConfirm = useCallback((nodeType: string) => {
    const parentPath = state.selectedPath || 'root';
    const node: UINode = {
      type: nodeType,
      props: NODE_DEFAULTS[nodeType] || { width: 100, height: 100 },
      children: (nodeType === 'ui-view' || nodeType === 'ui-scroll' || nodeType === 'ui-dropdown') ? [] : undefined,
    };
    dispatch({ type: 'ADD_NODE', parentPath, node });
    setAddModal(false);
    toast(`Added <${nodeType}>`, 'success');
  }, [state.selectedPath, dispatch, toast]);

  const handleDeleteSelected = useCallback(() => {
    if (!state.selectedPath || state.selectedPath === 'root') return;
    dispatch({ type: 'DELETE_NODE', path: state.selectedPath });
    toast('Deleted', 'info');
  }, [state.selectedPath, dispatch, toast]);

  const handleUndo = useCallback(() => dispatch({ type: 'UNDO' }), [dispatch]);
  const handleRedo = useCallback(() => dispatch({ type: 'REDO' }), [dispatch]);

  const handleResolution = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const [w, h] = e.target.value.split('x').map(Number);
    dispatch({ type: 'SET_RESOLUTION', width: w, height: h });
  }, [dispatch]);

  // Ctrl+S save
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        doSave();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doSave]);

  useEffect(() => {
    if (!syncRunning) return;
    const ws = new WebSocket(`ws://${location.host}/__editor`);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'sync-progress') {
          if (msg.needUpdate !== undefined) {
            setSyncProgress(prev => ({
              ...prev,
              total: msg.total,
              needUpdate: msg.needUpdate,
              upToDate: msg.upToDate,
            }));
          }
          if (msg.current !== undefined) {
            setSyncProgress(prev => ({
              ...prev,
              current: msg.current,
              file: msg.file,
              status: msg.status,
            }));
          }
          if (msg.converted !== undefined) {
            setSyncProgress(prev => ({
              ...prev,
              converted: msg.converted,
              failed: msg.failed,
              skipped: msg.skipped,
              finished: true,
            }));
            setSyncRunning(false);
            onSyncComplete?.();
          }
        }
        if (msg.type === 'sync-finished') {
          setSyncRunning(false);
          setSyncProgress(prev => ({
            ...prev,
            finished: true,
            ...(msg.exitCode !== 0 && !prev.converted ? { errorMsg: `Process exited with code ${msg.exitCode}` } : {}),
          }));
          if (msg.exitCode === 0) onSyncComplete?.();
        }
      } catch { /* ignore */ }
    };
    return () => ws.close();
  }, [syncRunning, onSyncComplete]);

  const handleSyncOpen = useCallback(() => {
    setSyncSource('');
    setSyncProject('');
    setSyncSpriteMap('');
    setSyncForce(false);
    setSyncProgress({});
    setSyncRunning(false);
    setSyncModal(true);
  }, []);

  const handleSyncStart = useCallback(async () => {
    if (!syncSource.trim()) { toast('Please select a source directory', 'warning'); return; }
    setSyncProgress({});
    const result = await syncPrefabs(
      syncSource.trim(),
      syncProject.trim() || undefined,
      syncSpriteMap.trim() || undefined,
      syncForce,
    );
    if (!result.ok) {
      toast(`Sync failed: ${result.error}`, 'error');
      return;
    }
    setSyncRunning(true);
  }, [syncSource, syncProject, syncSpriteMap, syncForce, toast]);

  const handleCreateProject = useCallback(async () => {
    if (!newProjectDir || !newProjectName.trim()) {
      toast('Please select a directory and enter a name', 'warning');
      return;
    }
    const result = await createProject(newProjectDir, newProjectName.trim(), newProjectWidth, newProjectHeight);
    if (result.ok && result.dir) {
      toast(`Project "${newProjectName}" created`, 'success');
      setProjectModal(null);
      onProjectOpen?.(result.dir, newProjectName.trim());
    } else {
      toast(result.error || 'Failed to create project', 'error');
    }
  }, [newProjectDir, newProjectName, newProjectWidth, newProjectHeight, toast, onProjectOpen]);

  const handleOpenProject = useCallback(async () => {
    if (!openProjectDir) {
      toast('Please select a project directory', 'warning');
      return;
    }
    const result = await openProject(openProjectDir);
    if (result.ok && result.dir) {
      toast(`Opened "${result.config?.name || 'project'}"`, 'success');
      setProjectModal(null);
      onProjectOpen?.(result.dir, result.config?.name);
      // Reload the document that was auto-selected
      const { fetchDocument } = await import('./api');
      const doc = await fetchDocument();
      if (doc) dispatch({ type: 'LOAD_DOCUMENT', document: doc });
    } else {
      toast(result.error || 'Failed to open project', 'error');
    }
  }, [openProjectDir, toast, onProjectOpen, dispatch]);

  const canUndo = state.historyIndex > 0;
  const canRedo = state.historyIndex < state.history.length - 1;

  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const fileMenuItems: MenuDef[] = [
    { label: 'New Project...', icon: '📦', action: () => { setNewProjectDir(''); setNewProjectName(''); setProjectModal('create'); } },
    { label: 'Open Project...', icon: '📂', action: () => { setOpenProjectDir(''); setProjectModal('open'); } },
    { divider: true, label: '' },
    { label: 'New Document', icon: '📄', shortcut: 'Ctrl+N', action: handleNew },
    { label: 'Open File...', icon: '📁', shortcut: 'Ctrl+O', action: handleOpen },
    { label: `Save${state.dirty ? ' *' : ''}`, icon: '💾', shortcut: 'Ctrl+S', disabled: !state.document || !state.dirty, action: handleSave },
    { divider: true, label: '' },
    { label: 'Export JSON', icon: '📋', disabled: !state.document, action: handleExportJSON },
    { label: 'Export TSX', icon: '⚛', disabled: !state.document, action: handleExportTSX },
    { divider: true, label: '' },
    { label: 'Import FairyGUI...', icon: '🔄', action: handleImportOpen },
    { label: 'Import Prefab...', icon: '🎮', action: handlePrefabImportOpen },
    { label: 'Sync Prefabs...', icon: '🔁', action: handleSyncOpen },
    { divider: true, label: '' },
    { label: protoGenerating ? 'Generating...' : 'Generate Protocol', icon: '📡', disabled: protoGenerating, action: handleGenerateProtocol },
  ];

  const editMenuItems: MenuDef[] = [
    { label: 'Undo', icon: '↩', shortcut: 'Ctrl+Z', disabled: !canUndo, action: handleUndo },
    { label: 'Redo', icon: '↪', shortcut: 'Ctrl+Y', disabled: !canRedo, action: handleRedo },
    { divider: true, label: '' },
    { label: 'Delete', icon: '🗑', shortcut: 'Del', danger: true, disabled: !state.selectedPath || state.selectedPath === 'root', action: handleDeleteSelected },
  ];

  const viewMenuItems: MenuDef[] = [
    { label: `Preview${previewActive ? ' ✓' : ''}`, icon: '👁', action: onTogglePreview },
    { divider: true, label: '' },
    { label: 'Toggle Theme', icon: '🎨', action: () => {
      const html = document.documentElement;
      const current = html.getAttribute('data-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      html.setAttribute('data-theme', next);
      try { localStorage.setItem('tower-editor-theme', next); } catch {}
    }},
  ];

  return (
    <div className="toolbar">
      <span className="toolbar-title">TowerUI</span>
      {projectName && (
        <span className="toolbar-project-name">{projectName}</span>
      )}

      <div className="menu-bar">
        <ToolbarMenu label="File" items={fileMenuItems} openMenu={openMenu} onToggle={setOpenMenu} />
        <ToolbarMenu label="Edit" items={editMenuItems} openMenu={openMenu} onToggle={setOpenMenu} />
        <ToolbarMenu label="View" items={viewMenuItems} openMenu={openMenu} onToggle={setOpenMenu} />
      </div>

      <div className="toolbar-sep" />

      <select className="toolbar-select" onChange={handleResolution} value={`${state.designWidth}x${state.designHeight}`}>
        {RESOLUTIONS.map(r => (
          <option key={r.label} value={`${r.w}x${r.h}`}>{r.label}</option>
        ))}
      </select>

      <div className="toolbar-spacer" />

      {state.document && (
        <span className="toolbar-info">
          {state.document.meta.name}
          {state.document.meta.source ? ` (${state.document.meta.source})` : ''}
          {state.dirty ? ' *' : ''}
        </span>
      )}

      {/* Modals */}
      <InputModal
        open={newModal}
        title="New Document"
        label="Document name"
        defaultValue="NewUI"
        placeholder="e.g. LoginScreen"
        onConfirm={handleNewConfirm}
        onCancel={() => setNewModal(false)}
      />

      <SelectModal
        open={addModal}
        title="Add Node"
        label={`Add to: ${state.selectedPath || 'root'}`}
        options={NODE_TYPES}
        onConfirm={handleAddConfirm}
        onCancel={() => setAddModal(false)}
      />

      {importModal && (
        <div className="modal-overlay" onClick={() => setImportModal(false)}>
          <div className="modal-dialog" style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Import FairyGUI</span>
              <button className="modal-close" onClick={() => setImportModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <label className="modal-label">Package directory</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  className="modal-input"
                  value={importDir}
                  onChange={(e) => setImportDir(e.target.value)}
                  placeholder="Click Browse to select..."
                  style={{ flex: 1 }}
                  readOnly
                />
                <button className="modal-btn modal-btn-primary" onClick={() => setDirPickerOpen(true)} style={{ whiteSpace: 'nowrap' }}>
                  Browse...
                </button>
              </div>
              <label className="modal-label" style={{ marginTop: 10 }}>Sprite prefix (optional)</label>
              <input
                className="modal-input"
                value={importPrefix}
                onChange={(e) => setImportPrefix(e.target.value)}
                placeholder="e.g. UIActivity"
              />
              <div className="modal-actions">
                <button className="modal-btn modal-btn-secondary" onClick={() => setImportModal(false)}>Cancel</button>
                <button className="modal-btn modal-btn-primary" onClick={handleImportConfirm} disabled={!importDir.trim()}>Import</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <DirectoryPicker
        open={dirPickerOpen}
        title="Select FairyGUI Package Directory"
        onSelect={(selectedPath) => {
          setImportDir(selectedPath);
          setDirPickerOpen(false);
        }}
        onCancel={() => setDirPickerOpen(false)}
      />

      <ConfirmModal
        open={!!unsavedModal}
        title="Unsaved Changes"
        message="You have unsaved changes. Discard them?"
        confirmText="Discard"
        danger
        onConfirm={() => { const fn = unsavedModal; setUnsavedModal(null); fn?.(); }}
        onCancel={() => setUnsavedModal(null)}
      />

      {/* Create Project Modal */}
      {projectModal === 'create' && (
        <div className="modal-overlay" onClick={() => setProjectModal(null)}>
          <div className="modal-dialog" style={{ width: 500 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Create New Project</span>
              <button className="modal-close" onClick={() => setProjectModal(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <label className="modal-label">Parent directory</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  className="modal-input"
                  value={newProjectDir}
                  readOnly
                  placeholder="Select a directory..."
                  style={{ flex: 1 }}
                />
                <button className="modal-btn modal-btn-primary" onClick={() => setProjectDirPicker(true)} style={{ whiteSpace: 'nowrap' }}>
                  Browse...
                </button>
              </div>
              <label className="modal-label" style={{ marginTop: 10 }}>Project name</label>
              <input
                className="modal-input"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="e.g. MyGameUI"
              />
              <label className="modal-label" style={{ marginTop: 10 }}>Design resolution</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  className="modal-input"
                  type="number"
                  value={newProjectWidth}
                  onChange={(e) => setNewProjectWidth(parseInt(e.target.value) || 1080)}
                  style={{ width: 100 }}
                />
                <span style={{ color: 'var(--text-secondary)' }}>&times;</span>
                <input
                  className="modal-input"
                  type="number"
                  value={newProjectHeight}
                  onChange={(e) => setNewProjectHeight(parseInt(e.target.value) || 1920)}
                  style={{ width: 100 }}
                />
              </div>
              <div className="modal-actions">
                <button className="modal-btn modal-btn-secondary" onClick={() => setProjectModal(null)}>Cancel</button>
                <button className="modal-btn modal-btn-primary" onClick={handleCreateProject} disabled={!newProjectDir || !newProjectName.trim()}>Create</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Open Project Modal */}
      {projectModal === 'open' && (
        <div className="modal-overlay" onClick={() => setProjectModal(null)}>
          <div className="modal-dialog" style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Open Project</span>
              <button className="modal-close" onClick={() => setProjectModal(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <label className="modal-label">Project directory</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  className="modal-input"
                  value={openProjectDir}
                  readOnly
                  placeholder="Select project directory..."
                  style={{ flex: 1 }}
                />
                <button className="modal-btn modal-btn-primary" onClick={() => setOpenProjectDirPicker(true)} style={{ whiteSpace: 'nowrap' }}>
                  Browse...
                </button>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8 }}>
                Select a directory containing tower.project.json
              </p>
              <div className="modal-actions">
                <button className="modal-btn modal-btn-secondary" onClick={() => setProjectModal(null)}>Cancel</button>
                <button className="modal-btn modal-btn-primary" onClick={handleOpenProject} disabled={!openProjectDir}>Open</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <DirectoryPicker
        open={projectDirPicker}
        title="Select Parent Directory"
        onSelect={(p) => { setNewProjectDir(p); setProjectDirPicker(false); }}
        onCancel={() => setProjectDirPicker(false)}
      />

      <DirectoryPicker
        open={openProjectDirPicker}
        title="Select Project Directory"
        onSelect={(p) => { setOpenProjectDir(p); setOpenProjectDirPicker(false); }}
        onCancel={() => setOpenProjectDirPicker(false)}
      />

      {/* Import Prefab Modal */}
      {prefabModal && (
        <div className="modal-overlay" onClick={() => setPrefabModal(false)}>
          <div className="modal-dialog" style={{ width: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Import Unity Prefab</span>
              <button className="modal-close" onClick={() => setPrefabModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <label className="modal-label">Prefab directory</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  className="modal-input"
                  value={prefabDir}
                  readOnly
                  placeholder="Select a directory containing .prefab files..."
                  style={{ flex: 1 }}
                />
                <button className="modal-btn modal-btn-primary" onClick={() => setPrefabDirPicker(true)} style={{ whiteSpace: 'nowrap' }}>
                  Browse...
                </button>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>
                Recursively scans all .prefab files in subdirectories
              </p>

              <label className="modal-label" style={{ marginTop: 12 }}>Project root (optional)</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  className="modal-input"
                  value={prefabProjectRoot}
                  readOnly
                  placeholder="Unity project Assets directory"
                  style={{ flex: 1 }}
                />
                <button className="modal-btn modal-btn-secondary" onClick={() => setPrefabProjectPicker(true)} style={{ whiteSpace: 'nowrap' }}>
                  Browse...
                </button>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>
                Used for resolving nested prefabs and serving sprite images
              </p>

              <label className="modal-label" style={{ marginTop: 12 }}>Sprite map path (optional)</label>
              <input
                className="modal-input"
                value={prefabSpriteMap}
                onChange={(e) => setPrefabSpriteMap(e.target.value)}
                placeholder="e.g. D:\project\sprite-map.json"
              />
              <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>
                Generate with: node tools/build-sprite-map.mjs
              </p>

              <div className="modal-actions">
                <button className="modal-btn modal-btn-secondary" onClick={() => setPrefabModal(false)}>Cancel</button>
                <button className="modal-btn modal-btn-primary" onClick={handlePrefabImportConfirm} disabled={!prefabDir.trim()}>Import</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <DirectoryPicker
        open={prefabDirPicker}
        title="Select Prefab Directory"
        onSelect={(p) => { setPrefabDir(p); setPrefabDirPicker(false); }}
        onCancel={() => setPrefabDirPicker(false)}
      />

      <DirectoryPicker
        open={prefabProjectPicker}
        title="Select Unity Project Root"
        onSelect={(p) => { setPrefabProjectRoot(p); setPrefabProjectPicker(false); }}
        onCancel={() => setPrefabProjectPicker(false)}
      />

      {/* Sync Prefabs Modal */}
      {syncModal && (
        <div className="modal-overlay" onClick={() => { if (!syncRunning) setSyncModal(false); }}>
          <div className="modal-dialog" style={{ width: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Sync Prefabs (Incremental Mirror)</span>
              {!syncRunning && (
                <button className="modal-close" onClick={() => setSyncModal(false)}>&times;</button>
              )}
            </div>
            <div className="modal-body">
              <label className="modal-label">Source directory (Unity Assets)</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  className="modal-input"
                  value={syncSource}
                  readOnly
                  placeholder="Select Unity Assets directory..."
                  style={{ flex: 1 }}
                  disabled={syncRunning}
                />
                <button
                  className="modal-btn modal-btn-primary"
                  onClick={() => setSyncSourcePicker(true)}
                  style={{ whiteSpace: 'nowrap' }}
                  disabled={syncRunning}
                >
                  Browse...
                </button>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>
                Recursively scans for .prefab files, only converts new/modified ones
              </p>

              <label className="modal-label" style={{ marginTop: 12 }}>Project root (optional)</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  className="modal-input"
                  value={syncProject}
                  readOnly
                  placeholder="Unity project root for nested prefab resolution"
                  style={{ flex: 1 }}
                  disabled={syncRunning}
                />
                <button
                  className="modal-btn modal-btn-secondary"
                  onClick={() => setSyncProjectPicker(true)}
                  style={{ whiteSpace: 'nowrap' }}
                  disabled={syncRunning}
                >
                  Browse...
                </button>
              </div>

              <label className="modal-label" style={{ marginTop: 12 }}>Sprite map (optional)</label>
              <input
                className="modal-input"
                value={syncSpriteMap}
                onChange={(e) => setSyncSpriteMap(e.target.value)}
                placeholder="e.g. D:\project\sprite-map.json"
                disabled={syncRunning}
              />

              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  id="sync-force"
                  checked={syncForce}
                  onChange={(e) => setSyncForce(e.target.checked)}
                  disabled={syncRunning}
                />
                <label htmlFor="sync-force" style={{ color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer' }}>
                  Force full re-sync (ignore timestamps)
                </label>
              </div>

              {/* Progress display */}
              {(syncRunning || syncProgress.finished) && (
                <div style={{
                  marginTop: 16,
                  padding: 12,
                  background: 'var(--bg-tertiary, #1a1a2e)',
                  borderRadius: 6,
                  border: '1px solid var(--border, #333)',
                  fontSize: 13,
                  minHeight: 72,
                  overflow: 'hidden',
                }}>
                  {syncProgress.needUpdate !== undefined && (
                    <div style={{ marginBottom: 8, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      Found {syncProgress.total} prefabs: {syncProgress.needUpdate} need update, {syncProgress.upToDate} up to date
                    </div>
                  )}

                  {syncProgress.current !== undefined && syncProgress.needUpdate !== undefined && !syncProgress.finished && (
                    <>
                      <div style={{
                        width: '100%',
                        height: 6,
                        background: 'var(--bg-secondary, #222)',
                        borderRadius: 3,
                        overflow: 'hidden',
                        marginBottom: 8,
                      }}>
                        <div style={{
                          width: `${Math.round((syncProgress.current / syncProgress.needUpdate) * 100)}%`,
                          height: '100%',
                          background: '#4da6ff',
                          borderRadius: 3,
                          transition: 'width 0.2s ease',
                        }} />
                      </div>
                      <div style={{
                        color: 'var(--text-secondary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>
                        [{syncProgress.current}/{syncProgress.needUpdate}] {syncProgress.file}
                      </div>
                    </>
                  )}

                  {syncProgress.finished && (
                    <div style={{ color: syncProgress.errorMsg ? '#ff6b6b' : syncProgress.failed ? '#ff6b6b' : '#4caf50' }}>
                      {syncProgress.errorMsg
                        ? <>Error: {syncProgress.errorMsg}<br/>Partial: {syncProgress.converted ?? 0} converted before crash</>
                        : <>Done: {syncProgress.converted ?? 0} converted, {syncProgress.failed ?? 0} failed, {syncProgress.skipped ?? 0} skipped</>
                      }
                    </div>
                  )}

                  {syncRunning && !syncProgress.current && !syncProgress.finished && (
                    <div style={{ color: 'var(--text-secondary)' }}>Scanning prefabs...</div>
                  )}
                </div>
              )}

              <div className="modal-actions">
                {!syncRunning && !syncProgress.finished && (
                  <>
                    <button className="modal-btn modal-btn-secondary" onClick={() => setSyncModal(false)}>Cancel</button>
                    <button className="modal-btn modal-btn-primary" onClick={handleSyncStart} disabled={!syncSource.trim()}>
                      Start Sync
                    </button>
                  </>
                )}
                {syncProgress.finished && (
                  <button className="modal-btn modal-btn-primary" onClick={() => setSyncModal(false)}>Close</button>
                )}
                {syncRunning && !syncProgress.finished && (
                  <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Syncing... please wait</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <DirectoryPicker
        open={syncSourcePicker}
        title="Select Prefab Source Directory"
        onSelect={(p) => { setSyncSource(p); setSyncSourcePicker(false); }}
        onCancel={() => setSyncSourcePicker(false)}
      />

      <DirectoryPicker
        open={syncProjectPicker}
        title="Select Unity Project Root"
        onSelect={(p) => { setSyncProject(p); setSyncProjectPicker(false); }}
        onCancel={() => setSyncProjectPicker(false)}
      />
    </div>
  );
}

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function jsonToTSXSimple(node: any, componentName: string): string {
  const funcName = componentName
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/^(\d)/, '_$1')
    .replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase())
    .replace(/^[a-z]/, (c: string) => c.toUpperCase());

  let code = `import React from 'react';\n\n`;
  code += `export function ${funcName}() {\n`;
  code += `  return (\n`;
  code += renderNodeToTSX(node, 4);
  code += `  );\n`;
  code += `}\n`;
  return code;
}

function renderNodeToTSX(node: any, indent: number): string {
  const pad = ' '.repeat(indent);
  const tag = node.type;
  const props = node.props || {};
  const children = node.children || [];

  let result = `${pad}<${tag}`;
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === 'function') continue;
    result += ` ${formatProp(key, value)}`;
  }

  if (children.length === 0) {
    result += ` />\n`;
    return result;
  }

  result += `>\n`;
  for (const child of children) {
    if (typeof child === 'string') {
      result += `${pad}  {${JSON.stringify(child)}}\n`;
    } else {
      result += renderNodeToTSX(child, indent + 2);
    }
  }
  result += `${pad}</${tag}>\n`;
  return result;
}

function formatProp(key: string, value: any): string {
  if (typeof value === 'string') return `${key}="${value}"`;
  if (typeof value === 'boolean') return value ? key : `${key}={false}`;
  if (typeof value === 'number') return `${key}={${value}}`;
  return `${key}={${JSON.stringify(value)}}`;
}
