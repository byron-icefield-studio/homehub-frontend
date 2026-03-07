FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json tsconfig.json vite.config.ts index.html ./
COPY src ./src
RUN npm install && npm run build

FROM alpine:3.21
WORKDIR /dist
COPY --from=builder /app/dist ./
