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
    refetchInterval: wsConnected ? 5000 : 1500,
    refetchOnWindowFocus: "always",
  });
  const id = query.data?.id;
  const eventId = query.data?.eventId;
  const status = query.data?.status;
  useEffect(() => {
    if (
      !id ||
      !eventId ||
      (!publicView && !["ACTIVE", "PAUSED"].includes(status ?? ""))
    )
      return;
    let stopped = false;
    let socket: WebSocket | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      void client.invalidateQueries({ queryKey: ["reference-play"] });
    };
    function connect() {
      socket = new WebSocket(
        socketUrl(
          publicView ? "/api/v1/live/ws" : "/api/v1/ws",
          new URLSearchParams({ roundId: id!, eventId: eventId! }),
        ),
      );
      socket.onopen = () => {
        setWsConnected(true);
        refresh();
      };
      socket.onmessage = refresh;
      socket.onclose = (event) => {
        setWsConnected(false);
        if (!stopped && event.code !== 1008) timer = setTimeout(connect, 2000);
      };
      socket.onerror = () => {
        setWsConnected(false);
      };
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
