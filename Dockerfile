FROM node:20-bookworm

# Dependencias del sistema
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-venv \
    python3-pip \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Crear virtualenv para Whisper
RUN python3 -m venv /opt/whisper
ENV PATH="/opt/whisper/bin:$PATH"

# Instalar faster-whisper DENTRO del venv
RUN pip install --upgrade pip \
    && pip install faster-whisper==1.0.3

# App Node
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

COPY src ./src

# Carpetas de data
RUN mkdir -p /data/inbox /data/out /data/published /data/face /data/temp /data/audio

# Variables
ENV NODE_ENV=production
ENV DATA_PATH=/data
ENV PORT=3000

EXPOSE 3000

CMD ["node", "src/server.js"]
