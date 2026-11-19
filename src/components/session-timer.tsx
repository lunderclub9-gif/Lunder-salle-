"use client";

import { useEffect, useState } from "react";
import { formatDuration } from "@/lib/billing";

export function SessionTimer({
  startedAt,
  pausedSeconds,
  pausedAt,
  running,
  className,
}: {
  startedAt: string;
  pausedSeconds: number;
  pausedAt: string | null;
  running: boolean;
  className?: string;
}) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  const start = new Date(startedAt).getTime();
  const reference = now ?? start;
  const paused = pausedAt ? new Date(pausedAt).getTime() : null;
  const extraPause = paused ? Math.max(0, (reference - paused) / 1000) : 0;
  const elapsedSeconds = Math.max(0, (reference - start) / 1000 - pausedSeconds - extraPause);

  return (
    <span className={className} suppressHydrationWarning>
      {formatDuration(elapsedSeconds)}
    </span>
  );
}
