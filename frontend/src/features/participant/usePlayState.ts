import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { readPlayRound, readPublicPlay } from "../../lib/api/play";
import { socketUrl } from "../../lib/websocket/socketUrl";
export function usePlayState(roundId: string, publicView = false) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["reference-play", publicView ? "public" : "private", roundId],
    queryFn: ({ signal }) =>
      publicView
        ? readPublicPlay(signal).then((result) => result.game)
        : readPlayRound(roundId, signal),
    enabled: publicView || !!roundId,
    refetchInterval: 1500,
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
      socket.onopen = refresh;
      socket.onmessage = refresh;
      socket.onclose = (event) => {
        if (!stopped && event.code !== 1008) timer = setTimeout(connect, 2000);
      };
    }
    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
    };
  }, [id, eventId, status, publicView, client]);
  return query;
}
