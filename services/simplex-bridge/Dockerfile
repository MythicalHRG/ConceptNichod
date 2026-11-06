FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY vendor ./vendor
RUN npm ci --omit=dev
COPY server.mjs ./
RUN mkdir -p /data && chown -R node:node /app /data
USER node
ENV DATA_DIR=/data
EXPOSE 7788
CMD ["npm", "start"]
