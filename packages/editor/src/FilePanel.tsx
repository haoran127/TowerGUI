import React, { useState, useEffect, useCallback } from 'react';
import { listFiles, createFile, renameFile, deleteFile, openDocument, type FileEntry } from './api';
import { useEditor } from './state';
import { ContextMenu, type MenuItemDef } from './components/ContextMenu';
import { InputModal, ConfirmModal } from './components/Modal';
import { useToast } from './components/Toast';

interface FileNodeProps {
  entry: FileEntry;
  depth: number;
  activeFile: string | null;
  onFileOpen: (entry: FileEntry) => void;
  onContextMenu: (e: React.MouseEvent, entry: FileEntry) => void;
}

function FileNode({ entry, depth, activeFile, onFileOpen, onContextMenu }: FileNodeProps) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isDir = entry.type === 'directory';
  const isActive = activeFile === entry.path;

  const icon = isDir
    ? (expanded ? '📂' : '📁')
    : entry.type === 'document' ? '📄'
    : entry.type === 'config' ? '⚙'
    : '🖼';

  return (
    <div className="file-node">
      <div
        className={`file-item${isActive ? ' file-active' : ''}`}
        style={{ paddingLeft: depth * 16 + 12 }}
        onClick={() => {
          if (isDir) setExpanded(p => !p);
          else onFileOpen(entry);
        }}
        onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, entry); }}
      >
        <span className="file-icon">{icon}</span>
        <span className="file-name">{entry.name}</span>
      </div>
      {isDir && expanded && entry.children && (
        <div className="file-children">
          {entry.children.map((child) => (
            <FileNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              activeFile={activeFile}
              onFileOpen={onFileOpen}
              onContextMenu={onContextMenu}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface FilePanelProps {
  projectDir: string | null;
  onDocumentOpen: (filePath: string) => void;
}

export function FilePanel({ projectDir, onDocumentOpen }: FilePanelProps) {
  const { toast } = useToast();
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; entry: FileEntry } | null>(null);

  const [newFileModal, setNewFileModal] = useState<{ parentDir: string; type: 'file' | 'directory' } | null>(null);
  const [renameModal, setRenameModal] = useState<{ entry: FileEntry } | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ entry: FileEntry } | null>(null);

  const refresh = useCallback(async () => {
    if (!projectDir) return;
    const result = await listFiles(projectDir);
    setFiles(result.files || []);
  }, [projectDir]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleFileOpen = useCallback((entry: FileEntry) => {
    if (entry.type === 'document') {
      setActiveFile(entry.path);
      onDocumentOpen(entry.path);
    }
  }, [onDocumentOpen]);

  const handleContextMenu = useCallback((e: React.MouseEvent, entry: FileEntry) => {
    setCtxMenu({ x: e.clientX, y: e.clientY, entry });
  }, []);

  const getParentDir = (entry: FileEntry) => {
    if (entry.type === 'directory') return entry.path;
    const sep = entry.path.includes('/') ? '/' : '\\';
    return entry.path.substring(0, entry.path.lastIndexOf(sep));
  };

  const menuItems: MenuItemDef[] = ctxMenu ? [
    {
      label: 'New Screen',
      icon: '📄',
      action: () => setNewFileModal({ parentDir: getParentDir(ctxMenu.entry), type: 'file' }),
    },
    {
      label: 'New Folder',
      icon: '📁',
      action: () => setNewFileModal({ parentDir: getParentDir(ctxMenu.entry), type: 'directory' }),
    },
    { divider: true, label: '' },
    {
      label: 'Rename',
      icon: '✎',
      action: () => setRenameModal({ entry: ctxMenu.entry }),
    },
    { divider: true, label: '' },
    {
      label: 'Delete',
      icon: '🗑',
      danger: true,
      action: () => setDeleteModal({ entry: ctxMenu.entry }),
    },
  ] : [];

  const handleNewFile = useCallback(async (name: string) => {
    if (!newFileModal) return;
    const sep = newFileModal.parentDir.includes('/') ? '/' : '\\';
    const fullName = newFileModal.type === 'file' && !name.endsWith('.tower.json')
      ? name + '.tower.json' : name;
    const filePath = newFileModal.parentDir + sep + fullName;
    const ok = await createFile(filePath, newFileModal.type);
    if (ok) {
      toast(`Created ${fullName}`, 'success');
      await refresh();
    } else {
      toast('Failed to create', 'error');
    }
    setNewFileModal(null);
  }, [newFileModal, refresh, toast]);

  const handleRename = useCallback(async (newName: string) => {
    if (!renameModal) return;
    const oldPath = renameModal.entry.path;
    const sep = oldPath.includes('/') ? '/' : '\\';
    const parentDir = oldPath.substring(0, oldPath.lastIndexOf(sep));
    const newPath = parentDir + sep + newName;
    const ok = await renameFile(oldPath, newPath);
    if (ok) {
      toast('Renamed', 'success');
      await refresh();
    } else {
      toast('Rename failed', 'error');
    }
    setRenameModal(null);
  }, [renameModal, refresh, toast]);

  const handleDelete = useCallback(async () => {
    if (!deleteModal) return;
    const ok = await deleteFile(deleteModal.entry.path);
    if (ok) {
      toast('Deleted', 'info');
      if (activeFile === deleteModal.entry.path) setActiveFile(null);
      await refresh();
    } else {
      toast('Delete failed', 'error');
    }
    setDeleteModal(null);
  }, [deleteModal, activeFile, refresh, toast]);

  if (!projectDir) {
    return (
      <div className="file-panel-empty">
        <span style={{ fontSize: 32, marginBottom: 8 }}>📁</span>
        <span>No project open</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Use File menu to create or open a project</span>
      </div>
    );
  }

  return (
    <div className="file-panel">
      <div className="file-panel-header">
        <span>Files</span>
        <div className="file-panel-actions">
          <button
            className="file-action-btn"
            title="New Screen"
            onClick={() => setNewFileModal({ parentDir: projectDir, type: 'file' })}
          >+</button>
          <button
            className="file-action-btn"
            title="New Folder"
            onClick={() => setNewFileModal({ parentDir: projectDir, type: 'directory' })}
          >📁+</button>
          <button className="file-action-btn" title="Refresh" onClick={refresh}>↻</button>
        </div>
      </div>
      <div className="file-tree">
        {files.length === 0 && (
          <div className="file-panel-empty" style={{ padding: 16 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Empty project</span>
          </div>
        )}
        {files.map((entry) => (
          <FileNode
            key={entry.path}
            entry={entry}
            depth={0}
            activeFile={activeFile}
            onFileOpen={handleFileOpen}
            onContextMenu={handleContextMenu}
          />
        ))}
      </div>

      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={menuItems} onClose={() => setCtxMenu(null)} />
      )}

      <InputModal
        open={!!newFileModal}
        title={newFileModal?.type === 'directory' ? 'New Folder' : 'New Screen'}
        label="Name"
        placeholder={newFileModal?.type === 'directory' ? 'folder-name' : 'ScreenName'}
        onConfirm={handleNewFile}
        onCancel={() => setNewFileModal(null)}
      />

      <InputModal
        open={!!renameModal}
        title="Rename"
        label="New Name"
        defaultValue={renameModal?.entry.name || ''}
        placeholder="new name"
        onConfirm={handleRename}
        onCancel={() => setRenameModal(null)}
      />

      <ConfirmModal
        open={!!deleteModal}
        title="Delete"
        message={`Delete "${deleteModal?.entry.name}"? This cannot be undone.`}
        confirmText="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteModal(null)}
      />
    </div>
  );
}
