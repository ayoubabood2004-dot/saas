import { Component, type ErrorInfo, type ReactNode } from "react";
import i18next from "i18next";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

interface Props {
  children: ReactNode;
  /** Optional label so logs can tell which boundary tripped. */
  scope?: string;
}
interface State {
  error: Error | null;
}

/**
 * Catches render-time crashes anywhere in the subtree and shows a friendly,
 * branded recovery screen instead of a white page. Without this, a single
 * thrown error during render would blank the entire app.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface in the console for support/debugging; never re-throw.
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary${this.props.scope ? `:${this.props.scope}` : ""}]`, error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const t = (key: string, fallback: string) => {
      try {
        return i18next.t(key, { defaultValue: fallback }) as string;
      } catch {
        return fallback;
      }
    };

    return (
      <div className="grid min-h-screen place-items-center bg-surface px-6">
        <div className="w-full max-w-md rounded-3xl border border-line bg-surface-1 p-8 text-center shadow-soft">
          <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-danger-50 text-danger-600 dark:bg-danger-500/15 dark:text-danger-300">
            <AlertTriangle size={26} />
          </span>
          <h1 className="font-display text-lg font-bold text-ink">{t("errors.title", "Something went wrong")}</h1>
          <p className="mt-2 text-sm text-ink-muted">
            {t("errors.body", "An unexpected error interrupted this screen. Your data is safe — try reloading.")}
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              <RefreshCw size={16} /> {t("errors.reload", "Reload")}
            </button>
            <button
              onClick={() => {
                this.reset();
                window.location.assign("/");
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-surface-2"
            >
              <Home size={16} /> {t("errors.home", "Go to start")}
            </button>
          </div>
          {error.message && (
            <details className="mt-5 text-start">
              <summary className="cursor-pointer text-xs text-ink-subtle">{t("errors.details", "Technical details")}</summary>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-surface-2 p-3 text-2xs text-ink-muted">
                {error.message}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}
