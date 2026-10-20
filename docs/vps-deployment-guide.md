# VPS Docker Deployment Guide — Tech Tombola

This guide explains how to deploy the entire Tech Tombola system (Frontend, Backend, and PostgreSQL) on any Linux Virtual Private Server (VPS) (e.g., DigitalOcean, Hetzner, AWS EC2, Linode, OVH) using Docker Compose.

---

## 1. Architecture Overview

```text
[ Browser / Participant / Admin ]
               │
               ▼ HTTP (:80) / WebSocket (/ws)
┌─────────────────────────────────────────────────────────────┐
│ Docker Network (techtombola-net)                            │
│                                                             │
│  ┌───────────────────────┐                                  │
│  │ frontend (Nginx 1.27) │ :80 (Public)                     │
│  │ - Static React SPA    │                                  │
│  │ - Proxies /api/ & /ws │                                  │
│  └───────────┬───────────┘                                  │
│              │ proxy_pass                                   │
│              ▼ :3000 (Internal)                             │
│  ┌───────────────────────┐                                  │
│  │ backend (Bun 1.4.2)   │                                  │
│  │ - Fastify REST API    │                                  │
│  │ - WebSocket Hub       │                                  │
│  └───────────┬───────────┘                                  │
│              │ postgres://                                  │
│              ▼ :5432 (Internal)                             │
│  ┌───────────────────────┐      ┌────────────────────────┐  │
│  │ postgres:16-alpine    │ ◄─── │ migrate (One-off task) │  │
│  └───────────┬───────────┘      │ - Drizzle migrations   │  │
│              │                  └────────────────────────┘  │
│              ▼                                              │
│  [ postgres_data volume ]                                   │
└─────────────────────────────────────────────────────────────┘
```

- **Single Ingress Port**: The frontend Nginx container serves the static React application and seamlessly proxies `/api/v1` and `/ws` to the backend. No cross-origin CORS or separate port configuration is required.
- **Automated Schema Migrations**: The `migrate` container runs before the backend starts, ensuring all 15 database tables, triggers, and indices are in place.
- **Persistent Data**: Database state is preserved across container restarts in the `postgres_data` volume.

---

## 2. VPS Prerequisites

Ensure your VPS has Docker and Docker Compose (v2) installed:

```bash
# Ubuntu/Debian quick Docker installation
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Verify installation
docker --version
docker compose version
```

---

## 3. Quick Start (5 Steps)

### Step 1: Clone the repository onto your VPS
```bash
git clone https://github.com/saransh-sh/TechTombola-muacm.git
cd TechTombola-muacm
```

### Step 2: Configure Environment Variables
Copy the template `.env.example` to `.env`:
```bash
cp .env.example .env
```

Generate secure 32+ character secrets:
```bash
openssl rand -hex 24
```
Edit `.env` (`nano .env`):
- Set `POSTGRES_PASSWORD` to a strong database password.
- Set `JWT_SECRET` and `SESSION_SECRET` to the generated 32+ char strings.
- Set `SUPER_ADMIN_BOOTSTRAP_SECRET` to a random 32+ char string (used once to create your Super Admin account).
- Set `APP_URL` and `CORS_ORIGIN` to your VPS IP or domain (e.g. `http://YOUR_VPS_IP` or `https://tombola.yourdomain.com`).

### Step 3: Launch Containers
Run:
```bash
docker compose up -d --build
```

Docker will:
1. Pull PostgreSQL 16 image and initialize the database.
2. Build the backend Bun image and run database migrations.
3. Start the Fastify backend server.
4. Build the React frontend production bundle and start Nginx on port 80.

### Step 4: Verify System Health
Check container status:
```bash
docker compose ps
```
All containers should report `healthy` or `running`.

Verify HTTP and database readiness:
```bash
curl http://localhost/health
# Output: {"status":"ok","timestamp":"..."}

curl http://localhost/ready
# Output: {"status":"ready","database":"connected","migrations":"up_to_date"}
```

Open your browser at `http://YOUR_VPS_IP` to see the Tech Tombola application!

### Step 5: Bootstrap the Initial Super Admin Account
With `SUPER_ADMIN_BOOTSTRAP_SECRET` configured in `.env`, create the first Super Admin:

```bash
curl -X POST http://localhost/api/v1/auth/bootstrap \
  -H "Content-Type: application/json" \
  -d '{
    "bootstrapSecret": "YOUR_SUPER_ADMIN_BOOTSTRAP_SECRET",
    "name": "Head Organizer",
    "email": "superadmin@yourdomain.com",
    "password": "YourSecurePassword123!"
  }'
```

After creating the account, remove or comment out `SUPER_ADMIN_BOOTSTRAP_SECRET` in `.env` and restart the backend container:
```bash
docker compose restart backend
```

---

## 4. Setting up Free SSL with Let's Encrypt (Optional but Recommended)

If you have a domain pointed to your VPS (e.g., `tombola.example.com`), you can put [Caddy](https://caddyserver.com/) in front of Docker for automatic HTTPS:

### Method A: Install Caddy on the VPS Host
1. Set `PORT=8080` in `.env` and restart docker compose:
   ```bash
   # In .env: PORT=8080
   docker compose up -d
   ```
2. Install Caddy:
   ```bash
   sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
   sudo apt update && sudo apt install caddy
   ```
3. Edit `/etc/caddy/Caddyfile`:
   ```caddy
   tombola.example.com {
       reverse_proxy localhost:8080
   }
   ```
4. Reload Caddy:
   ```bash
   sudo systemctl reload caddy
   ```
Caddy will automatically provision and renew a Let's Encrypt SSL certificate!

---

## 5. Operations & Maintenance

### View Live Logs
```bash
# View backend logs (draws, websocket events, auth)
docker compose logs -f backend

# View frontend access logs
docker compose logs -f frontend
```

### Database Backup
Create a snapshot before each round or event:
```bash
docker exec techtombola-postgres pg_dump -U postgres techtombola > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Database Restore
```bash
cat backup_file.sql | docker exec -i techtombola-postgres psql -U postgres techtombola
```

### Stopping and Updating
```bash
# Stop containers gracefully
docker compose down

# Pull latest code and rebuild
git pull
docker compose up -d --build
```
