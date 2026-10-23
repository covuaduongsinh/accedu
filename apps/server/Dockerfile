# AccEdu Platform server — build từ thư mục gốc repo: docker build -f apps/server/Dockerfile .
FROM node:24-alpine AS deps
WORKDIR /app
COPY apps/server/package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

FROM node:24-alpine
ENV NODE_ENV=production ACCEDU_DB_DIR=/app/db PORT=8080
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/server/package.json ./
COPY apps/server/src ./src
COPY platform/db/00-platform.sql ./db/00-platform.sql
COPY supabase/migrations ./db/migrations
COPY supabase/seed.sql ./db/seed.sql
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
CMD ["node", "src/main.ts"]
