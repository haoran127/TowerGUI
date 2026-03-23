import React, { useEffect, useRef } from 'react';

export interface MenuItemDef {
  label: string;
  icon?: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  divider?: boolean;
  action?: () => void;
  children?: MenuItemDef[];
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItemDef[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('mousedown', handleClick);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handleClick);
      window.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (rect.right > vw) ref.current.style.left = `${x - rect.width}px`;
    if (rect.bottom > vh) ref.current.style.top = `${y - rect.height}px`;
  }, [x, y]);

  return (
    <div className="context-menu" ref={ref} style={{ left: x, top: y }}>
      {items.map((item, i) => {
        if (item.divider) return <div key={i} className="context-menu-divider" />;
        return (
          <div
            key={i}
            className={`context-menu-item${item.disabled ? ' disabled' : ''}${item.danger ? ' danger' : ''}`}
            onClick={() => {
              if (item.disabled) return;
              item.action?.();
              onClose();
            }}
          >
            <span className="context-menu-icon">{item.icon || ''}</span>
            <span className="context-menu-label">{item.label}</span>
            {item.shortcut && <span className="context-menu-shortcut">{item.shortcut}</span>}
          </div>
        );
      })}
    </div>
  );
}
