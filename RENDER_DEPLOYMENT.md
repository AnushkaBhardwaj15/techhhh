# Render deployment

The root `render.yaml` Blueprint provisions the complete application in Singapore:

- Managed PostgreSQL 16 (`basic-256mb`)
- Backend Docker web service (`0.5c-512mb`), with migrations run before each deploy
- Frontend Docker web service (`0.5c-512mb`), proxying REST, health checks, and WebSockets to the backend over Render's private network

These are paid Render plans. At current listed rates, the two `0.5c-512mb` services are $7/month each and `basic-256mb` PostgreSQL is $6/month, for about $20/month before bandwidth or extra storage. Review current prices and database backup options in the Render Dashboard before creating the Blueprint. Render assigns the frontend hostname; the backend uses it for `APP_URL` and credentialed CORS. The browser talks to one origin, and WebSocket upgrades for `/api/v1/ws` and `/api/v1/live/ws` pass through Nginx.

## Create the Blueprint

1. Push this repository and `render.yaml` to the Git branch you intend to deploy.
2. In the Render Dashboard, create a new Blueprint instance for the GitHub repository and select `render.yaml`.
3. Review the three proposed resources and their plans. Supply a unique, random `SUPER_ADMIN_BOOTSTRAP_SECRET` of at least 32 characters when prompted. Render generates the database connection string, JWT secret, and session secret.
4. Create the resources and wait for the database, backend migration, and frontend health checks to complete.
5. Open the frontend's `onrender.com` URL. Use the one-time bootstrap secret to create the initial Super Admin, then unset `SUPER_ADMIN_BOOTSTRAP_SECRET` in the backend service.

Email delivery is optional in the current environment schema. Configure `EMAIL_PROVIDER_API_KEY`, `EMAIL_PROVIDER_URL`, and `EMAIL_FROM` in the backend service if the event needs email-based workflows. If you attach a custom frontend domain, update the backend's `FRONTEND_HOST` to that hostname and redeploy so `APP_URL` and CORS match it.

The local build does not verify the Render account, billing, TLS, WebSocket upgrades, session cookies, email provider, or event rehearsal. Verify those against the live services before using the deployment for an event.
