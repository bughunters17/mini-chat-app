FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy server package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy server source
COPY . .

# Expose WebSocket + API port
EXPOSE 3000

# Start server
CMD ["npm", "start"]
