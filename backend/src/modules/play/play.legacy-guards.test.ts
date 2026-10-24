import { expect, test } from "bun:test";
import { DrawService } from "../draws/draw.service.ts";
import { RoundService } from "../rounds/round.service.ts";
import type { IRoundRepository } from "../rounds/round.repository.ts";

// Legacy mutations must stop before touching IO or publishing answers.
const referenceRepo = {
  isReferenceRound: async () => true,
} as unknown as IRoundRepository;
test("legacy random/manual draws cannot bypass reference reveals", async () => {
  const service = new DrawService(undefined, referenceRepo);
  await expect(
    service.drawRandom({
      actorId: "admin",
      roundId: "round",
      idempotencyKey: "random",
    }),
  ).rejects.toThrow("reference round controls");
  await expect(
    service.drawManual({
      actorId: "admin",
      roundId: "round",
      questionId: "question",
      idempotencyKey: "manual",
    }),
  ).rejects.toThrow("reference round controls");
});
test("legacy lifecycle controls cannot bypass reference transitions", async () => {
  const service = new RoundService(referenceRepo);
  for (const action of [
    "readyRound",
    "startRound",
    "pauseRound",
    "resumeRound",
    "completeRound",
    "cancelRound",
  ] as const)
    await expect(service[action]("admin", "round")).rejects.toThrow(
      "reference controls",
    );
  await expect(service.updateRound("admin", "round", {})).rejects.toThrow(
    "reference controls",
  );
});
