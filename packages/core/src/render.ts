import type { ReactNode } from 'react';
import { createReconciler } from './reconciler';
import type { IEngineAdapter } from './IEngineAdapter';
import { LayoutManager } from './LayoutManager';
import { NodePool } from './NodePool';
import { tweenEngine } from './TweenEngine';

export interface RenderOptions {
  width?: number;
  height?: number;
  layout?: boolean;
  /** Enable node pooling for reduced GC pressure in scrolling/recycling scenarios */
  enablePool?: boolean;
  /** Max recycled nodes per element type (default 50) */
  poolMaxPerType?: number;
}

export interface TowerUIRoot {
  update(element: ReactNode): void;
  unmount(): void;
  tick(deltaMs: number): void;
  layout: LayoutManager | null;
}

const roots = new Map<IEngineAdapter, { container: any; reconciler: ReturnType<typeof createReconciler>; layout: LayoutManager | null }>();

export function render(element: ReactNode, adapter: IEngineAdapter, options?: RenderOptions): TowerUIRoot {
  let entry = roots.get(adapter);

  if (!entry) {
    const enableLayout = options?.layout !== false;
    let layout: LayoutManager | null = null;

    if (enableLayout) {
      layout = new LayoutManager(
        adapter,
        options?.width ?? 1920,
        options?.height ?? 1080,
      );
    }

    const pool = options?.enablePool !== false ? new NodePool(adapter, options?.poolMaxPerType ?? 50) : null;
    const reconciler = createReconciler(adapter, layout, pool);
    const container = reconciler.createContainer(
      adapter.getRootContainer(),
      0,     // tag: LegacyRoot
      null,  // hydrationCallbacks
      false, // isStrictMode
      false, // concurrentUpdatesByDefaultOverride
      '',    // identifierPrefix
      (err: Error) => {
        if (typeof console !== 'undefined') console.error('[TowerUI] recoverable:', err);
      },
      null,  // transitionCallbacks
    );
    entry = { container, reconciler, layout };
    roots.set(adapter, entry);
  }

  entry.reconciler.updateContainer(element, entry.container, null, undefined);

  let unmounted = false;

  return {
    update(newElement: ReactNode) {
      if (unmounted) return;
      const e = roots.get(adapter);
      if (e) e.reconciler.updateContainer(newElement, e.container, null, undefined);
    },
    unmount() {
      if (unmounted) return;
      unmounted = true;
      const e = roots.get(adapter);
      if (e) {
        try { e.reconciler.updateContainer(null, e.container, null, undefined); } catch { /* safe */ }
        try { e.layout?.dispose(); } catch { /* safe */ }
      }
      roots.delete(adapter);
      if (roots.size === 0) tweenEngine.dispose();
    },
    tick(deltaMs: number) {
      if (unmounted) return;
      tweenEngine.tick(deltaMs);
    },
    layout: entry.layout,
  };
}
