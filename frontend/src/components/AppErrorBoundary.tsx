import { Component, type ReactNode } from 'react';
import { reportDiagnostic } from '../lib/diagnostics';

export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    reportDiagnostic('render');
  }

  render() {
    if (this.state.failed) return <main className="feedback"><h1>We could not load this page.</h1><p role="alert">This page hit a problem. Reload to try again.</p><button type="button" onClick={() => window.location.reload()}>Reload page</button></main>;
    return this.props.children;
  }
}
