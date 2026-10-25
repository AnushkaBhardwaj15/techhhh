import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { readPlayRound, readPublicPlay } from "../../lib/api/play";
import { socketUrl } from "../../lib/websocket/socketUrl";
export function usePlayState(roundId: string, publicView = false) {
  const client = useQueryClient();
  const [wsConnected, setWsConnected] = useState(false);
  const query = useQuery({
    queryKey: ["reference-play", publicView ? "public" : "private", roundId],
    queryFn: ({ signal }) =>
      publicView
        ? readPublicPlay(signal).then((result) => result.game)
        : readPlayRound(roundId, signal),
    enabled: publicView || !!roundId,
    refetchInterval: (q) => {
      if (q.state.data?.status === 'COMPLETED') return false;
      return wsConnected ? 1500 : 800;
    },
    refetchOnWindowFocus: "always",
  });
  const id = query.data?.id;
  const eventId = query.data?.eventId;
  const status = query.data?.status;
  useEffect(() => {
    if (
      !id ||
      !eventId ||
      (!publicView && !["READY", "ACTIVE", "PAUSED", "COMPLETED"].includes(status ?? ""))
    )
      return;
    let stopped = false;
    let socket: WebSocket | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      void client.refetchQueries({ queryKey: ["reference-play"], exact: false });
    };
    function connect(usePublicFallback = false) {
      if (stopped) return;
      try {
        const path = publicView || usePublicFallback ? "/api/v1/live/ws" : "/api/v1/ws";
        socket = new WebSocket(
          socketUrl(
            path,
            new URLSearchParams({ roundId: id!, eventId: eventId! }),
          ),
        );
        socket.onopen = () => {
          setWsConnected(true);
          refresh();
        };
        socket.onmessage = (event) => {
          try {
            if (typeof event.data === 'string') {
              const data = JSON.parse(event.data);
              if (data.type === 'DRAW_CREATED' && data.payload) {
                client.setQueryData<any>(
                  ["reference-play", publicView ? "public" : "private", roundId],
                  (current: any) => {
                    if (!current) return current;
                    const exists = current.draws?.some((d: any) => d.sequence === data.payload.sequence);
                    if (exists) return current;
                    const newDraw = {
                      id: crypto.randomUUID(),
                      sequence: data.payload.sequence,
                      questionId: crypto.randomUUID(),
                      keyId: crypto.randomUUID(),
                      number: data.payload.sequence,
                      prompt: data.payload.question,
                      answer: data.payload.key,
                      category: 'General',
                      codeSnippet: null,
                      revealed: true,
                      drawnAt: data.payload.drawnAt,
                    };
                    return {
                      ...current,
                      draws: [...(current.draws || []), newDraw],
                    };
                  }
                );
              }
            }
          } catch {
            /* ignore JSON parse errors */
          }
          refresh();
        };
        socket.onclose = (e) => {
          setWsConnected(false);
          if (!stopped) {
            const nextFallback = !publicView && (e.code === 1008 || e.code === 1006 || !usePublicFallback);
            timer = setTimeout(() => connect(nextFallback), 1000);
          }
        };
        socket.onerror = () => {
          setWsConnected(false);
          if (!stopped) timer = setTimeout(() => connect(!publicView), 1000);
        };
      } catch {
        setWsConnected(false);
        if (!stopped) timer = setTimeout(() => connect(!publicView), 1000);
      }
    }
    connect();
    return () => {
      stopped = true;
      setWsConnected(false);
      clearTimeout(timer);
      if (socket) {
        socket.onclose = null;
        socket.onerror = null;
        socket.close();
      }
    };
  }, [id, eventId, status, publicView, client]);
  return query;
}
