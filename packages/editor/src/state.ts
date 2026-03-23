import { useReducer, useCallback, createContext, useContext } from 'react';

export interface DataBindInfo {
  role: 'display' | 'event' | 'list';
  field?: string;
  protoType?: 'string' | 'int32' | 'float' | 'bool' | 'bytes' | 'int64' | 'double';
  event?: string;
  itemType?: string;
}

export interface UINode {
  type: string;
  ref?: string;
  props?: Record<string, any>;
  dataBind?: DataBindInfo;
  children?: (UINode | string)[];
}

export interface TowerDocument {
  $schema: 'tower-ui';
  version: '1.0';
  meta: { name: string; designWidth: number; designHeight: number; source?: string };
  assets?: { spritePrefix?: string; sprites?: Record<string, any> };
  components?: Record<string, UINode>;
  root: UINode;
}

export interface EditorState {
  document: TowerDocument | null;
  selectedPath: string | null;
  selectedPaths: string[];
  history: TowerDocument[];
  historyIndex: number;
  designWidth: number;
  designHeight: number;
  dirty: boolean;
  batchActive: boolean;
}

export type EditorAction =
  | { type: 'LOAD_DOCUMENT'; document: TowerDocument }
  | { type: 'UPDATE_DOCUMENT'; document: TowerDocument }
  | { type: 'SELECT_NODE'; path: string | null; multi?: boolean }
  | { type: 'UPDATE_NODE_PROP'; path: string; key: string; value: any }
  | { type: 'UPDATE_NODE_DATABIND'; path: string; dataBind: DataBindInfo | undefined }
  | { type: 'MOVE_NODE'; fromPath: string; toPath: string; index: number }
  | { type: 'DELETE_NODE'; path: string }
  | { type: 'ADD_NODE'; parentPath: string; node: UINode; index?: number }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'SET_RESOLUTION'; width: number; height: number }
  | { type: 'MARK_SAVED' }
  | { type: 'BATCH_START' }
  | { type: 'BATCH_END' };

function getNodeAtPath(root: UINode, pathStr: string): UINode | null {
  if (!pathStr || pathStr === 'root') return root;
  const parts = pathStr.replace(/^root\.?/, '').split('.').filter(Boolean);
  let current: UINode = root;
  for (const part of parts) {
    const idx = parseInt(part, 10);
    if (isNaN(idx) || !current.children) return null;
    const child = current.children[idx];
    if (!child || typeof child === 'string') return null;
    current = child;
  }
  return current;
}

function setNodeAtPath(root: UINode, pathStr: string, updater: (node: UINode) => UINode): UINode {
  if (!pathStr || pathStr === 'root') return updater(root);

  const parts = pathStr.replace(/^root\.?/, '').split('.').filter(Boolean);
  function recurse(node: UINode, depth: number): UINode {
    if (depth >= parts.length) return updater(node);
    const idx = parseInt(parts[depth], 10);
    if (isNaN(idx) || !node.children) return node;
    const newChildren = [...node.children];
    const child = newChildren[idx];
    if (!child || typeof child === 'string') return node;
    newChildren[idx] = recurse(child, depth + 1);
    return { ...node, children: newChildren };
  }
  return recurse(root, 0);
}

function deleteNodeAtPath(root: UINode, pathStr: string): UINode {
  const parts = pathStr.replace(/^root\.?/, '').split('.').filter(Boolean);
  if (parts.length === 0) return root;

  const parentParts = parts.slice(0, -1);
  const childIdx = parseInt(parts[parts.length - 1], 10);
  const parentPath = parentParts.length > 0 ? 'root.' + parentParts.join('.') : 'root';

  return setNodeAtPath(root, parentPath, (parent) => {
    if (!parent.children) return parent;
    const newChildren = [...parent.children];
    newChildren.splice(childIdx, 1);
    return { ...parent, children: newChildren };
  });
}

function addNodeAtPath(root: UINode, parentPath: string, node: UINode, index?: number): UINode {
  return setNodeAtPath(root, parentPath, (parent) => {
    const children = [...(parent.children || [])];
    if (index !== undefined && index >= 0 && index <= children.length) {
      children.splice(index, 0, node);
    } else {
      children.push(node);
    }
    return { ...parent, children };
  });
}

const MAX_HISTORY = 100;

function pushHistory(state: EditorState, doc: TowerDocument): EditorState {
  let history = state.history.slice(0, state.historyIndex + 1);
  history.push(JSON.parse(JSON.stringify(doc)));
  if (history.length > MAX_HISTORY) {
    history = history.slice(history.length - MAX_HISTORY);
  }
  return { ...state, history, historyIndex: history.length - 1 };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'LOAD_DOCUMENT': {
      const doc = action.document;
      return {
        ...state,
        document: doc,
        selectedPath: null,
        selectedPaths: [],
        history: [JSON.parse(JSON.stringify(doc))],
        historyIndex: 0,
        designWidth: doc.meta.designWidth,
        designHeight: doc.meta.designHeight,
        dirty: false,
      };
    }
    case 'UPDATE_DOCUMENT': {
      const newState = pushHistory(state, action.document);
      return { ...newState, document: action.document, dirty: true };
    }
    case 'SELECT_NODE': {
      if (action.multi && action.path) {
        const paths = state.selectedPaths.includes(action.path)
          ? state.selectedPaths.filter(p => p !== action.path)
          : [...state.selectedPaths, action.path];
        const primary = paths.length > 0 ? paths[paths.length - 1] : null;
        return { ...state, selectedPath: primary, selectedPaths: paths };
      }
      return { ...state, selectedPath: action.path, selectedPaths: action.path ? [action.path] : [] };
    }
    case 'UPDATE_NODE_PROP': {
      if (!state.document) return state;
      const newRoot = setNodeAtPath(state.document.root, action.path, (node) => ({
        ...node,
        props: { ...node.props, [action.key]: action.value },
      }));
      const newDoc = { ...state.document, root: newRoot };
      if (state.batchActive) {
        return { ...state, document: newDoc, dirty: true };
      }
      const newState = pushHistory(state, newDoc);
      return { ...newState, document: newDoc, dirty: true };
    }
    case 'UPDATE_NODE_DATABIND': {
      if (!state.document) return state;
      const newRoot = setNodeAtPath(state.document.root, action.path, (node) => {
        const updated = { ...node };
        if (action.dataBind) {
          updated.dataBind = action.dataBind;
        } else {
          delete updated.dataBind;
        }
        return updated;
      });
      const newDoc = { ...state.document, root: newRoot };
      const newState = pushHistory(state, newDoc);
      return { ...newState, document: newDoc, dirty: true };
    }
    case 'DELETE_NODE': {
      if (!state.document) return state;
      const newRoot = deleteNodeAtPath(state.document.root, action.path);
      const newDoc = { ...state.document, root: newRoot };
      const updated = pushHistory(state, newDoc);
      return { ...updated, document: newDoc, selectedPath: null, selectedPaths: [], dirty: true };
    }
    case 'ADD_NODE': {
      if (!state.document) return state;
      const newRoot = addNodeAtPath(state.document.root, action.parentPath, action.node, action.index);
      const newDoc = { ...state.document, root: newRoot };
      const updated = pushHistory(state, newDoc);
      return { ...updated, document: newDoc, dirty: true };
    }
    case 'MOVE_NODE': {
      if (!state.document) return state;
      const movedNode = getNodeAtPath(state.document.root, action.fromPath);
      if (!movedNode) return state;
      let newRoot = deleteNodeAtPath(state.document.root, action.fromPath);
      newRoot = addNodeAtPath(newRoot, action.toPath, movedNode, action.index);
      const newDoc = { ...state.document, root: newRoot };
      const updated = pushHistory(state, newDoc);
      return { ...updated, document: newDoc, dirty: true };
    }
    case 'UNDO': {
      if (state.historyIndex <= 0) return state;
      const newIdx = state.historyIndex - 1;
      const doc = JSON.parse(JSON.stringify(state.history[newIdx]));
      return { ...state, document: doc, historyIndex: newIdx, dirty: true };
    }
    case 'REDO': {
      if (state.historyIndex >= state.history.length - 1) return state;
      const newIdx = state.historyIndex + 1;
      const doc = JSON.parse(JSON.stringify(state.history[newIdx]));
      return { ...state, document: doc, historyIndex: newIdx, dirty: true };
    }
    case 'SET_RESOLUTION': {
      if (!state.document) return { ...state, designWidth: action.width, designHeight: action.height };
      const newRoot = {
        ...state.document.root,
        props: { ...state.document.root.props, width: action.width, height: action.height },
      };
      const newDoc = {
        ...state.document,
        root: newRoot,
        meta: { ...state.document.meta, designWidth: action.width, designHeight: action.height },
      };
      const updated = pushHistory(state, newDoc);
      return { ...updated, document: newDoc, designWidth: action.width, designHeight: action.height, dirty: true };
    }
    case 'MARK_SAVED':
      return { ...state, dirty: false };
    case 'BATCH_START':
      return { ...state, batchActive: true };
    case 'BATCH_END': {
      if (!state.document) return { ...state, batchActive: false };
      const updated = pushHistory(state, state.document);
      return { ...updated, batchActive: false };
    }
    default:
      return state;
  }
}

export const initialState: EditorState = {
  document: null,
  selectedPath: null,
  selectedPaths: [],
  history: [],
  historyIndex: -1,
  designWidth: 1080,
  designHeight: 1920,
  dirty: false,
  batchActive: false,
};

export function getNodeAtPathPublic(root: UINode, path: string): UINode | null {
  return getNodeAtPath(root, path);
}

export interface EditorContextValue {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
}

export const EditorContext = createContext<EditorContextValue>({
  state: initialState,
  dispatch: () => {},
});

export function useEditor() {
  return useContext(EditorContext);
}
