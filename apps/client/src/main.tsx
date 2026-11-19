import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

/** Never show a blank screen: if anything crashes, explain and offer a reload. Progress is already saved server-side. */
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div id="crash" style={{ padding: 40, maxWidth: 900, margin: '0 auto' }}>
        <h2>😵 Route Runner hit a bug</h2>
        <p className="muted">Your progress is safe - it is saved on your PC after every action. Reload to continue.</p>
        <pre className="exhibit" style={{ whiteSpace: 'pre-wrap' }}>{String(this.state.error?.stack ?? this.state.error)}</pre>
        <button className="btn primary" onClick={() => location.reload()}>
          Reload the game
        </button>
      </div>
    );
  }
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
