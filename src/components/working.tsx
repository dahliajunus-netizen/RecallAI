"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

/** Honest progress indicator for long AI calls: elapsed time plus what is happening. */
export function Working({ title, steps, hint }: { title: string; steps: string[]; hint: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const step = steps[Math.min(steps.length - 1, Math.floor(seconds / 12))];
  return (
    <div className="grid place-items-center rounded-xl bg-card px-6 py-14 text-center ring-1 ring-foreground/10" role="status">
      <Loader2 className="size-6 animate-spin text-primary" />
      <p className="mt-4 font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{step}</p>
      <p className="mt-4 text-xs text-muted-foreground tabular-nums">
        {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")} · {hint}
      </p>
    </div>
  );
}
