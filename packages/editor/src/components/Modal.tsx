import React, { useState, useEffect, useRef, useCallback } from 'react';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
}

export function Modal({ open, title, onClose, children, width = 400 }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay" ref={overlayRef} onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}>
      <div className="modal-dialog" style={{ width }}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  );
}

interface InputModalProps {
  open: boolean;
  title: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function InputModal({ open, title, label, defaultValue = '', placeholder, onConfirm, onCancel }: InputModalProps) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue(defaultValue);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, defaultValue]);

  const handleSubmit = useCallback(() => {
    if (value.trim()) onConfirm(value.trim());
  }, [value, onConfirm]);

  if (!open) return null;

  return (
    <Modal open={open} title={title} onClose={onCancel} width={360}>
      {label && <label className="modal-label">{label}</label>}
      <input
        ref={inputRef}
        className="modal-input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
      />
      <div className="modal-actions">
        <button className="modal-btn modal-btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="modal-btn modal-btn-primary" onClick={handleSubmit} disabled={!value.trim()}>OK</button>
      </div>
    </Modal>
  );
}

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({ open, title, message, confirmText = 'OK', cancelText = 'Cancel', danger, onConfirm, onCancel }: ConfirmModalProps) {
  if (!open) return null;

  return (
    <Modal open={open} title={title} onClose={onCancel} width={340}>
      <p className="modal-message">{message}</p>
      <div className="modal-actions">
        <button className="modal-btn modal-btn-secondary" onClick={onCancel}>{cancelText}</button>
        <button className={`modal-btn ${danger ? 'modal-btn-danger' : 'modal-btn-primary'}`} onClick={onConfirm}>{confirmText}</button>
      </div>
    </Modal>
  );
}

interface SelectModalProps {
  open: boolean;
  title: string;
  label?: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function SelectModal({ open, title, label, options, defaultValue, onConfirm, onCancel }: SelectModalProps) {
  const [value, setValue] = useState(defaultValue || options[0]?.value || '');

  useEffect(() => {
    if (open) setValue(defaultValue || options[0]?.value || '');
  }, [open, defaultValue, options]);

  if (!open) return null;

  return (
    <Modal open={open} title={title} onClose={onCancel} width={340}>
      {label && <label className="modal-label">{label}</label>}
      <select className="modal-select" value={value} onChange={(e) => setValue(e.target.value)}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <div className="modal-actions">
        <button className="modal-btn modal-btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="modal-btn modal-btn-primary" onClick={() => onConfirm(value)}>OK</button>
      </div>
    </Modal>
  );
}
