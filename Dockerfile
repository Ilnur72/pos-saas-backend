# ─── Build stage ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Prisma uchun OpenSSL
RUN apk add --no-cache openssl libc6-compat

# package.json va lock fayl
COPY package*.json ./

RUN npm ci

# Prisma schema'lar va source
COPY prisma ./prisma
COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY src ./src

# Prisma client generatsiya (public + tenant)
RUN npx prisma generate --schema=prisma/schema.prisma \
  && npx prisma generate --schema=prisma/tenant-schema.prisma

# NestJS build
RUN npm run build

# Production dependencies (devDependencies'siz)
RUN npm prune --production

# ─── Runtime stage ──────────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache openssl libc6-compat tini

# Non-root foydalanuvchi
RUN addgroup -S app && adduser -S app -G app

COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=builder --chown=app:app /app/prisma ./prisma
COPY --chown=app:app package*.json ./

USER app

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

# tini — PID 1 sifatida ishlaydi, signallarni to'g'ri uzatadi
ENTRYPOINT ["/sbin/tini", "--"]

# Migratsiya + ishga tushirish
CMD ["sh", "-c", "npx prisma migrate deploy --schema=prisma/schema.prisma && node dist/main"]
