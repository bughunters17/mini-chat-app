FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy server package files
COPY package*.json ./

# Install build deps for better-sqlite3
RUN apk add --no-cache \
    python3 \
    make \
    g++

# Install dependencies build tools and sqlite3
RUN npm install

# Copy server source
COPY . .

# Expose WebSocket + API port
EXPOSE 3000

# Start server
CMD ["npm", "start"]
