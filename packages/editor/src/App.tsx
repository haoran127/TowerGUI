import React, { useReducer, useEffect, useRef, useState, useCallback } from 'react';
import { editorReducer, initialState, EditorContext } from './state';
import { Toolbar } from './Toolbar';
import { ComponentPalette } from './ComponentPalette';
import { TreePanel } from './TreePanel';
import { EditorCanvas } from './EditorCanvas';
import { PropsPanel } from './PropsPanel';
import { JsonPanel } from './JsonPanel';
import { TemplatePanel } from './TemplatePanel';
import { AIPanel } from './AIPanel';
import { FilePanel } from './FilePanel';
import { ThemePanel } from './ThemePanel';
import { ToastProvider, useToast } from './components/Toast';
import { fetchDocument, connectEditorWS, saveDocument, broadcastPreviewSync, openDocument, getProject, notifyFocusDocument, setUserName } from './api';
import type { OnlineUser } from './api';

type LeftTab = 'hierarchy' | 'files' | 'templates' | 'theme';
type RightTab = 'properties' | 'json' | 'ai';

function AppContent() {
  const [state, dispatch] = useReducer(editorReducer, initialState);
  const { toast } = useToast();
  const [showPreview, setShowPreview] = useState(false);
  const [leftTab, setLeftTab] = useState<LeftTab>('hierarchy');
  const [rightTab, setRightTab] = useState<RightTab>('properties');
  const [projectDir, setProjectDir] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [filePanelKey, setFilePanelKey] = useState(0);
  const [openDocs, setOpenDocs] = useState<{ path: string; name: string }[]>([]);
  const [activeDocPath, setActiveDocPath] = useState<string | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [editLocks, setEditLocks] = useState<Record<string, any>>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    getProject().then(info => {
      if (info.open && info.dir) {
        setProjectDir(info.dir);
        setProjectName(info.config?.name || info.dir.split(/[/\\]/).pop() || null);
      }
    });
    fetchDocument().then(doc => {
      if (doc) dispatch({ type: 'LOAD_DOCUMENT', document: doc });
    });
  }, []);

  useEffect(() => {
    const ws = connectEditorWS((msg) => {
      if (msg.type === 'document-updated' && msg.source !== 'self') {
        fetchDocument().then(doc => {
          if (doc) dispatch({ type: 'LOAD_DOCUMENT', document: doc });
        });
      }
      if (msg.type === 'editor-reload') {
        location.reload();
      }
      if (msg.type === 'presence') {
        setOnlineUsers(msg.users || []);
      }
      if (msg.type === 'locks') {
        setEditLocks(msg.locks || {});
      }
    });
    return () => ws.close();
  }, []);

  useEffect(() => {
    if (!state.dirty || !state.document) return;

    broadcastPreviewSync(state.document);

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (state.document) {
        const ok = await saveDocument(state.document);
        if (ok) dispatch({ type: 'MARK_SAVED' });
      }
    }, 1200);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [state.document, state.dirty]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        dispatch({ type: 'UNDO' });
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        dispatch({ type: 'REDO' });
      }
      if (e.key === 'Delete' && state.selectedPath && state.selectedPath !== 'root') {
        dispatch({ type: 'DELETE_NODE', path: state.selectedPath });
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.selectedPath]);

  const togglePreview = useCallback(() => setShowPreview(p => !p), []);

  const handleProjectOpen = useCallback((dir: string, name?: string) => {
    setProjectDir(dir);
    setProjectName(name || dir.split(/[/\\]/).pop() || null);
    setLeftTab('files');
  }, []);

  const handleSyncComplete = useCallback(() => {
    setLeftTab('files');
    setFilePanelKey(k => k + 1);
  }, []);

  const handleDocumentOpen = useCallback(async (filePath: string) => {
    const doc = await openDocument(filePath);
    if (doc) {
      dispatch({ type: 'LOAD_DOCUMENT', document: doc });
      setActiveDocPath(filePath);
      notifyFocusDocument(filePath);
      const name = filePath.split(/[/\\]/).pop()?.replace('.tower.json', '') || 'Untitled';
      setOpenDocs(prev => {
        if (prev.some(d => d.path === filePath)) return prev;
        return [...prev, { path: filePath, name }];
      });
      setLeftTab('hierarchy');
      toast(`Opened: ${name}`, 'success');
    } else {
      toast('Failed to open document', 'error');
    }
  }, [dispatch, toast]);

  const handleTabClose = useCallback((tabPath: string) => {
    setOpenDocs(prev => prev.filter(d => d.path !== tabPath));
    if (activeDocPath === tabPath) {
      setOpenDocs(prev => {
        const remaining = prev.filter(d => d.path !== tabPath);
        if (remaining.length > 0) {
          handleDocumentOpen(remaining[remaining.length - 1].path);
        }
        return remaining;
      });
    }
  }, [activeDocPath, handleDocumentOpen]);

  return (
    <EditorContext.Provider value={{ state, dispatch }}>
      <div className="editor-root">
        <Toolbar onTogglePreview={togglePreview} previewActive={showPreview} onProjectOpen={handleProjectOpen} onSyncComplete={handleSyncComplete} projectName={projectName} />

        {onlineUsers.length > 1 && (
          <div className="presence-bar">
            <span className="presence-label">{onlineUsers.length} online</span>
            {onlineUsers.map(u => (
              <div key={u.userId} className="presence-avatar" title={`${u.userName}\n${u.documentPath ? 'Editing: ' + u.documentPath.split(/[/\\]/).pop() : 'Idle'}`} style={{ backgroundColor: u.color }}>
                {u.userName.charAt(0).toUpperCase()}
              </div>
            ))}
          </div>
        )}

        <ComponentPalette />

        {openDocs.length > 1 && (
          <div className="doc-tabs">
            {openDocs.map(d => (
              <div
                key={d.path}
                className={`doc-tab${d.path === activeDocPath ? ' doc-tab-active' : ''}`}
                onClick={() => handleDocumentOpen(d.path)}
              >
                <span className="doc-tab-name">{d.name}</span>
                <span className="doc-tab-close" onClick={(e) => { e.stopPropagation(); handleTabClose(d.path); }}>&times;</span>
              </div>
            ))}
          </div>
        )}

        <div className="editor-body">
          <div className="left-panel">
            <div className="left-panel-tabs">
              <button
                className={`left-tab-btn${leftTab === 'hierarchy' ? ' left-tab-active' : ''}`}
                onClick={() => setLeftTab('hierarchy')}
              >Hierarchy</button>
              <button
                className={`left-tab-btn${leftTab === 'files' ? ' left-tab-active' : ''}`}
                onClick={() => setLeftTab('files')}
              >Files</button>
              <button
                className={`left-tab-btn${leftTab === 'templates' ? ' left-tab-active' : ''}`}
                onClick={() => setLeftTab('templates')}
              >Templates</button>
              <button
                className={`left-tab-btn${leftTab === 'theme' ? ' left-tab-active' : ''}`}
                onClick={() => setLeftTab('theme')}
              >Theme</button>
            </div>
            {leftTab === 'hierarchy' ? <TreePanel /> : leftTab === 'files' ? <FilePanel key={filePanelKey} projectDir={projectDir} onDocumentOpen={handleDocumentOpen} /> : leftTab === 'theme' ? <ThemePanel /> : <TemplatePanel />}
          </div>
          <EditorCanvas />
          {showPreview && (
            <div className="preview-panel">
              <div className="panel-header">
                Live Preview
                <button className="preview-close-btn" onClick={togglePreview} title="Close preview">&times;</button>
              </div>
              <iframe
                ref={previewRef}
                className="preview-iframe"
                src="/preview-doc"
              />
            </div>
          )}
          <div className="right-panel">
            <div className="right-panel-tabs">
              <button
                className={`right-tab-btn${rightTab === 'properties' ? ' right-tab-active' : ''}`}
                onClick={() => setRightTab('properties')}
              >Properties</button>
              <button
                className={`right-tab-btn${rightTab === 'json' ? ' right-tab-active' : ''}`}
                onClick={() => setRightTab('json')}
              >JSON</button>
              <button
                className={`right-tab-btn${rightTab === 'ai' ? ' right-tab-active' : ''}`}
                onClick={() => setRightTab('ai')}
              >AI</button>
            </div>
            {rightTab === 'properties' ? <PropsPanel /> : rightTab === 'json' ? <JsonPanel /> : <AIPanel />}
          </div>
        </div>
      </div>
    </EditorContext.Provider>
  );
}

export function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}
