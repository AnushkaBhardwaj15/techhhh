FROM oven/bun:1.2-alpine

WORKDIR /app

# Copy dependency manifests
COPY package.json ./
COPY bun.lock* ./

# Install dependencies
RUN bun install

# Copy source files
COPY . .

# Expose default application port
EXPOSE 3000

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

# Start server
CMD ["bun", "src/server.ts"]
