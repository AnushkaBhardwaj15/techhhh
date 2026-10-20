type RequestMessage = { id: number; url: string; cookie: string };

const worker = self as unknown as {
  onmessage: ((event: MessageEvent<RequestMessage>) => unknown) | null;
  postMessage(message: unknown): void;
};
worker.onmessage = async (event: MessageEvent<RequestMessage>) => {
  const { id, url, cookie } = event.data;
  const started = performance.now();
  try {
    const response = await fetch(url, { headers: { cookie } });
    const body = await response.json().catch(() => null);
    const serverMs = Number(response.headers.get('x-load-server-ms'));
    worker.postMessage({
      id,
      result: {
        workerMs: performance.now() - started,
        serverMs: Number.isFinite(serverMs) ? serverMs : undefined,
        status: response.status,
        body,
      },
    });
  } catch (error) {
    worker.postMessage({
      id,
      result: { workerMs: performance.now() - started, status: 0, body: null, error: error instanceof Error ? error.message : String(error) },
    });
  }
};
worker.postMessage({ type: 'ready' });
