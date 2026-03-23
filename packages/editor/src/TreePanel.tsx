import React, { useState, useCallback, useRef } from 'react';
import { useEditor, type UINode } from './state';
import { ContextMenu, type MenuItemDef } from './components/ContextMenu';
import { InputModal, SelectModal, ConfirmModal } from './components/Modal';
import { useToast } from './components/Toast';

const NODE_TYPES = [
  { value: 'ui-view', label: 'ui-view (Container)' },
  { value: 'ui-text', label: 'ui-text (Text)' },
  { value: 'ui-image', label: 'ui-image (Image)' },
  { value: 'ui-button', label: 'ui-button (Button)' },
  { value: 'ui-input', label: 'ui-input (Input)' },
  { value: 'ui-scroll', label: 'ui-scroll (Scroll)' },
  { value: 'ui-toggle', label: 'ui-toggle (Toggle)' },
  { value: 'ui-slider', label: 'ui-slider (Slider)' },
  { value: 'ui-dropdown', label: 'ui-dropdown (Dropdown)' },
];

interface DragState {
  fromPath: string;
  overPath: string | null;
  position: 'above' | 'below' | 'inside';
}

interface TreeNodeItemProps {
  node: UINode | string;
  path: string;
  depth: number;
  dragState: DragState | null;
  onDragStateChange: (s: DragState | null) => void;
  onContextMenu: (e: React.MouseEvent, path: string, node: UINode) => void;
}

function TreeNodeItem({ node, path, depth, dragState, onDragStateChange, onContextMenu }: TreeNodeItemProps) {
  const { state, dispatch } = useEditor();
  const [expanded, setExpanded] = useState(depth < 2);

  if (typeof node === 'string') {
    return (
      <div className="tree-item tree-text" style={{ paddingLeft: depth * 16 + 8 }}>
        <span className="tree-icon">T</span>
        <span className="tree-label">{`"${node.slice(0, 20)}${node.length > 20 ? '…' : ''}"`}</span>
      </div>
    );
  }

  const isSelected = state.selectedPath === path;
  const isMultiSelected = state.selectedPaths.includes(path) && !isSelected;
  const hasChildren = node.children && node.children.length > 0;
  const name = node.props?.name || node.props?.text || '';
  const label = node.type === '$ref'
    ? `$ref → ${(node as any).ref}`
    : `<${node.type}>${name ? ` "${name.slice(0, 15)}"` : ''}`;

  const isHidden = node.props?.visible === false;

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch({ type: 'SELECT_NODE', path, multi: e.ctrlKey || e.metaKey });
  }, [path, dispatch]);

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(prev => !prev);
  }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasChildren) setExpanded(prev => !prev);
  }, [hasChildren]);

  const handleCtxMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dispatch({ type: 'SELECT_NODE', path });
    onContextMenu(e, path, node);
  }, [path, node, dispatch, onContextMenu]);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', path);
    e.dataTransfer.effectAllowed = 'move';
    onDragStateChange({ fromPath: path, overPath: null, position: 'inside' });
  }, [path, onDragStateChange]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!dragState || dragState.fromPath === path) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    const h = rect.height;
    let pos: 'above' | 'below' | 'inside';
    if (y < h * 0.25) pos = 'above';
    else if (y > h * 0.75) pos = 'below';
    else pos = 'inside';
    onDragStateChange({ ...dragState, overPath: path, position: pos });
  }, [path, dragState, onDragStateChange]);

  const handleDragEnd = useCallback(() => {
    onDragStateChange(null);
  }, [onDragStateChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragState || dragState.fromPath === path) { onDragStateChange(null); return; }

    const fromPath = dragState.fromPath;
    const pos = dragState.position;
    onDragStateChange(null);

    if (pos === 'inside') {
      dispatch({ type: 'MOVE_NODE', fromPath, toPath: path, index: 0 });
    } else {
      const parts = path.replace(/^root\.?/, '').split('.').filter(Boolean);
      const idx = parseInt(parts[parts.length - 1] || '0', 10);
      const parentParts = parts.slice(0, -1);
      const parentPath = parentParts.length > 0 ? 'root.' + parentParts.join('.') : 'root';
      dispatch({ type: 'MOVE_NODE', fromPath, toPath: parentPath, index: pos === 'below' ? idx + 1 : idx });
    }
  }, [path, dragState, dispatch, onDragStateChange]);

  let dragClass = '';
  if (dragState?.overPath === path) {
    dragClass = ` drag-over-${dragState.position}`;
  }

  return (
    <div className="tree-node">
      <div
        className={`tree-item${isSelected ? ' selected' : ''}${isMultiSelected ? ' multi-selected' : ''}${dragClass}`}
        style={{ paddingLeft: depth * 16 + 8 }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleCtxMenu}
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDrop={handleDrop}
      >
        {hasChildren ? (
          <span className="tree-toggle" onClick={handleToggle}>
            {expanded ? '▼' : '▶'}
          </span>
        ) : (
          <span className="tree-toggle tree-leaf">·</span>
        )}
        <span className="tree-icon">{getTypeIcon(node.type)}</span>
        <span className="tree-label" style={isHidden ? { opacity: 0.4 } : undefined}>{label}</span>
        <span
          className={`tree-eye${isHidden ? ' tree-eye-off' : ''}`}
          title={isHidden ? 'Show' : 'Hide'}
          onClick={(e) => {
            e.stopPropagation();
            dispatch({ type: 'UPDATE_NODE_PROP', path, key: 'visible', value: isHidden ? true : false });
          }}
        >
          {isHidden ? '🚫' : '👁'}
        </span>
      </div>
      {expanded && hasChildren && (
        <div className="tree-children">
          {node.children!.map((child, i) => (
            <TreeNodeItem
              key={i}
              node={child}
              path={`${path}.${i}`}
              depth={depth + 1}
              dragState={dragState}
              onDragStateChange={onDragStateChange}
              onContextMenu={onContextMenu}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function getTypeIcon(type: string): string {
  switch (type) {
    case 'ui-view': return '□';
    case 'ui-text': return 'A';
    case 'ui-image': return '🖼';
    case 'ui-button': return '⬜';
    case 'ui-input': return '⌨';
    case 'ui-scroll': return '↕';
    case 'ui-toggle': return '⬤';
    case 'ui-slider': return '⟿';
    case 'ui-dropdown': return '▾';
    case '$ref': return '↗';
    default: return '?';
  }
}

export function TreePanel() {
  const { state, dispatch } = useEditor();
  const { toast } = useToast();

  const [dragState, setDragState] = useState<DragState | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; path: string; node: UINode } | null>(null);
  const [clipboard, setClipboard] = useState<UINode | null>(null);

  const [addModal, setAddModal] = useState<{ parentPath: string } | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ path: string; type: string } | null>(null);
  const [renameModal, setRenameModal] = useState<{ path: string; currentName: string } | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent, path: string, node: UINode) => {
    setCtxMenu({ x: e.clientX, y: e.clientY, path, node });
  }, []);

  const isRoot = ctxMenu?.path === 'root';
  const menuItems: MenuItemDef[] = ctxMenu ? [
    {
      label: 'Add Child',
      icon: '+',
      action: () => setAddModal({ parentPath: ctxMenu.path }),
    },
    {
      label: 'Add Sibling After',
      icon: '↓',
      disabled: isRoot,
      action: () => {
        if (!isRoot) {
          const parts = ctxMenu.path.replace(/^root\.?/, '').split('.').filter(Boolean);
          const idx = parseInt(parts[parts.length - 1] || '0', 10);
          const parentParts = parts.slice(0, -1);
          const parentPath = parentParts.length > 0 ? 'root.' + parentParts.join('.') : 'root';
          setAddModal({ parentPath });
        }
      },
    },
    { divider: true, label: '' },
    {
      label: 'Copy',
      icon: '📋',
      shortcut: 'Ctrl+C',
      action: () => {
        setClipboard(JSON.parse(JSON.stringify(ctxMenu.node)));
        toast('Node copied', 'success');
      },
    },
    {
      label: 'Paste Inside',
      icon: '📋',
      shortcut: 'Ctrl+V',
      disabled: !clipboard,
      action: () => {
        if (clipboard) {
          dispatch({ type: 'ADD_NODE', parentPath: ctxMenu.path, node: JSON.parse(JSON.stringify(clipboard)) });
          toast('Node pasted', 'success');
        }
      },
    },
    {
      label: 'Duplicate',
      icon: '⎘',
      shortcut: 'Ctrl+D',
      disabled: isRoot,
      action: () => {
        if (!isRoot) {
          const parts = ctxMenu.path.replace(/^root\.?/, '').split('.').filter(Boolean);
          const idx = parseInt(parts[parts.length - 1] || '0', 10);
          const parentParts = parts.slice(0, -1);
          const parentPath = parentParts.length > 0 ? 'root.' + parentParts.join('.') : 'root';
          const copy = JSON.parse(JSON.stringify(ctxMenu.node));
          dispatch({ type: 'ADD_NODE', parentPath, node: copy, index: idx + 1 });
          toast('Node duplicated', 'success');
        }
      },
    },
    { divider: true, label: '' },
    {
      label: ctxMenu.node.props?.visible === false ? 'Show' : 'Hide',
      icon: '👁',
      action: () => {
        const current = ctxMenu.node.props?.visible;
        dispatch({ type: 'UPDATE_NODE_PROP', path: ctxMenu.path, key: 'visible', value: current === false ? true : false });
      },
    },
    {
      label: 'Rename',
      icon: '✎',
      action: () => setRenameModal({ path: ctxMenu.path, currentName: ctxMenu.node.props?.name || '' }),
    },
    { divider: true, label: '' },
    {
      label: 'Delete',
      icon: '🗑',
      shortcut: 'Del',
      danger: true,
      disabled: isRoot,
      action: () => {
        if (!isRoot) setDeleteModal({ path: ctxMenu.path, type: ctxMenu.node.type });
      },
    },
  ] : [];

  const handleAddConfirm = useCallback((nodeType: string) => {
    if (!addModal) return;
    const defaults: Record<string, any> = {
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
    const node: UINode = {
      type: nodeType,
      props: defaults[nodeType] || { width: 100, height: 100 },
      children: nodeType === 'ui-view' || nodeType === 'ui-scroll' || nodeType === 'ui-dropdown' ? [] : undefined,
    };
    dispatch({ type: 'ADD_NODE', parentPath: addModal.parentPath, node });
    setAddModal(null);
    toast(`Added <${nodeType}>`, 'success');
  }, [addModal, dispatch, toast]);

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteModal) return;
    dispatch({ type: 'DELETE_NODE', path: deleteModal.path });
    setDeleteModal(null);
    toast('Node deleted', 'info');
  }, [deleteModal, dispatch, toast]);

  const handleRenameConfirm = useCallback((name: string) => {
    if (!renameModal) return;
    dispatch({ type: 'UPDATE_NODE_PROP', path: renameModal.path, key: 'name', value: name });
    setRenameModal(null);
    toast('Node renamed', 'success');
  }, [renameModal, dispatch, toast]);

  // Keyboard shortcuts
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!state.selectedPath || !state.document) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        const node = getNodeAt(state.document.root, state.selectedPath);
        if (node && typeof node !== 'string') {
          setClipboard(JSON.parse(JSON.stringify(node)));
          toast('Copied', 'success');
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && clipboard) {
        dispatch({ type: 'ADD_NODE', parentPath: state.selectedPath, node: JSON.parse(JSON.stringify(clipboard)) });
        toast('Pasted', 'success');
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        if (state.selectedPath !== 'root') {
          const node = getNodeAt(state.document.root, state.selectedPath);
          if (node && typeof node !== 'string') {
            const parts = state.selectedPath.replace(/^root\.?/, '').split('.').filter(Boolean);
            const idx = parseInt(parts[parts.length - 1] || '0', 10);
            const parentParts = parts.slice(0, -1);
            const parentPath = parentParts.length > 0 ? 'root.' + parentParts.join('.') : 'root';
            dispatch({ type: 'ADD_NODE', parentPath, node: JSON.parse(JSON.stringify(node)), index: idx + 1 });
            toast('Duplicated', 'success');
          }
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.selectedPath, state.document, clipboard, dispatch, toast]);

  if (!state.document) {
    return (
      <div className="tree-panel">
        <div className="panel-empty">No document loaded</div>
      </div>
    );
  }

  return (
    <div className="tree-panel">
      <div className="tree-content">
        <TreeNodeItem
          node={state.document.root}
          path="root"
          depth={0}
          dragState={dragState}
          onDragStateChange={setDragState}
          onContextMenu={handleContextMenu}
        />
      </div>

      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={menuItems} onClose={() => setCtxMenu(null)} />
      )}

      <SelectModal
        open={!!addModal}
        title="Add Node"
        label="Node type"
        options={NODE_TYPES}
        onConfirm={handleAddConfirm}
        onCancel={() => setAddModal(null)}
      />

      <ConfirmModal
        open={!!deleteModal}
        title="Delete Node"
        message={`Delete <${deleteModal?.type}>? This cannot be undone.`}
        confirmText="Delete"
        danger
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteModal(null)}
      />

      <InputModal
        open={!!renameModal}
        title="Rename Node"
        label="Name"
        defaultValue={renameModal?.currentName || ''}
        placeholder="Node name"
        onConfirm={handleRenameConfirm}
        onCancel={() => setRenameModal(null)}
      />
    </div>
  );
}

function getNodeAt(root: UINode, path: string): UINode | string | null {
  if (!path || path === 'root') return root;
  const parts = path.replace(/^root\.?/, '').split('.').filter(Boolean);
  let current: UINode = root;
  for (const part of parts) {
    const idx = parseInt(part, 10);
    if (isNaN(idx) || !current.children) return null;
    const child = current.children[idx];
    if (!child) return null;
    if (typeof child === 'string') return child;
    current = child;
  }
  return current;
}
