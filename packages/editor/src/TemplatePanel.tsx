import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useEditor, getNodeAtPathPublic } from './state';
import { listTemplates, saveTemplate, deleteTemplate, type TemplateEntry } from './api';
import { useToast } from './components/Toast';

const CATEGORIES = ['All', 'Buttons', 'Dialogs', 'Lists', 'Cards', 'HUD', 'Navigation', 'Forms', 'Effects', 'Other'];

export function TemplatePanel() {
  const { state, dispatch } = useEditor();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<TemplateEntry[]>([]);
  const [saveName, setSaveName] = useState('');
  const [saveCategory, setSaveCategory] = useState('Other');
  const [saveTags, setSaveTags] = useState('');
  const [showSave, setShowSave] = useState(false);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');

  const refresh = useCallback(async () => {
    const list = await listTemplates();
    setTemplates(list);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const filtered = useMemo(() => {
    let result = templates;
    if (activeCategory !== 'All') {
      result = result.filter(t => (t.category || 'Other') === activeCategory);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.node.type?.toLowerCase().includes(q) ||
        t.tags?.some(tag => tag.toLowerCase().includes(q))
      );
    }
    return result;
  }, [templates, activeCategory, search]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: templates.length };
    for (const t of templates) {
      const cat = t.category || 'Other';
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [templates]);

  const handleSave = useCallback(async () => {
    if (!state.selectedPath || !state.document) return;
    const node = getNodeAtPathPublic(state.document.root, state.selectedPath);
    if (!node) return;

    const name = saveName.trim() || node.props?.name || node.type;
    const tags = saveTags.split(',').map(t => t.trim()).filter(Boolean);
    const ok = await saveTemplate(name, node, saveCategory, tags);
    if (ok) {
      toast(`Component "${name}" saved to ${saveCategory}`, 'success');
      setSaveName('');
      setSaveTags('');
      setShowSave(false);
      refresh();
    } else {
      toast('Failed to save component', 'error');
    }
  }, [state.selectedPath, state.document, saveName, saveCategory, saveTags, toast, refresh]);

  const handleInsert = useCallback((tpl: TemplateEntry) => {
    const parentPath = state.selectedPath || 'root';
    const clone = JSON.parse(JSON.stringify(tpl.node));
    dispatch({ type: 'ADD_NODE', parentPath, node: clone });
    toast(`Inserted "${tpl.name}"`, 'success');
  }, [state.selectedPath, dispatch, toast]);

  const handleDelete = useCallback(async (name: string) => {
    if (!confirm(`Delete component "${name}"?`)) return;
    await deleteTemplate(name);
    refresh();
  }, [refresh]);

  return (
    <div className="panel template-panel">
      <div className="panel-header">
        Component Library
        <button
          className="panel-action-btn"
          onClick={() => setShowSave(!showSave)}
          title="Save selection as component"
          disabled={!state.selectedPath}
        >+</button>
      </div>

      <div style={{ padding: '4px 8px' }}>
        <input
          className="prop-input"
          placeholder="Search components..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: '100%', marginBottom: 4 }}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              className={`align-btn${activeCategory === cat ? ' active' : ''}`}
              onClick={() => setActiveCategory(cat)}
              style={{
                fontSize: 10,
                padding: '1px 6px',
                background: activeCategory === cat ? 'var(--accent)' : 'transparent',
                color: activeCategory === cat ? '#fff' : 'var(--text-muted)',
                border: '1px solid var(--border)',
                borderRadius: 3,
                cursor: 'pointer',
              }}
            >
              {cat} {categoryCounts[cat] ? `(${categoryCounts[cat]})` : ''}
            </button>
          ))}
        </div>
      </div>

      {showSave && state.selectedPath && (
        <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <input
            className="prop-input"
            placeholder="Component name..."
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />
          <div style={{ display: 'flex', gap: 4 }}>
            <select
              className="prop-input"
              value={saveCategory}
              onChange={(e) => setSaveCategory(e.target.value)}
              style={{ flex: 1 }}
            >
              {CATEGORIES.filter(c => c !== 'All').map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <button className="align-btn" onClick={handleSave} style={{ padding: '2px 12px' }}>Save</button>
          </div>
          <input
            className="prop-input"
            placeholder="Tags (comma separated)..."
            value={saveTags}
            onChange={(e) => setSaveTags(e.target.value)}
          />
        </div>
      )}

      <div className="template-list">
        {filtered.length === 0 && (
          <div className="panel-empty" style={{ fontSize: 12 }}>
            {templates.length === 0
              ? 'No components yet. Select a node and click + to save.'
              : 'No components match your filter.'}
          </div>
        )}
        {filtered.map((tpl) => (
          <div key={tpl.name} className="template-item">
            <span
              className="template-name"
              title={`${tpl.node.type}${tpl.tags?.length ? ` — tags: ${tpl.tags.join(', ')}` : ''}\nClick to insert`}
              onClick={() => handleInsert(tpl)}
            >
              {tpl.name}
            </span>
            <span className="template-type">
              {tpl.category && tpl.category !== 'Other' ? tpl.category : tpl.node.type}
            </span>
            {tpl.version && <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>v{tpl.version}</span>}
            <button className="template-delete" onClick={() => handleDelete(tpl.name)} title="Delete">&times;</button>
          </div>
        ))}
      </div>
    </div>
  );
}
