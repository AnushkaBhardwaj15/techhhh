# Game-only administration

User-confirmed update, 27 October 2026:

- Games are the only product-level unit. The app exposes no Event/Round setup.
  Old management links return to the game dashboard. Existing database relationships
  remain internal for backwards compatibility and to preserve historical records.
- Imported participants form one shared account pool and may join any game by code.
  Tickets, joins, claims and winners remain separate for each game.
- Claims and Winners are opened from the relevant game, with server-side game
  filtering before pagination. Their pages show a game selector, never mixed results.
- CSV imports need no Event selection. Supplied-password imports precheck duplicates,
  hash with at most two workers, and bulk insert accounts, profiles and audit records.
  Password hashes retain Argon2id parameters; existing credentials are not overwritten.
- A completed import clears file selection, preview and confirmation controls,
  leaving its result report. The operator must select a new file for another import.
- Repeated diagnostics are rate-limited, and aggressive polling is reduced. Actual
  errors remain visible. WebSocket events still trigger immediate snapshot refresh.
- Staff can delete unused games. Games with draws, joins, marks or results are
  archived and hidden, retaining history. Running/paused games must be ended first.
- Recovery means a server restart interrupted a running game; recovery validates
  saved state before continuing. Legacy marks for undrawn keys are removed inside
  the recovery transaction and the cleanup count is audited. Cross-ticket marks,
  invalid draws/winners, and another active game still block recovery. UI terminology is “Recover Game”.

Verification is limited to focused recovery regression tests, builds/typechecking
and a running API check, as explicitly
requested by the user. No broad test run or load-testing loop is authorized for this
change. Earlier browser-suite merge blockers remain documented separately.
