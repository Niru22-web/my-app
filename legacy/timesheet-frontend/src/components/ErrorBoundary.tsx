import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
            <div className="text-center p-8 bg-white rounded-3xl shadow-2xl border border-rose-100 max-w-lg w-full">
              <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-2xl font-black text-slate-900 mb-2">Something went wrong</h2>
              <p className="text-slate-500 font-medium mb-6">
                The application encountered an unexpected error. We've been notified and are looking into it.
              </p>
              
              {this.state.error && (
                <div className="mb-6 p-4 bg-rose-50 rounded-xl text-left border border-rose-100">
                  <p className="text-xs font-black text-rose-600 uppercase tracking-widest mb-1">Error Details:</p>
                  <p className="text-sm font-bold text-rose-800 break-words">{this.state.error.toString()}</p>
                </div>
              )}

              <button
                onClick={() => window.location.reload()}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all active:scale-95 shadow-xl shadow-indigo-100"
              >
                Reload Application
              </button>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
