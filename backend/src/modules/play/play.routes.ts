import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  requireAdmin,
  requireAuth,
  requireParticipantToken,
} from "../../middleware/auth.ts";
import { PlayService } from "./play.service.ts";
import { PLAY_PATTERNS, type PlayActor } from "./play.types.ts";
import { parseAndValidateBankSpreadsheet } from "./excel-import.ts";
import { ValidationError } from "../../shared/errors/index.ts";
const roundParams = z.object({ id: z.string().uuid() });
const actor = (request: FastifyRequest): PlayActor => ({
  userId: request.user!.id,
  role: request.user!.role ?? "PARTICIPANT",
  eventId: request.user!.eventId,
});
const commands = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["start", "pause", "resume", "end"]) }).strict(),
  z
    .object({
      action: z.literal("call"),
      number: z.number().int().min(1).max(90).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("reveal"),
      sequences: z.array(z.number().int().positive()).min(1).max(90).optional(),
    })
    .strict(),
]);
export function createPlayRoutes(service: PlayService): FastifyPluginAsync {
  return async (app) => {
    app.get("/play/rounds", { preHandler: [requireAuth] }, (request) =>
      service.list(actor(request)),
    );
    app.get("/play/current", { preHandler: [requireAuth] }, (request) =>
      service.current(actor(request)),
    );
    app.get("/play/rounds/:id", { preHandler: [requireAuth] }, (request) =>
      service.read(roundParams.parse(request.params).id, actor(request)),
    );
    app.post(
      "/admin/play/validate-bank",
      { preHandler: [requireAdmin] },
      async (request) => {
        let buffer: Buffer | null = null;
        if (request.isMultipart()) {
          const parts = request.parts();
          for await (const part of parts) {
            if (part.type === "file") {
              buffer = await part.toBuffer();
              break;
            }
          }
        } else if (request.body && typeof request.body === "object") {
          const body = request.body as Record<string, unknown>;
          if (typeof body.fileBase64 === "string") {
            buffer = Buffer.from(body.fileBase64, "base64");
          }
        }
        if (!buffer) {
          throw new ValidationError(
            "No spreadsheet file was provided for bank validation.",
          );
        }
        return parseAndValidateBankSpreadsheet(buffer);
      },
    );
    app.post(
      "/admin/play/rounds",
      { preHandler: [requireAdmin] },
      (request) => {
        const key = z
          .string()
          .trim()
          .min(1)
          .max(200)
          .parse(request.headers["idempotency-key"]);
        const body = z
          .object({
            bank: z
              .array(
                z.object({
                  number: z.number().int().positive(),
                  term: z.string().trim().min(1),
                  clue: z.string().trim().min(1),
                  category: z.string().trim().default("General"),
                  codeSnippet: z.string().nullable().optional(),
                }),
              )
              .min(15)
              .optional(),
          })
          .optional()
          .safeParse(request.body);
        const customBank = body.success ? body.data?.bank : undefined;
        return service.create(actor(request), key, customBank);
      },
    );
    app.post(
      "/admin/play/rounds/:id/commands",
      { preHandler: [requireAdmin] },
      (request) =>
        service.command(
          roundParams.parse(request.params).id,
          actor(request),
          commands.parse(request.body),
          z
            .string()
            .trim()
            .min(1)
            .max(200)
            .parse(request.headers["idempotency-key"]),
        ),
    );
    app.post(
      "/participant/play/join",
      { preHandler: [requireParticipantToken] },
      (request) =>
        service.join(
          z
            .object({
              code: z
                .string()
                .trim()
                .toUpperCase()
                .regex(/^[A-Z0-9]{6}$/),
            })
            .strict()
            .parse(request.body).code,
          actor(request),
        ),
    );
    app.put(
      "/participant/play/rounds/:id/marks",
      { preHandler: [requireParticipantToken] },
      (request) => {
        const body = z
          .object({ cellId: z.string().uuid(), marked: z.boolean() })
          .strict()
          .parse(request.body);
        return service.mark(
          roundParams.parse(request.params).id,
          actor(request),
          body.cellId,
          body.marked,
        );
      },
    );
    app.post(
      "/participant/play/rounds/:id/claims",
      { preHandler: [requireParticipantToken] },
      (request) =>
        service.claim(
          roundParams.parse(request.params).id,
          actor(request),
          z
            .object({ pattern: z.enum(PLAY_PATTERNS) })
            .strict()
            .parse(request.body).pattern,
        ),
    );
    app.get("/live/play", () => service.current());
  };
}
