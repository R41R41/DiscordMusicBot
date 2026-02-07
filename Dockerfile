# Discord Music Bot - Dockerfile
FROM node:20-slim

# FFmpegのインストール
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# バックエンドの依存関係
COPY package*.json ./
RUN npm ci --only=production

# Web UIの依存関係
COPY web-ui/package*.json ./web-ui/
RUN cd web-ui && npm ci --only=production

# ソースコードのコピー
COPY . .

# Web UIのビルド
RUN cd web-ui && npm run build

# ポートの公開
EXPOSE 3001 5173

# 起動
CMD ["npm", "run", "dev"]
