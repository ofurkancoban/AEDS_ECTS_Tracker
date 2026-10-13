import { Component, type ErrorInfo, type ReactNode } from "react";
import { STORAGE_KEY } from "../lib/constants";

/**
 * Last line of defence: instead of a blank page, explain what happened and
 * offer ways out that never lose data (download it, reload, classic view).
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ECTS Tracker crashed", error, info.componentStack);
  }

  private download = () => {
    let data = "{}";
    try {
      data = JSON.stringify(
        {
          state: JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"),
          backups: JSON.parse(localStorage.getItem(STORAGE_KEY + "::backups") || "[]"),
        },
        null,
        2,
      );
    } catch {
      data = localStorage.getItem(STORAGE_KEY) || "{}";
    }
    const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "ects-tracker-rescue.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  render() {
    if (!this.state.error) return this.props.children;
    const btn =
      "inline-flex h-10 cursor-pointer items-center justify-center rounded-xl border border-line bg-panel px-4 text-body font-medium text-ink hover:border-line-strong";
    return (
      <div role="alert" className="flex min-h-screen items-center justify-center p-6">
        <div className="card w-full max-w-lg p-6">
          <h1 className="font-serif text-display font-semibold">Something went wrong</h1>
          <p className="mt-2 text-body leading-relaxed text-muted">
            The tracker hit an unexpected error. Your courses are still saved in this browser. Download a copy first, then try reloading or open the
            classic view.
          </p>
          <pre className="num mt-4 max-h-28 overflow-auto rounded-xl bg-ink/5 p-3 text-meta whitespace-pre-wrap text-muted">{String(this.state.error.message)}</pre>
          <div className="mt-5 flex flex-wrap gap-2">
            <button className={btn + " !border-accent !bg-accent !text-white"} onClick={this.download}>
              Download my data
            </button>
            <button className={btn} onClick={() => window.location.reload()}>
              Reload
            </button>
            <a className={btn} href="./legacy/">
              Open classic view
            </a>
          </div>
        </div>
      </div>
    );
  }
}
