import React, { Component, type ReactNode } from "react";
import { useAppStore } from "../store/appStore";
import { t } from "../utils/i18n";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  retryKey: number;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, retryKey: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("[ErrorBoundary]", error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  private handleRetry = (): void => {
    this.setState((state) => ({
      hasError: false,
      error: null,
      retryKey: state.retryKey + 1,
    }));
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      // Class components cannot use hooks; read the language directly from
      // the store. The error screen is transient, so non-reactive is fine.
      const language = useAppStore.getState().settings.language;

      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center select-none">
          <div className="text-4xl mb-4 opacity-40">:(</div>
          <h2 className="text-lg font-semibold mb-2 text-gray-700 dark:text-gray-300">
            {t(language, "errorBoundary_title")}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-md">
            {this.state.error?.message ||
              t(language, "errorBoundary_fallbackMessage")}
          </p>
          <button
            onClick={this.handleRetry}
            className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            {t(language, "errorBoundary_retry")}
          </button>
        </div>
      );
    }

    return (
      <React.Fragment key={this.state.retryKey}>
        {this.props.children}
      </React.Fragment>
    );
  }
}
