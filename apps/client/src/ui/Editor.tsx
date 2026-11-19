import { useEffect, useRef, useState } from 'react';

/** Replacement for nano/vim inside the Linux simulator. Ctrl+S / Ctrl+O saves, Esc / Ctrl+X closes. */
export function Editor({ path, initial, readOnly, onSave, onClose }: { path: string; initial: string; readOnly: boolean; onSave: (text: string) => string | undefined; onClose: () => void }) {
  const [text, setText] = useState(initial);
  const [msg, setMsg] = useState<string>(readOnly ? `[ ${path} is read-only for you - reopen with "sudo nano ${path}" to edit ]` : '');
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const save = () => {
    if (readOnly) return setMsg('[ Error writing: Permission denied - use sudo ]');
    if (text.includes('\t') && path.endsWith('.yaml')) setMsg('[ Warning: this YAML file contains TAB characters - YAML only allows spaces! ]');
    const err = onSave(text);
    setMsg(err ?? `[ Wrote ${text.split('\n').length} lines ]`);
  };
  return (
    <div className="overlay" style={{ zIndex: 80 }}>
      <div className="panel" style={{ width: 'min(1000px, 94vw)', height: 'min(700px, 90vh)', fontFamily: 'var(--mono)' }}>
        <div className="panel-head" style={{ background: '#e5e7eb', color: '#111827' }}>
          <b>GNU nano 7.2</b>
          <div className="grow" style={{ textAlign: 'center' }}>
            {path}
            {readOnly ? ' (read-only)' : ''}
          </div>
        </div>
        <textarea
          ref={ref}
          value={text}
          readOnly={readOnly}
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Tab') {
              e.preventDefault();
              const t = e.currentTarget;
              const s = t.selectionStart;
              const v = text.slice(0, s) + '  ' + text.slice(t.selectionEnd);
              setText(v);
              requestAnimationFrame(() => t.setSelectionRange(s + 2, s + 2));
            }
            if (e.ctrlKey && (e.key === 's' || e.key === 'o')) {
              e.preventDefault();
              save();
            }
            if ((e.ctrlKey && e.key === 'x') || e.key === 'Escape') {
              e.preventDefault();
              onClose();
            }
          }}
          style={{ flex: 1, border: 0, borderRadius: 0, background: '#050811', color: '#e5e7eb', fontFamily: 'var(--mono)', fontSize: 14, padding: 14, resize: 'none', lineHeight: 1.5 }}
        />
        <div style={{ padding: '4px 12px', minHeight: 24, color: '#facc15' }}>{msg}</div>
        <div className="row" style={{ padding: '8px 12px', background: '#0b1222', fontSize: 13 }}>
          <button className="btn small" onClick={save}>
            ^O / ^S Write Out
          </button>
          <button className="btn small" onClick={onClose}>
            ^X Exit
          </button>
          <span className="dim">Tab inserts 2 spaces (YAML-safe)</span>
        </div>
      </div>
    </div>
  );
}
