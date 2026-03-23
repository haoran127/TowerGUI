import React, { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react';

export interface ScreenConfig {
  id: string;
  type: 'screen' | 'popup' | 'overlay';
  data?: any;
  modal?: boolean;
  onShow?: (data?: any) => void;
  onHide?: () => void;
  onDestroy?: () => void;
  /** If true, previous screen is destroyed instead of hidden */
  replacePrevious?: boolean;
}

export interface ScreenEntry {
  id: string;
  config: ScreenConfig;
  visible: boolean;
  data?: any;
  timestamp: number;
}

export interface PopupQueueItem {
  config: ScreenConfig;
  priority: number;
}

export interface ScreenManagerAPI {
  /** Currently visible screens (sorted by layer) */
  screens: ScreenEntry[];
  /** Navigation stack (screens only, not popups) */
  stack: ScreenEntry[];

  /** Navigate to a new screen (pushes onto stack) */
  push(config: ScreenConfig): void;
  /** Go back to previous screen */
  pop(): ScreenEntry | null;
  /** Replace current screen */
  replace(config: ScreenConfig): void;
  /** Go back to a specific screen in the stack */
  popTo(id: string): void;
  /** Clear entire stack and go to a screen */
  resetTo(config: ScreenConfig): void;

  /** Show a popup (goes through priority queue if modal is showing) */
  showPopup(config: ScreenConfig, priority?: number): void;
  /** Close a popup */
  closePopup(id: string): void;
  /** Close all popups */
  closeAllPopups(): void;

  /** Show an overlay (doesn't affect stack) */
  showOverlay(config: ScreenConfig): void;
  closeOverlay(id: string): void;

  /** Check if screen is currently visible */
  isVisible(id: string): boolean;
  /** Get the current top screen */
  currentScreen(): ScreenEntry | null;
  /** Get back stack depth */
  stackDepth: number;
  /** Can go back */
  canGoBack: boolean;
}

const ScreenManagerCtx = createContext<ScreenManagerAPI | null>(null);

export function useScreenManager(): ScreenManagerAPI {
  const ctx = useContext(ScreenManagerCtx);
  if (!ctx) throw new Error('useScreenManager must be used within ScreenManagerProvider');
  return ctx;
}

export function ScreenManagerProvider({ children }: { children: React.ReactNode }) {
  const [screenStack, setScreenStack] = useState<ScreenEntry[]>([]);
  const [popups, setPopups] = useState<ScreenEntry[]>([]);
  const [overlays, setOverlays] = useState<ScreenEntry[]>([]);
  const popupQueue = useRef<PopupQueueItem[]>([]);

  const makeEntry = (config: ScreenConfig): ScreenEntry => ({
    id: config.id,
    config,
    visible: true,
    data: config.data,
    timestamp: Date.now(),
  });

  const processPopupQueue = useCallback(() => {
    if (popupQueue.current.length === 0) return;
    popupQueue.current.sort((a, b) => b.priority - a.priority);
    const next = popupQueue.current.shift()!;
    const entry = makeEntry(next.config);
    entry.config.onShow?.(entry.data);
    setPopups(prev => [...prev, entry]);
  }, []);

  const push = useCallback((config: ScreenConfig) => {
    const entry = makeEntry({ ...config, type: 'screen' });
    setScreenStack(prev => {
      const newStack = [...prev];
      if (newStack.length > 0) {
        const top = newStack[newStack.length - 1];
        top.visible = false;
        top.config.onHide?.();
      }
      if (config.replacePrevious && newStack.length > 0) {
        const removed = newStack.pop()!;
        removed.config.onDestroy?.();
      }
      entry.config.onShow?.(entry.data);
      newStack.push(entry);
      return newStack;
    });
  }, []);

  const pop = useCallback((): ScreenEntry | null => {
    let popped: ScreenEntry | null = null;
    setScreenStack(prev => {
      if (prev.length <= 1) return prev;
      const newStack = [...prev];
      popped = newStack.pop()!;
      popped.config.onHide?.();
      popped.config.onDestroy?.();
      if (newStack.length > 0) {
        const top = newStack[newStack.length - 1];
        top.visible = true;
        top.config.onShow?.(top.data);
      }
      return newStack;
    });
    return popped;
  }, []);

  const replace = useCallback((config: ScreenConfig) => {
    const entry = makeEntry({ ...config, type: 'screen' });
    setScreenStack(prev => {
      const newStack = [...prev];
      if (newStack.length > 0) {
        const removed = newStack.pop()!;
        removed.config.onHide?.();
        removed.config.onDestroy?.();
      }
      entry.config.onShow?.(entry.data);
      newStack.push(entry);
      return newStack;
    });
  }, []);

  const popTo = useCallback((id: string) => {
    setScreenStack(prev => {
      const idx = prev.findIndex(s => s.id === id);
      if (idx < 0) return prev;
      const newStack = prev.slice(0, idx + 1);
      for (let i = prev.length - 1; i > idx; i--) {
        prev[i].config.onHide?.();
        prev[i].config.onDestroy?.();
      }
      const top = newStack[newStack.length - 1];
      top.visible = true;
      top.config.onShow?.(top.data);
      return newStack;
    });
  }, []);

  const resetTo = useCallback((config: ScreenConfig) => {
    setScreenStack(prev => {
      for (const s of prev) {
        s.config.onHide?.();
        s.config.onDestroy?.();
      }
      const entry = makeEntry({ ...config, type: 'screen' });
      entry.config.onShow?.(entry.data);
      return [entry];
    });
  }, []);

  const showPopup = useCallback((config: ScreenConfig, priority: number = 0) => {
    setPopups(prev => {
      const hasModal = prev.some(p => p.config.modal && p.visible);
      if (hasModal && !config.modal) {
        popupQueue.current.push({ config: { ...config, type: 'popup' }, priority });
        return prev;
      }
      const entry = makeEntry({ ...config, type: 'popup' });
      entry.config.onShow?.(entry.data);
      return [...prev, entry];
    });
  }, []);

  const closePopup = useCallback((id: string) => {
    setPopups(prev => {
      const popup = prev.find(p => p.id === id);
      if (popup) {
        popup.config.onHide?.();
        popup.config.onDestroy?.();
      }
      const next = prev.filter(p => p.id !== id);
      setTimeout(processPopupQueue, 0);
      return next;
    });
  }, [processPopupQueue]);

  const closeAllPopups = useCallback(() => {
    setPopups(prev => {
      for (const p of prev) {
        p.config.onHide?.();
        p.config.onDestroy?.();
      }
      return [];
    });
    popupQueue.current = [];
  }, []);

  const showOverlay = useCallback((config: ScreenConfig) => {
    const entry = makeEntry({ ...config, type: 'overlay' });
    entry.config.onShow?.(entry.data);
    setOverlays(prev => [...prev.filter(o => o.id !== config.id), entry]);
  }, []);

  const closeOverlay = useCallback((id: string) => {
    setOverlays(prev => {
      const overlay = prev.find(o => o.id === id);
      if (overlay) {
        overlay.config.onHide?.();
        overlay.config.onDestroy?.();
      }
      return prev.filter(o => o.id !== id);
    });
  }, []);

  const isVisible = useCallback((id: string): boolean => {
    return screenStack.some(s => s.id === id && s.visible) ||
      popups.some(p => p.id === id) ||
      overlays.some(o => o.id === id);
  }, [screenStack, popups, overlays]);

  const currentScreen = useCallback((): ScreenEntry | null => {
    if (screenStack.length === 0) return null;
    return screenStack[screenStack.length - 1];
  }, [screenStack]);

  const screens = useMemo(() => [
    ...screenStack.filter(s => s.visible),
    ...popups,
    ...overlays,
  ], [screenStack, popups, overlays]);

  const api: ScreenManagerAPI = useMemo(() => ({
    screens,
    stack: screenStack,
    push, pop, replace, popTo, resetTo,
    showPopup, closePopup, closeAllPopups,
    showOverlay, closeOverlay,
    isVisible, currentScreen,
    stackDepth: screenStack.length,
    canGoBack: screenStack.length > 1,
  }), [screens, screenStack, push, pop, replace, popTo, resetTo,
    showPopup, closePopup, closeAllPopups, showOverlay, closeOverlay,
    isVisible, currentScreen]);

  return React.createElement(ScreenManagerCtx.Provider, { value: api }, children);
}
