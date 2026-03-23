import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles.css';

try {
  const saved = localStorage.getItem('tower-editor-theme');
  if (saved === 'light' || saved === 'dark') {
    document.documentElement.setAttribute('data-theme', saved);
  }
} catch {}

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);
