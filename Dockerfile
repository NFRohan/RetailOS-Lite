FROM node:22-bookworm-slim AS app

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV AI_SERVICE_URL=http://ai-service:8001
ENV IMAGE_STORAGE_PUBLIC_BASE_URL=http://minio:9000/retailos-images
ENV S3_ENDPOINT=http://minio:9000

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000 9101

CMD ["npm", "run", "start"]
