import React from "react";
import { Button } from "@/components/ui/button";

type Props = { children: React.ReactNode };
type State = { hasError: boolean };

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("App render error", error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6 text-right" dir="rtl">
        <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-foreground">משהו נתקע בטעינת המסך</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            האפליקציה לא תישאר על דף לבן. רענון קצר יטען מחדש את המסך.
          </p>
          <Button className="mt-5 w-full" onClick={() => window.location.reload()}>
            רענן מסך
          </Button>
        </div>
      </div>
    );
  }
}