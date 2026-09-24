# Debian-based image: Chromium required by whatsapp-web.js / Puppeteer.
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    fonts-noto-cjk \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY index.js ./

ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV WHATSAPP_SESSION_PATH=/data/whatsapp-session

RUN mkdir -p /data/whatsapp-session && chown -R node:node /data /app
USER node

EXPOSE 4010
ENV PORT=4010

CMD ["node", "index.js"]
