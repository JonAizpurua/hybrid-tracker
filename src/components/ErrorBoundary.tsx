import { Component, type ErrorInfo, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Hybrid Tracker error', error, info); }
  render() {
    if (this.state.failed) return (
      <main className="fatal-state">
        <div className="app-mark">HT</div>
        <h1>Something went wrong</h1>
        <p>Your saved data is still on this device. Reload the app to continue.</p>
        <button className="button primary" onClick={() => window.location.reload()}>Reload Hybrid Tracker</button>
      </main>
    );
    return this.props.children;
  }
}
