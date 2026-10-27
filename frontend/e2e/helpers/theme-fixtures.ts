import type { Page } from "@playwright/test";

export const eventId = "11111111-1111-4111-8111-111111111111";
export const roundId = "22222222-2222-4222-8222-222222222222";
export const userId = "33333333-3333-4333-8333-333333333333";
const ticketId = "8679def1-0919-4cfc-b2cd-9d23961b5a5f";
const now = "2026-10-24T10:00:00.000Z";
const stamp = { createdAt: now, updatedAt: now };
const patternTypes = [
  "EARLY_5",
  "FOUR_CORNERS",
  "SECOND_FULL_HOUSE",
  "TOP_LINE",
  "MIDDLE_LINE",
  "BOTTOM_LINE",
  "FULL_HOUSE",
];
const event = {
  id: eventId,
  title: "Tech Tambola 2026",
  description: "Technology, community, and a little luck.",
  status: "LIVE",
  scheduledAt: null,
  startedAt: now,
  completedAt: null,
  ...stamp,
};
const round = {
  id: roundId,
  eventId,
  sequenceNumber: 1,
  name: "Opening round",
  status: "ACTIVE",
  patterns: patternTypes.map((patternType, index) => ({
    id: `44444444-4444-4444-8444-44444444444${index}`,
    roundId,
    patternType,
    enabled: true,
    maxWinners: 1,
    status: "OPEN",
    ...stamp,
  })),
  ...stamp,
};
const values = [
  "DOCKER",
  "LINUX",
  "PYTHON",
  "GIT",
  "REACT",
  "POSTGRESQL",
  "TYPESCRIPT",
  "AWS-S3",
  "BUN",
  "HTTP",
  "CSS",
  "HTML",
  "TCP",
  "NODE",
  "VITE",
];
const ticket = {
  id: ticketId,
  roundId,
  eventId,
  participantId: userId,
  createdAt: now,
  cells: values.map((keyValue, index) => ({
    id: `55555555-5555-4555-8555-${String(index + 1).padStart(12, "0")}`,
    keyId: `66666666-6666-4666-8666-${String(index + 1).padStart(12, "0")}`,
    rowIndex: Math.floor(index / 5),
    row: Math.floor(index / 5),
    colIndex: (index % 5) * 2,
    column: (index % 5) * 2,
    keyValue,
    marked: index < 2,
  })),
};
const draw = {
  id: "77777777-7777-4777-8777-777777777777",
  roundId,
  sequenceNumber: 1,
  drawMode: "RANDOM",
  questionText: "Which platform packages applications in containers?",
  keyValue: "DOCKER",
  drawnAt: now,
};
const game = {
  id: roundId,
  name: round.name,
  code: "8679DE",
  status: "ACTIVE",
  createdAt: now,
  roundSequence: 1,
  draws: [
    {
      id: draw.id,
      sequenceNumber: 1,
      questionId: 1,
      prompt: draw.questionText,
      answer: draw.keyValue,
      key: draw.keyValue,
      domain: "DEVOPS",
      drawnAt: now,
    },
  ],
  claims: [],
};
const claim = {
  id: "88888888-8888-4888-8888-888888888888",
  roundId,
  participantId: userId,
  participantName: "Ari Patel",
  ticketId,
  eventId,
  eventTitle: event.title,
  patternType: "EARLY_5",
  status: "PENDING_VERIFICATION",
  rejectionReason: null,
  createdAt: now,
  verifiedAt: null,
};
const winner = {
  id: "99999999-9999-4999-8999-999999999999",
  claimId: claim.id,
  participantId: userId,
  roundId,
  eventId,
  patternType: "TOP_LINE",
  participantName: "Mira Chen",
  eventTitle: event.title,
  verifiedAt: now,
};
const participant = {
  id: userId,
  userId,
  eventId,
  name: "Ari Patel",
  email: "ari@example.test",
  externalId: "TECH-024",
  status: "ACTIVE",
  emailDeliveryStatus: "SENT",
  ...stamp,
};
const key = {
  id: ticket.cells[0].keyId,
  eventId,
  value: "DOCKER",
  normalizedValue: "DOCKER",
  ...stamp,
};
const question = {
  id: draw.id,
  roundId,
  keyId: key.id,
  keyValue: key.value,
  questionText: draw.questionText,
  ...stamp,
};
const pagination = { page: 1, limit: 20, total: 1, totalPages: 1 };
const list = (data: unknown[]) => ({
  data,
  pagination: { ...pagination, total: data.length },
});
const pageOf = (data: unknown[]) => ({
  data,
  total: data.length,
  page: 1,
  limit: 20,
});

/** Representative transport fixtures only; no application state is mutated. */
export async function mockThemeApi(
  page: Page,
  role: "PARTICIPANT" | "SUPER_ADMIN",
  options: { roundStatus?: "READY" | "ACTIVE" } = {},
) {
  await page.routeWebSocket("**/api/v1/ws*", (socket) => socket.close());
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    const currentRound = { ...round, status: options.roundStatus ?? "ACTIVE" };
    const currentGame = { ...game, status: options.roundStatus ?? "ACTIVE" };
    const playGame = {
      ...currentGame,eventId,isBroadcast:true,sequenceNumber:1,closingSequence:null,score:0,
      ticket:role==='PARTICIPANT'?{...ticket,cells:ticket.cells.map((c,index)=>({...c,term:c.keyValue,number:index+1}))}:null,
      draws:[{id:draw.id,sequence:1,prompt:draw.questionText,answer:draw.keyValue,number:1,category:'DevOps',codeSnippet:null,revealed:true,drawnAt:now}],
      wins:[],standings:[],patterns:patternTypes.map(pattern=>({pattern,points:pattern==='FULL_HOUSE'?50:pattern==='EARLY_5'?10:pattern==='FOUR_CORNERS'?20:30,closed:false})),
      ...(role==='SUPER_ADMIN'?{bank:[{id:question.id,keyId:key.id,number:1,term:key.value,clue:question.questionText,category:'DevOps',codeSnippet:null}]}:{}),
    };
    if(path==='/participant/play/join'&&route.request().postDataJSON()?.code!=='8679DE') {
      await route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({error:{code:'NOT_FOUND',message:'Invalid ticket code'}})});return;
    }
    const responses: Record<string, unknown> = {
      '/play/current':{game:playGame,games:[playGame]},
      '/play/rounds':{games:[playGame]},
      [`/play/rounds/${roundId}`]:playGame,
      '/participant/play/join':playGame,
      '/live/play':{game:{...playGame,ticket:null,score:null,bank:undefined},games:[playGame]},
      "/me": {
        user: {
          id: userId,
          name: "Ari Patel",
          email: "ari@example.test",
          role,
          status: "ACTIVE",
          eventId,
        },
      },
      "/active-game": { game: currentGame, games: [currentGame] },
      "/participant/event": { event },
      "/participant/round/current": { round: currentRound },
      "/participant/ticket": { ticket },
      "/participant/draws": pageOf([draw]),
      "/participant/claims": pageOf([claim]),
      "/participant/wins": pageOf([winner]),
      "/admin/events": list([event]),
      [`/admin/events/${eventId}`]: { event },
      "/admin/rounds": list([round]),
      [`/admin/rounds/${roundId}`]: { round },
      "/admin/keys": list([key]),
      "/admin/questions": list([question]),
      "/admin/participants": list([participant]),
      [`/admin/participants/${userId}`]: { participant },
      "/admin/claims": pageOf([claim]),
      [`/admin/claims/${claim.id}`]: { claim },
      "/admin/winners": pageOf([winner]),
      "/admin/audit": {
        items: [
          {
            id: draw.id,
            actorId: userId,
            actorType: "ADMIN",
            action: "DRAW_CREATED",
            resourceType: "ROUND",
            resourceId: roundId,
            metadata: { sequenceNumber: 1 },
            createdAt: now,
          },
        ],
        limit: 20,
        hasMore: false,
        nextCursor: null,
      },
      "/super-admin/admins": list([
        {
          id: userId,
          profileId: participant.id,
          name: "Ari Patel",
          email: participant.email,
          role: "SUPER_ADMIN",
          status: "ACTIVE",
          ...stamp,
        },
      ]),
      "/super-admin/system": {
        version: "1.0.0",
        readiness: { status: "ready", dependencies: { database: "available" } },
        recoveryRequiredRounds: 0,
        latestMigration: { version: "001", appliedAt: now },
      },
      "/live/event": { event },
      "/live/round": { round },
      "/live/draws": {
        roundId,
        data: [{ ...draw, question: draw.questionText, key: draw.keyValue }],
      },
      "/live/winners": {
        roundId,
        data: Object.fromEntries(
          patternTypes.map((pattern) => [
            pattern,
            pattern === "TOP_LINE"
              ? [
                  {
                    id: winner.id,
                    roundId,
                    pattern,
                    participantName: winner.participantName,
                    verifiedAt: now,
                  },
                ]
              : [],
          ]),
        ),
      },
    };
    const response = responses[path];
    await route.fulfill({
      status: response ? 200 : 404,
      contentType: "application/json",
      body: JSON.stringify(
        response ?? {
          error: { code: "NOT_FOUND", message: "No fixture for this endpoint" },
        },
      ),
    });
  });
}
