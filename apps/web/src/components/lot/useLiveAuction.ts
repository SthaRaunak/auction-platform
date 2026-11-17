'use client';

import type { AuctionLiveState, FeedEntry, LiveEvent } from '@bidwell/contract';
import { useEffect, useRef, useState } from 'react';

export type Connection = 'connecting' | 'live' | 'reconnecting';

const FEED_LIMIT = 12;

function mergeFeed(current: FeedEntry[], incoming: FeedEntry[]) {
  const seen = new Set(current.map((f) => f.key));
  const fresh = incoming.filter((f) => !seen.has(f.key)).reverse(); // deltas are oldest-first
  return { feed: [...fresh, ...current].slice(0, FEED_LIMIT), fresh: fresh.map((f) => f.key) };
}

const newest = (a: AuctionLiveState, b: AuctionLiveState) => (b.version > a.version ? b : a);

/**
 * Live state over SSE, converging after any disconnect (B1):
 *  - every message carries the auction's monotonic version; the newest wins, whether
 *    it came from the server render, the stream, or our own bid response;
 *  - EventSource reconnects by itself and sends Last-Event-ID; the server answers a
 *    stale client with a full snapshot;
 *  - an SSE delta whose state is no longer newer still contributes its feed rows.
 */
export function useLiveAuction(serverState: AuctionLiveState, initialFeed: FeedEntry[]) {
  const [pushed, setPushed] = useState(serverState);
  const [feed, setFeed] = useState(initialFeed);
  const [freshKeys, setFreshKeys] = useState<string[]>([]);
  const [connection, setConnection] = useState<Connection>('connecting');
  const version = useRef(serverState.version);
  const feedRef = useRef(initialFeed);

  const state = newest(pushed, serverState);

  useEffect(() => {
    version.current = Math.max(version.current, serverState.version);
  }, [serverState.version]);

  const applyState = (next: AuctionLiveState) => {
    if (next.version < version.current) return false;
    version.current = next.version;
    setPushed((cur) => newest(cur, next));
    return true;
  };

  const showFeed = (next: FeedEntry[], fresh: string[]) => {
    feedRef.current = next;
    setFeed(next);
    if (fresh.length) setFreshKeys(fresh);
  };

  useEffect(() => {
    const es = new EventSource(`/api/auctions/${serverState.auctionId}/events?lastVersion=${version.current}`);
    es.onopen = () => setConnection('live');
    es.onerror = () => setConnection('reconnecting');

    es.addEventListener('snapshot', (e) => {
      const event = JSON.parse((e as MessageEvent).data) as LiveEvent;
      if (applyState(event)) {
        const known = new Set(feedRef.current.map((f) => f.key));
        showFeed(
          event.feed,
          event.feed.filter((f) => !known.has(f.key)).map((f) => f.key),
        );
      }
      setConnection('live');
    });

    es.addEventListener('delta', (e) => {
      const event = JSON.parse((e as MessageEvent).data) as LiveEvent;
      applyState(event);
      if (event.feed.length) {
        const merged = mergeFeed(feedRef.current, event.feed);
        showFeed(merged.feed, merged.fresh);
      }
    });

    return () => es.close();
  }, [serverState.auctionId]);

  useEffect(() => {
    if (!freshKeys.length) return;
    const t = setTimeout(() => setFreshKeys([]), 1500);
    return () => clearTimeout(t);
  }, [freshKeys]);

  return { state, feed, freshKeys, connection, applyState };
}
