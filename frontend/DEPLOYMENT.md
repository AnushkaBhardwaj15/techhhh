# Frontend deployment

The frontend is a static Vite application. Build it with `bun run build` and publish the contents of `dist/` to a static host. The host must rewrite direct navigation to application routes to `/index.html`; fingerprinted files under `/assets/` may use long-lived immutable caching, while `index.html` should be revalidated so new releases pick up the current bundle.

## Public build settings

Copy `.env.example` to the host's build environment before running the build:

- `VITE_API_BASE_URL` is the optional REST origin. When empty, REST requests use the page origin.
- `VITE_WS_BASE_URL` is the optional WebSocket origin. When empty, the frontend uses `VITE_API_BASE_URL`, then the page origin. It applies to Participant, Admin, and Live Display sockets.

Vite embeds `VITE_*` values in the downloaded JavaScript during the build. They are public configuration, never secret storage. Do not put database credentials, mail credentials, signing keys, or session secrets in these variables or the browser bundle.

For same-origin hosting, leave both values empty and configure the host or its reverse proxy to route REST `/api/v1/*` requests and WebSocket upgrades for `/api/v1/ws` and `/api/v1/live/ws` to the backend. For separate origins, use the production HTTPS API origin and WSS origin. The backend must allow the exact frontend Origin for credentialed REST requests and WebSocket upgrades, issue HTTP-only Secure session cookies with a compatible SameSite/CSRF policy, and reject untrusted origins. Do not use wildcard CORS with credentials.

## Local production-preview smoke check

```sh
bun install --frozen-lockfile
bun run build
bunx vite preview --host 127.0.0.1 --port 4174
```

In a second terminal, verify that these deep links return the SPA document:

```sh
for path in / /login /participant/game /display /display/round /display/winner; do
  curl --fail --silent --show-error "http://127.0.0.1:4174$path" -o /dev/null
done
```

This local preview checks the built bundle and Vite's SPA fallback only. It does not verify a hosting provider, TLS, cookie behavior, REST CORS, WebSocket upgrades, or the live backend.

## Release and rollback evidence

Before publishing, record the source commit and artifact checksum; verify the public and protected deep links, sign-in/session refresh/logout, REST authorization, Participant/Admin/Public WebSocket connections, reconnect and backend-outage feedback, and browser console/network errors on the actual deployment. Run the Event rehearsal with the approved backend/PostgreSQL and physical devices, including the projector display and degraded-network recovery. Keep the last approved static artifact available and verify rollback by serving it and repeating the smoke checks. Do not mark deployment or rehearsal complete from a local build.

## Current evidence

On 2026-10-18, `bun run build` passed and Vite preview returned HTTP 200 for all six listed deep links. The preview used local static assets; no hosting provider, API/WS origin, TLS, backend service, or rollback target was configured or exercised. Deployment, backend integration, physical-device checks, and the Event rehearsal remain pending.
