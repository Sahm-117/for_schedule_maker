import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /**
   * When this value changes, the boundary clears its error state. Pass the
   * route path so navigating to another page automatically recovers a crashed
   * page without a full reload.
   */
  resetKey?: string | number;
  /**
   * Render a contained card instead of a full-screen takeover. Used for the
   * route-level boundary so a single page crash leaves the nav/shell intact.
   */
  inline?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    // Recover automatically when the reset key changes (e.g. route change).
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  componentDidCatch(error: Error): void {
    console.error('Unhandled render error:', error);
  }

  handleRetry = (): void => {
    // Try to recover in place first; the user can still reload if it persists.
    this.setState({ hasError: false });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      const card = (
        <div className="max-w-md w-full bg-white border border-red-200 rounded-2xl p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-red-700">Something went wrong</h1>
          <p className="mt-2 text-sm text-gray-600">
            This page hit an unexpected error. You can try again, or switch to another page.
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={this.handleRetry}
              className="inline-flex items-center px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
            >
              Reload
            </button>
          </div>
        </div>
      );

      if (this.props.inline) {
        return <div className="flex min-h-[50vh] items-center justify-center p-4">{card}</div>;
      }

      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">{card}</div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
