FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY worker.mjs motion-engine.mjs speech-timeline.mjs ./
ENV NODE_ENV=production
CMD ["node", "worker.mjs"]
