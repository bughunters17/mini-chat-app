FROM node:20-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && npm install --omit=dev --no-audit --no-fund \
 && rm -rf /var/lib/apt/lists/*

COPY . .

EXPOSE 3000
CMD ["npm", "start"]
