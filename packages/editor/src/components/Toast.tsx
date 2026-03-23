import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';

export type ToastLevel = 'info' | 'success' | 'warning' | 'error';

interface ToastItem {
  id: number;
  message: string;
  level: ToastLevel;
}

interface ToastContextValue {
  toast: (message: string, level?: ToastLevel) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, level: ToastLevel = 'info') => {
    const id = nextId++;
    setToasts(prev => [...prev, { id, message, level }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast-item toast-${t.level}`}>
            <span className="toast-icon">{getIcon(t.level)}</span>
            <span className="toast-message">{t.message}</span>
            <button className="toast-close" onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}>×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function getIcon(level: ToastLevel): string {
  switch (level) {
    case 'success': return '\u2713';
    case 'warning': return '\u26A0';
    case 'error': return '\u2717';
    default: return '\u2139';
  }
}
