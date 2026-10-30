import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { readPlayRound, readPublicPlay } from "../../lib/api/play";
import { ApiError } from "../../lib/api/client";
import { socketUrl } from "../../lib/websocket/socketUrl";
import { retryTransientRead } from "../../lib/queryClient";

export function usePlayState(roundId: string, publicView = false) {
  const client = useQueryClient();
  const [wsConnected, setWsConnected] = useState(false);
  const query = useQuery({
    queryKey: ["reference-play", publicView ? "public" : "private", roundId],
    queryFn: ({ signal }) => publicView
      ? readPublicPlay(signal).then((result) => result.game)
      : readPlayRound(roundId, signal),
    enabled: publicView || !!roundId,
    retry: retryTransientRead,
    refetchInterval: (q) => {
      if (q.state.error instanceof ApiError && [401, 403].includes(q.state.error.status)) return false;
      if (q.state.error) return 30_000;
      // A public socket is scoped to its current round, so discovery must keep
      // running when a different round becomes active or broadcast.
      if (publicView) return 15_000;
      if (q.state.data?.status === "COMPLETED") return false;
      return wsConnected ? 60_000 : 5_000;
    },
    refetchOnReconnect: "always",
    refetchOnWindowFocus: "always",
  });
  const id = query.data?.id;
  const eventId = query.data?.eventId;
  const status = query.data?.status;
  const accessDenied = query.error instanceof ApiError && [401, 403].includes(query.error.status);
  useEffect(() => {
    if (accessDenied || !id || !eventId || status === "COMPLETED" ||
      (!publicView && !["READY", "ACTIVE", "PAUSED"].includes(status ?? ""))) return;
    let stopped = false;
    let socket: WebSocket | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let refreshInFlight = false;
    let refreshQueued = false;
    const refresh = () => {
      if (stopped) return;
      refreshQueued = true;
      if (refreshTimer !== undefined || refreshInFlight) return;
      refreshTimer = setTimeout(async () => {
        refreshTimer = undefined;
        if (stopped) return;
        refreshQueued = false;
        refreshInFlight = true;
        try {
          await client.refetchQueries({
            queryKey: ['reference-play', publicView ? 'public' : 'private', roundId],
            exact: true,
          }, { cancelRefetch: false });
        } finally {
          refreshInFlight = false;
          if (refreshQueued && !stopped) refresh();
        }
      }, 150);
    };
    const reconnect = () => {
      if (stopped || timer !== undefined) return;
      const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempts++, 5));
      timer = setTimeout(() => {
        timer = undefined;
        connect();
      }, delay);
    };
    function connect() {
      if (stopped) return;
      try {
        const current = new WebSocket(socketUrl(
          publicView ? "/api/v1/live/ws" : "/api/v1/ws",
          new URLSearchParams({ roundId: id!, eventId: eventId! }),
        ));
        socket = current;
        current.onopen = () => {
          if (stopped || current !== socket) return;
          attempts = 0;
          setWsConnected(true);
          refresh();
        };
        current.onmessage = refresh;
        current.onerror = () => setWsConnected(false);
        // Browsers emit close after an error: schedule exactly one retry here.
        current.onclose = () => {
          if (stopped || current !== socket) return;
          setWsConnected(false);
          reconnect();
        };
      } catch {
        setWsConnected(false);
        reconnect();
      }
    }
    // Let React finish its development setup/cleanup cycle before opening.
    timer = setTimeout(() => {
      timer = undefined;
      connect();
    }, 0);
    return () => {
      stopped = true;
      setWsConnected(false);
      clearTimeout(timer);
      clearTimeout(refreshTimer);
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        socket.onerror = null;
        if (socket.readyState === WebSocket.CONNECTING) {
          // Closing during the handshake produces a browser error. Finish it
          // without delivering events, then immediately release the socket.
          const abandoned = socket;
          abandoned.onopen = () => {
            abandoned.onopen = null;
            abandoned.close();
          };
        } else if (socket.readyState === WebSocket.OPEN) {
          socket.close();
        }
      }
    };
  }, [id, eventId, status, publicView, client, roundId, accessDenied]);
  return query;
}
