import React, { useState, useEffect, useCallback } from 'react';
import { useEditor } from './state';
import { useToast } from './components/Toast';

export interface ThemeTokens {
  colors: Record<string, string>;
  fonts: Record<string, { fontSize?: number; bold?: boolean; color?: string }>;
  spacing: Record<string, number>;
  buttons: Record<string, Record<string, any>>;
}

const DEFAULT_THEME: ThemeTokens = {
  colors: {
    primary: '#FF6B35',
    secondary: '#4DA6FF',
    success: '#44CC44',
    danger: '#FF4444',
    warning: '#FFB800',
    gold: '#FFD700',
    textPrimary: '#FFFFFF',
    textSecondary: '#AAAAAA',
    background: '#1A1A2E',
    surface: '#16213E',
    border: '#333355',
  },
  fonts: {
    title: { fontSize: 28, bold: true },
    subtitle: { fontSize: 22, bold: true },
    body: { fontSize: 16 },
    caption: { fontSize: 12, color: '#AAAAAA' },
    button: { fontSize: 18, bold: true },
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  buttons: {
    primary: { tint: '$primary', fontSize: 18, _transition: 1, _pressedColor: '#CC5522' },
    secondary: { tint: '$secondary', fontSize: 16, _transition: 1 },
    danger: { tint: '$danger', fontSize: 16, _transition: 1, _pressedColor: '#CC2222' },
    ghost: { tint: '#00000000', color: '$primary', fontSize: 16, _transition: 1 },
  },
};

export function ThemePanel() {
  const { state, dispatch } = useEditor();
  const { toast } = useToast();
  const [theme, setTheme] = useState<ThemeTokens>(DEFAULT_THEME);
  const [editingColor, setEditingColor] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/theme');
        if (res.ok) {
          const data = await res.json();
          if (data.theme) setTheme(data.theme);
        }
      } catch { /* use default */ }
    })();
  }, []);

  const saveTheme = useCallback(async (updated: ThemeTokens) => {
    setTheme(updated);
    try {
      await fetch('/api/theme', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: updated }),
      });
    } catch { /* safe */ }
  }, []);

  const updateColor = (key: string, value: string) => {
    const updated = { ...theme, colors: { ...theme.colors, [key]: value } };
    saveTheme(updated);
  };

  const addColor = () => {
    const name = prompt('Token name (e.g. "accent")');
    if (!name) return;
    updateColor(name, '#888888');
  };

  const applyButtonPreset = (presetName: string) => {
    if (!state.selectedPath || !state.document) return;
    const preset = theme.buttons[presetName];
    if (!preset) return;

    const resolved: Record<string, any> = {};
    for (const [k, v] of Object.entries(preset)) {
      if (typeof v === 'string' && v.startsWith('$')) {
        const tokenKey = v.slice(1);
        resolved[k] = theme.colors[tokenKey] || v;
      } else {
        resolved[k] = v;
      }
    }

    dispatch({ type: 'BATCH_START' });
    for (const [key, val] of Object.entries(resolved)) {
      dispatch({ type: 'UPDATE_NODE_PROP', path: state.selectedPath, key, value: val });
    }
    dispatch({ type: 'BATCH_END' });
    toast(`Applied "${presetName}" preset`, 'success');
  };

  return (
    <div className="panel theme-panel">
      <div className="panel-header">
        Design Tokens
        <button className="panel-action-btn" onClick={addColor} title="Add color token">+</button>
      </div>

      <div className="theme-section">
        <div style={{ fontWeight: 600, fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>COLORS</div>
        {Object.entries(theme.colors).map(([key, val]) => (
          <div key={key} className="theme-row">
            <input
              type="color"
              value={val.slice(0, 7)}
              onChange={(e) => updateColor(key, e.target.value)}
              className="theme-color-swatch"
              style={{ background: val }}
            />
            <span className="theme-key">{key}</span>
            <span className="theme-value">{val}</span>
          </div>
        ))}
      </div>

      <div className="theme-section">
        <div style={{ fontWeight: 600, fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>FONT PRESETS</div>
        {Object.entries(theme.fonts).map(([key, val]) => (
          <div key={key} className="theme-row">
            <span className="theme-key">{key}</span>
            <span className="theme-value">
              {val.fontSize}px{val.bold ? ' Bold' : ''}{val.color ? ` ${val.color}` : ''}
            </span>
          </div>
        ))}
      </div>

      <div className="theme-section">
        <div style={{ fontWeight: 600, fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>BUTTON PRESETS</div>
        {Object.entries(theme.buttons).map(([key, val]) => (
          <div key={key} className="theme-row">
            <div
              className="theme-color-swatch"
              style={{ background: resolveToken(val.tint, theme.colors) }}
            />
            <span className="theme-key" style={{ cursor: 'pointer' }} onClick={() => applyButtonPreset(key)}>
              {key}
            </span>
            <span className="theme-value" style={{ fontSize: 10 }}>click to apply</span>
          </div>
        ))}
      </div>

      <div className="theme-section">
        <div style={{ fontWeight: 600, fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>SPACING</div>
        {Object.entries(theme.spacing).map(([key, val]) => (
          <div key={key} className="theme-row">
            <span className="theme-key">{key}</span>
            <span className="theme-value">{val}px</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function resolveToken(value: any, colors: Record<string, string>): string {
  if (typeof value === 'string' && value.startsWith('$')) {
    return colors[value.slice(1)] || value;
  }
  return value || 'transparent';
}
