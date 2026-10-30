import { apiRequest } from "./client";
import {
  playClaimSchema,
  playCurrentSchema,
  playListSchema,
  playStateSchema,
  type PlayPattern,
} from "../../types/play";
export async function listPlayRounds(signal?: AbortSignal) {
  return playListSchema.parse(await apiRequest("/play/rounds", { signal }));
}
export async function readCurrentPlay(signal?: AbortSignal) {
  return playCurrentSchema.parse(await apiRequest("/play/current", { signal }));
}
export async function readPlayRound(id: string, signal?: AbortSignal) {
  return playStateSchema.parse(
    await apiRequest(`/play/rounds/${encodeURIComponent(id)}`, { signal }),
  );
}
export async function readPublicPlay(signal?: AbortSignal) {
  return playCurrentSchema.parse(await apiRequest("/live/play", { signal }));
}
export async function createPlayRound(
  key: string,
  bank?: Array<{
    number: number;
    term: string;
    clue: string;
    category?: string;
    codeSnippet?: string | null;
  }>,
) {
  return playStateSchema.parse(
    await apiRequest("/admin/play/rounds", {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: bank ? JSON.stringify({ bank }) : undefined,
    }),
  );
}
export async function validatePlayBank(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return apiRequest<{
    valid: boolean;
    totalRows: number;
    validRows: number;
    errors: string[];
    warnings: string[];
    questions: Array<{
      number: number;
      term: string;
      clue: string;
      category: string;
      codeSnippet: string | null;
    }>;
  }>("/admin/play/validate-bank", {
    method: "POST",
    body: formData,
  });
}
export async function joinPlayRound(code: string, paymentDeclared?: boolean) {
  return playStateSchema.parse(
    await apiRequest("/participant/play/join", {
      method: "POST",
      body: JSON.stringify({ code, ...(paymentDeclared === undefined ? {} : { paymentDeclared }) }),
    }),
  );
}
export async function declarePlayPayment(id: string, paymentDeclared: boolean) {
  return playStateSchema.parse(await apiRequest(`/participant/play/rounds/${encodeURIComponent(id)}/payment-declaration`, {
    method: 'PUT', body: JSON.stringify({ paymentDeclared }),
  }));
}
export async function commandPlayRound(
  id: string,
  command: {
    action: "start" | "pause" | "resume" | "end" | "call" | "reveal";
    number?: number;
    sequences?: number[];
  },
  key: string = crypto.randomUUID(),
) {
  return playStateSchema.parse(
    await apiRequest(`/admin/play/rounds/${encodeURIComponent(id)}/commands`, {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify(command),
    }),
  );
}
export async function markPlayCell(
  id: string,
  cellId: string,
  marked: boolean,
) {
  return playStateSchema.parse(
    await apiRequest(
      `/participant/play/rounds/${encodeURIComponent(id)}/marks`,
      { method: "PUT", body: JSON.stringify({ cellId, marked }) },
    ),
  );
}
export async function claimPlayPrize(id: string, pattern: PlayPattern) {
  return playClaimSchema.parse(
    await apiRequest(
      `/participant/play/rounds/${encodeURIComponent(id)}/claims`,
      { method: "POST", body: JSON.stringify({ pattern }) },
    ),
  );
}

export async function broadcastPlayRound(id: string, broadcast: boolean) {
  return playStateSchema.parse(
    await apiRequest(`/admin/play/rounds/${encodeURIComponent(id)}/broadcast`, {
      method: "POST",
      body: JSON.stringify({ broadcast }),
    }),
  );
}

export async function deletePlayGame(id: string) {
  await apiRequest(`/admin/play/rounds/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
