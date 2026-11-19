import type { ReactNode } from 'react';
import { useGame } from '../store';

export function Panel({ title, icon, children, actions, flush, color }: { title: ReactNode; icon?: string; children: ReactNode; actions?: ReactNode; flush?: boolean; color?: string }) {
  const open = useGame((s) => s.open);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && open(null)}>
      <div className="panel" style={color ? { borderColor: color } : undefined}>
        <div className="panel-head">
          {icon && <span style={{ fontSize: 22 }}>{icon}</span>}
          <div className="title">{title}</div>
          <div className="grow" />
          {actions}
          <button className="btn small" onClick={() => open(null)} title="Close (Esc)">
            ✕ Close <kbd>Esc</kbd>
          </button>
        </div>
        <div className={`panel-body ${flush ? 'flush' : ''}`}>{children}</div>
      </div>
    </div>
  );
}

export function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div className="bar">
      <div style={{ width: `${Math.max(2, Math.min(100, value * 100))}%`, background: color }} />
    </div>
  );
}

export const STREAM_COLOR: Record<string, string> = { network: '#3b82f6', cloud: '#06b6d4', forex: '#22c55e', general: '#f59e0b' };
export const STREAM_ICON: Record<string, string> = { network: '🌐', cloud: '☁️', forex: '📈' };
export const STREAM_NAME: Record<string, string> = { network: 'Network Engineer', cloud: 'Cloud Engineer', forex: 'Forex Trader' };
