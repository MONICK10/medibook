// src/components/ErrorBoundary.jsx
// -----------------------------------------------------------------
// Catches a crash in any component below it and shows a page instead
// of a blank white screen.
//
// WHY this has to be a class: React only offers the error-catching
// lifecycle (componentDidCatch / getDerivedStateFromError) on class
// components. It is the one place in a modern React app where a class
// is still the right answer.
//
// It catches errors thrown while RENDERING. It does not catch errors
// inside event handlers or async code - those are handled where they
// happen, which is why every page has its own try/catch around API
// calls.
// -----------------------------------------------------------------

import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // In a real deployment this is where you would report to an error
    // tracker. The console is enough here, and Vite's dev overlay
    // already shows the stack while developing.
    console.error('A component crashed:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="page page--narrow" style={{ paddingTop: 56 }}>
        <div className="card">
          <h1>Something went wrong</h1>
          <p className="muted">
            This page hit an unexpected problem and could not finish loading. Reloading
            usually fixes it.
          </p>

          <div className="row">
            <button
              type="button"
              className="btn"
              onClick={() => window.location.reload()}
            >
              Reload the page
            </button>
            <a href="/" className="btn btn--secondary">
              Go to the home page
            </a>
          </div>

          {/* The message is shown because this is a teaching app and a
              student needs to see what broke. A production app would
              show a reference id instead and keep the detail in its
              error tracker. */}
          <details className="small muted" style={{ marginTop: 20 }}>
            <summary>Technical detail</summary>
            <pre style={{ overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
              {String(this.state.error && this.state.error.message)}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
