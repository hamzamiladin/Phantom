FROM node:22-alpine
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace config
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/animations/package.json ./packages/animations/
COPY packages/shared/package.json ./packages/shared/
COPY apps/renderer/package.json ./apps/renderer/

# Install deps
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/ ./packages/
COPY apps/renderer/ ./apps/renderer/

WORKDIR /app/apps/renderer
ENV LOCAL_DEV=false
CMD ["pnpm", "start"]
