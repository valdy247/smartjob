FROM node:22-alpine
RUN apk add --no-cache ffmpeg font-dejavu
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY worker.mjs ./
ENV NODE_ENV=production
CMD ["node", "worker.mjs"]
