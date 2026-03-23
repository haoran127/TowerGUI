import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useEditor } from './state';

interface SpriteEntry {
  name: string;
  path: string;
  guid?: string;
}

export function SpriteBrowser({ onSelect, onClose }: {
  onSelect: (sprite: SpriteEntry) => void;
  onClose: () => void;
}) {
  const [sprites, setSprites] = useState<SpriteEntry[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/sprites');
        if (res.ok) {
          const data = await res.json();
          setSprites(data.sprites || []);
        }
      } catch { /* api may not exist yet */ }
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!search) return sprites;
    const q = search.toLowerCase();
    return sprites.filter(s =>
      s.name.toLowerCase().includes(q) || s.path.toLowerCase().includes(q)
    );
  }, [sprites, search]);

  return (
    <div className="sprite-browser-overlay" onClick={onClose}>
      <div className="sprite-browser" onClick={(e) => e.stopPropagation()}>
        <div className="sprite-browser-header">
          <span>Select Sprite</span>
          <input
            className="prop-input"
            placeholder="Search sprites..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            style={{ flex: 1, marginLeft: 8 }}
          />
          <button className="align-btn" onClick={onClose} style={{ marginLeft: 4 }}>&times;</button>
        </div>
        <div className="sprite-browser-grid">
          {loading && <div className="panel-empty">Loading sprites...</div>}
          {!loading && filtered.length === 0 && (
            <div className="panel-empty">
              {sprites.length === 0
                ? 'No sprites found. Run: node tools/build-sprite-map.mjs'
                : 'No sprites match your search.'}
            </div>
          )}
          {filtered.map((s) => (
            <div
              key={s.path}
              className="sprite-browser-item"
              title={s.path}
              onClick={() => { onSelect(s); onClose(); }}
            >
              <div className="sprite-thumb">
                <img
                  src={`/sprites/${s.path}`}
                  alt={s.name}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </div>
              <div className="sprite-label">{s.name}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SpritePickerField({ value, propName, onChange }: {
  value: string;
  propName: string;
  onChange: (v: string) => void;
}) {
  const [showBrowser, setShowBrowser] = useState(false);

  return (
    <>
      <div className="prop-row">
        <label className="prop-label">{propName}</label>
        <div style={{ display: 'flex', gap: 4, flex: 1 }}>
          <input
            className="prop-input"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder="sprite path..."
            style={{ flex: 1 }}
          />
          <button
            className="align-btn"
            onClick={() => setShowBrowser(true)}
            title="Browse sprites"
            style={{ padding: '2px 6px', fontSize: 14 }}
          >
            ...
          </button>
        </div>
      </div>
      {showBrowser && (
        <SpriteBrowser
          onSelect={(s) => onChange(s.path)}
          onClose={() => setShowBrowser(false)}
        />
      )}
    </>
  );
}
