import React, { useMemo } from 'react';
import { useEditor } from './state';

export function JsonPanel() {
  const { state } = useEditor();
  const doc = state.document;

  const jsonText = useMemo(() => {
    if (!doc) return '';
    return JSON.stringify(doc, null, 2);
  }, [doc]);

  if (!doc) {
    return (
      <div className="json-panel json-panel-empty">
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>No document loaded</span>
      </div>
    );
  }

  return (
    <div className="json-panel">
      <div className="json-panel-toolbar">
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {doc.meta?.name || 'Untitled'} &middot; {(jsonText.length / 1024).toFixed(1)} KB
        </span>
        <button
          className="json-panel-copy-btn"
          title="Copy JSON"
          onClick={() => {
            navigator.clipboard.writeText(jsonText);
          }}
        >Copy</button>
      </div>
      <pre className="json-panel-content">{jsonText}</pre>
    </div>
  );
}
