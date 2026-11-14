'use client';

import { createContext, useContext, useEffect, useState } from 'react';

const ClockContext = createContext<number>(0); // the provider wraps every page

/**
 * One ticking clock for the whole page, corrected to server time (A4, B3).
 * The client measures its offset from GET /api/time once (half the round trip
 * is attributed to each leg); every countdown reads from here. Client time
 * never decides anything — the server rejects late bids regardless.
 */
export function ClockProvider({ children }: { children: React.ReactNode }) {
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      try {
        const t0 = Date.now();
        const res = await fetch('/api/time', { cache: 'no-store' });
        const t1 = Date.now();
        const { now: server } = (await res.json()) as { now: string };
        if (!cancelled) setOffset(new Date(server).getTime() - (t0 + t1) / 2);
      } catch {
        /* keep the last offset */
      }
    };
    void sync();
    const resync = setInterval(sync, 5 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(resync);
    };
  }, []);

  useEffect(() => {
    const tick = () => setNow(Date.now() + offset);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [offset]);

  return <ClockContext.Provider value={now}>{children}</ClockContext.Provider>;
}

export const useNow = () => useContext(ClockContext);
