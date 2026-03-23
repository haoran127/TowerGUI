import Reconciler from 'react-reconciler';
import { DefaultEventPriority } from 'react-reconciler/constants';
import type { IEngineAdapter } from './IEngineAdapter';
import type { EngineNode } from './types';
import type { LayoutManager } from './LayoutManager';
import type { NodePool } from './NodePool';

type Props = Record<string, any>;

const LAYOUT_PROPS = new Set([
  'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
  'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'flexDirection', 'flexWrap',
  'justifyContent', 'alignItems', 'alignSelf', 'alignContent',
  'padding', 'margin', 'gap', 'rowGap', 'columnGap',
  'position', 'top', 'left', 'right', 'bottom',
  'overflow', 'aspectRatio',
]);

function computeDiff(oldProps: Props, newProps: Props): string[] | null {
  const changed: string[] = [];
  const op = oldProps ?? {};
  const np = newProps ?? {};
  const allKeys = new Set([...Object.keys(op), ...Object.keys(np)]);

  for (const key of allKeys) {
    if (key === 'children') continue;
    if (op[key] !== np[key]) {
      changed.push(key);
    }
  }

  return changed.length > 0 ? changed : null;
}

function extractLayoutProps(props: Props): Props | null {
  if (!props) return null;
  let result: Props | null = null;
  for (const key of Object.keys(props)) {
    if (LAYOUT_PROPS.has(key)) {
      if (!result) result = {};
      result[key] = props[key];
    }
  }
  return result;
}

export function createReconciler(adapter: IEngineAdapter, layoutManager: LayoutManager | null, nodePool?: NodePool | null) {
  return Reconciler({
    supportsMutation: true,
    supportsPersistence: false,
    supportsHydration: false,
    isPrimaryRenderer: true,

    createInstance(type: string, props: Props) {
      const node = nodePool ? nodePool.acquire(type) : adapter.createElement(type);
      if (nodePool) (node as any).__towerType = type;
      layoutManager?.createNode(node);

      const layoutProps = extractLayoutProps(props);
      if (layoutProps) {
        layoutManager?.applyStyle(node, layoutProps);
      }

      adapter.applyProps(node, {}, props);
      return node;
    },

    createTextInstance(text: string) {
      const node = adapter.createText(text);
      layoutManager?.createNode(node);
      return node;
    },

    appendInitialChild(parent: EngineNode, child: EngineNode) {
      adapter.appendChild(parent, child);
      layoutManager?.appendChild(parent, child);
    },

    appendChild(parent: EngineNode, child: EngineNode) {
      adapter.appendChild(parent, child);
      layoutManager?.appendChild(parent, child);
    },

    appendChildToContainer(container: EngineNode, child: EngineNode) {
      adapter.appendChild(container, child);
      layoutManager?.appendChild(container, child);
    },

    insertBefore(parent: EngineNode, child: EngineNode, before: EngineNode) {
      adapter.insertBefore(parent, child, before);
      layoutManager?.insertBefore(parent, child, before);
    },

    insertInContainerBefore(container: EngineNode, child: EngineNode, before: EngineNode) {
      adapter.insertBefore(container, child, before);
      layoutManager?.insertBefore(container, child, before);
    },

    removeChild(parent: EngineNode, child: EngineNode) {
      layoutManager?.removeNode(child);
      if (nodePool && (child as any).__towerType) {
        adapter.removeChild(parent, child);
        nodePool.recycle((child as any).__towerType, child);
      } else {
        adapter.removeChild(parent, child);
      }
    },

    removeChildFromContainer(container: EngineNode, child: EngineNode) {
      layoutManager?.removeNode(child);
      if (nodePool && (child as any).__towerType) {
        adapter.removeChild(container, child);
        nodePool.recycle((child as any).__towerType, child);
      } else {
        adapter.removeChild(container, child);
      }
    },

    clearContainer(container: EngineNode) {
      adapter.clearChildren(container);
    },

    prepareUpdate(_instance: EngineNode, _type: string, oldProps: Props, newProps: Props) {
      return computeDiff(oldProps, newProps);
    },

    commitUpdate(instance: EngineNode, updatePayload: string[], _type: string, oldProps: Props, newProps: Props) {
      if (updatePayload && updatePayload.length > 0) {
        const layoutChanged = updatePayload.some(k => LAYOUT_PROPS.has(k));
        if (layoutChanged) {
          const layoutProps = extractLayoutProps(newProps);
          if (layoutProps) layoutManager?.applyStyle(instance, layoutProps);
        }
        adapter.applyProps(instance, oldProps, newProps, updatePayload);
      }
    },

    commitTextUpdate(instance: EngineNode, _oldText: string, newText: string) {
      adapter.updateText(instance, newText);
    },

    finalizeInitialChildren() {
      return false;
    },

    getChildHostContext(parentContext: any) {
      return parentContext;
    },

    getRootHostContext() {
      return {};
    },

    getPublicInstance(instance: EngineNode) {
      return instance;
    },

    prepareForCommit() {
      return null;
    },

    resetAfterCommit() {
      layoutManager?.computeAndApply();
    },

    preparePortalMount() {},

    shouldSetTextContent() {
      return false;
    },

    getCurrentEventPriority() {
      return DefaultEventPriority;
    },

    getInstanceFromNode() {
      return null;
    },

    prepareScopeUpdate() {},
    getInstanceFromScope() { return null; },
    beforeActiveInstanceBlur() {},
    afterActiveInstanceBlur() {},
    detachDeletedInstance() {},

    scheduleTimeout: setTimeout,
    cancelTimeout: clearTimeout,
    noTimeout: -1,
    supportsMicrotasks: false,
  } as any);
}
