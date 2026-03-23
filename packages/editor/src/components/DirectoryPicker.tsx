import React, { useState, useEffect, useCallback } from 'react';
import { browseDirectory, type BrowseResult } from '../api';

interface DirectoryPickerProps {
  open: boolean;
  title?: string;
  fileFilter?: string;
  onSelect: (path: string) => void;
  onCancel: () => void;
}

export function DirectoryPicker({ open, title, fileFilter, onSelect, onCancel }: DirectoryPickerProps) {
  const [browse, setBrowse] = useState<BrowseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const loadDir = useCallback(async (dirPath?: string) => {
    setLoading(true);
    setError('');
    setSelected(null);
    const result = await browseDirectory(dirPath);
    setLoading(false);
    if (result) {
      setBrowse(result);
    } else {
      setError('Failed to load directory');
    }
  }, []);

  useEffect(() => {
    if (open) loadDir();
  }, [open, loadDir]);

  if (!open) return null;

  const handleDirClick = (name: string) => {
    if (!browse) return;
    setSelected(browse.current + browse.sep + name);
  };

  const handleDirDblClick = (name: string) => {
    if (!browse) return;
    loadDir(browse.current + browse.sep + name);
  };

  const handleFileClick = (name: string) => {
    if (!browse) return;
    setSelected(browse.current + browse.sep + name);
  };

  const handleParent = () => {
    if (browse?.parent) loadDir(browse.parent);
  };

  const handleConfirm = () => {
    const target = selected || browse?.current;
    if (target) onSelect(target);
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-dialog dir-picker-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{title || 'Select Directory'}</span>
          <button className="modal-close" onClick={onCancel}>&times;</button>
        </div>
        <div className="modal-body">
          {browse && (
            <div className="dir-picker-path">
              <span className="dir-picker-current" title={browse.current}>{browse.current}</span>
            </div>
          )}

          <div className="dir-picker-list">
            {loading && <div className="dir-picker-loading">Loading...</div>}
            {error && <div className="dir-picker-error">{error}</div>}
            {!loading && browse && (
              <>
                {browse.parent && (
                  <div className="dir-picker-item dir-picker-parent" onClick={handleParent}>
                    <span className="dir-picker-icon">⬆</span>
                    <span>..</span>
                  </div>
                )}
                {browse.dirs.map(d => (
                  <div
                    key={d}
                    className={`dir-picker-item dir-picker-dir${selected === browse.current + browse.sep + d ? ' selected' : ''}`}
                    onClick={() => handleDirClick(d)}
                    onDoubleClick={() => handleDirDblClick(d)}
                  >
                    <span className="dir-picker-icon">📁</span>
                    <span>{d}</span>
                  </div>
                ))}
                {fileFilter && browse.files
                  .filter(f => f.endsWith(fileFilter))
                  .map(f => (
                    <div
                      key={f}
                      className={`dir-picker-item dir-picker-file${selected === browse.current + browse.sep + f ? ' selected' : ''}`}
                      onClick={() => handleFileClick(f)}
                      onDoubleClick={() => {
                        onSelect(browse.current + browse.sep + f);
                      }}
                    >
                      <span className="dir-picker-icon">📄</span>
                      <span>{f}</span>
                    </div>
                  ))
                }
                {browse.dirs.length === 0 && browse.files.length === 0 && (
                  <div className="dir-picker-empty">Empty directory</div>
                )}
                {!fileFilter && browse.files.length > 0 && (
                  <div className="dir-picker-files-label">{browse.files.length} file(s)</div>
                )}
              </>
            )}
          </div>

          <div className="dir-picker-selected">
            {selected
              ? <>Selected: <strong>{selected}</strong></>
              : <span style={{ opacity: 0.4 }}>{fileFilter ? `Click a ${fileFilter} file to select, click folder to enter` : 'Click a folder to select, double-click to enter'}</span>
            }
          </div>

          <div className="modal-actions">
            <button className="modal-btn modal-btn-secondary" onClick={onCancel}>Cancel</button>
            {!fileFilter && (
              <button className="modal-btn modal-btn-primary" onClick={() => {
                if (browse) onSelect(browse.current);
              }}>
                Use Current
              </button>
            )}
            <button className="modal-btn modal-btn-primary" onClick={handleConfirm} disabled={!selected || (!!fileFilter && !selected.endsWith(fileFilter))}>
              Select
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
