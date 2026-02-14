import React from "react";

type Props = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

type State = {
  hasError: boolean;
  error?: Error;
};

/**
 * クライアントサイドの未キャッチ例外を捕捉し、フォールバックUIを表示する
 * 「Application error: a client-side exception has occurred」を防止
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6" role="alert">
          <h1 className="text-lg font-semibold text-gray-800 mb-2">エラーが発生しました</h1>
          <p className="text-sm text-gray-600 mb-4 text-center max-w-md">
            ページの読み込み中に問題が発生しました。ページを更新してみてください。
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors"
          >
            ページを再読み込み
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
