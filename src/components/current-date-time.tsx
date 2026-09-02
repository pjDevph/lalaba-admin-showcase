"use client";

import { useEffect, useState } from "react";

// Renders null until mounted — new Date() differs between server and client
// render, so setting it in an effect (client-only) avoids a hydration mismatch.
export function CurrentDateTime() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // The initial tick can't be computed during render (server/client would
    // disagree on the time), so this one intentionally sets state synchronously
    // on mount instead of only from the interval's deferred callback.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!now) {
    return null;
  }

  return (
    <div className="text-sm whitespace-nowrap text-muted-foreground tabular-nums">
      {now.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      })}
      {" · "}
      {now.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })}
    </div>
  );
}
