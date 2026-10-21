FROM node:20-slim

# Install FFmpeg and FFprobe
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency manifests
COPY package*.json tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Entrypoint for stdio MCP execution
ENTRYPOINT ["node", "dist/index.js"]
