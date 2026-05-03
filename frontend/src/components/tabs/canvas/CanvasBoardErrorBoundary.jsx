import { Component } from 'react';

class CanvasBoardErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[CanvasBoard] Render error:', error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 rounded-3xl border border-rose-200 bg-rose-50 p-8">
          <p className="text-sm font-black uppercase tracking-wider text-rose-700">Canvas render error</p>
          <pre className="max-h-48 max-w-lg overflow-auto rounded-xl border border-rose-200 bg-white p-3 text-[11px] text-rose-800 leading-relaxed">
            {this.state.error?.message || String(this.state.error)}
          </pre>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="rounded-xl border border-rose-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wider text-rose-700 hover:bg-rose-100"
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default CanvasBoardErrorBoundary;
