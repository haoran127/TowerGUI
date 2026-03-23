import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useEditor } from './state';
import { aiModifyDocument } from './api';
import { useToast } from './components/Toast';

interface ChatMessage {
  role: 'user' | 'assistant' | 'error';
  content: string;
  timestamp: number;
}

export function AIPanel() {
  const { state, dispatch } = useEditor();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = useCallback(async () => {
    const prompt = input.trim();
    if (!prompt || loading) return;
    if (!state.document) {
      toast('Please open a document first', 'error');
      return;
    }

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: prompt, timestamp: Date.now() }]);
    setLoading(true);

    try {
      const result = await aiModifyDocument(prompt, state.document);
      if (result.ok && result.document) {
        dispatch({ type: 'LOAD_DOCUMENT', document: result.document });
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Done. Document updated based on: "${prompt}"`,
          timestamp: Date.now(),
        }]);
        toast('AI modified the document', 'success');
      } else {
        setMessages(prev => [...prev, {
          role: 'error',
          content: result.error || 'Unknown error',
          timestamp: Date.now(),
        }]);
      }
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'error', content: e.message, timestamp: Date.now() }]);
    }

    setLoading(false);
  }, [input, loading, state.document, dispatch, toast]);

  return (
    <div className="panel ai-panel">
      <div className="panel-header">AI Assistant</div>
      <div className="ai-messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="ai-empty">
            Describe what you want to change in the UI. For example:
            <br /><br />
            <em>"Add a back button in the top-left corner"</em>
            <br />
            <em>"Change the title text to red"</em>
            <br />
            <em>"Add a 3x3 grid of item slots"</em>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`ai-msg ai-msg-${msg.role}`}>
            <span className="ai-msg-role">{msg.role === 'user' ? 'You' : msg.role === 'assistant' ? 'AI' : 'Error'}</span>
            <span className="ai-msg-text">{msg.content}</span>
          </div>
        ))}
        {loading && <div className="ai-msg ai-msg-loading"><span className="ai-spinner" />Thinking...</div>}
      </div>
      <div className="ai-input-row">
        <input
          className="prop-input ai-input"
          placeholder={state.document ? "Describe your change..." : "Open a document first"}
          value={input}
          disabled={!state.document || loading}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        />
        <button className="align-btn ai-send-btn" onClick={handleSend} disabled={!input.trim() || loading || !state.document}>
          {loading ? '...' : 'Send'}
        </button>
      </div>
    </div>
  );
}
