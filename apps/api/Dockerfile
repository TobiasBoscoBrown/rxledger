# Multi-stage build for the RxLedger API. Runs as non-root, distroless-style
# slim runtime — the kind of image you'd push to ECR and run on ECS Fargate.
FROM node:20-bookworm-slim AS build
WORKDIR /repo
COPY package.json package-lock.json* turbo.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/eslint-plugin-phi/package.json packages/eslint-plugin-phi/
COPY apps/api/package.json apps/api/
RUN npm install --no-audit --no-fund --ignore-scripts
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS deps
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
RUN npm install --omit=dev --no-audit --no-fund --ignore-scripts

FROM gcr.io/distroless/nodejs20-debian12 AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/packages ./packages
COPY --from=build /repo/apps/api/src/database/migrations ./dist/database/migrations
USER 1000
EXPOSE 8787
# ECS/ALB health check hits GET /health (liveness) and GET /ready (DB readiness).
CMD ["dist/main.js"]
