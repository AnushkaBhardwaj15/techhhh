# Stage 1: Build React static application
FROM oven/bun:1.4.2 AS builder
WORKDIR /app

# Copy dependency specifications and lockfile
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source code and build config
COPY . .

# Run production build (typecheck + vite build)
RUN bun run build

# Stage 2: Serve with lightweight Nginx
FROM nginx:1.27-alpine AS runtime

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Copy compiled frontend assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
ENV BACKEND_HOST=backend:3000 NGINX_ENVSUBST_FILTER=BACKEND_HOST

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
