FROM node:22-bookworm-slim AS build

WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY apps/backend apps/backend
WORKDIR /app/apps/backend
RUN npx prisma generate && npx tsc -p tsconfig.docker.json

FROM node:22-bookworm-slim

WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=8080

COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/package.json /app/package-lock.json /app/
COPY --from=build /app/apps/backend/package.json /app/apps/backend/package.json
COPY --from=build /app/apps/backend/dist /app/apps/backend/dist
COPY --from=build /app/apps/backend/prisma /app/apps/backend/prisma
COPY --from=build /app/apps/backend/prisma.config.ts /app/apps/backend/prisma.config.ts
COPY apps/backend/docker-entrypoint.sh /app/apps/backend/docker-entrypoint.sh
RUN chmod +x /app/apps/backend/docker-entrypoint.sh

WORKDIR /app/apps/backend
EXPOSE 8080
ENTRYPOINT ["/app/apps/backend/docker-entrypoint.sh"]
