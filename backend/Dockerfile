FROM oven/bun:1.4.2@sha256:9114c058aeae42162ee16dd5084b95fe9473970bb6bcb5b232ab1630f0546895 AS dependencies
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM dependencies AS build
RUN bun install --frozen-lockfile
COPY src ./src
RUN bun build src/server.ts --outfile dist/server.js --target bun --external argon2 \
 && bun build src/db/migrate.ts --outfile dist/migrate.js --target bun \
 && bun build src/db/check.ts --outfile dist/check.js --target bun

FROM oven/bun:1.4.2@sha256:9114c058aeae42162ee16dd5084b95fe9473970bb6bcb5b232ab1630f0546895 AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=10000
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./
COPY src/db/migrations ./migrations
USER bun
EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["sh", "-c", "bun -e \"fetch('http://127.0.0.1:' + process.env.PORT + '/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
CMD ["sh", "-c", "if [ -n \"${FRONTEND_HOST:-}\" ]; then export APP_URL=\"https://${FRONTEND_HOST}\" CORS_ORIGIN=\"https://${FRONTEND_HOST}\"; fi; exec bun server.js"]
