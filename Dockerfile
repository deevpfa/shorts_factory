FROM node:20-bookworm

# Dependencias del sistema
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-venv \
    python3-pip \
    sqlite3 \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Crear virtualenv para Whisper
RUN python3 -m venv /opt/whisper
ENV PATH="/opt/whisper/bin:$PATH"

# Instalar faster-whisper DENTRO del venv
RUN pip install --upgrade pip \
    && pip install faster-whisper==1.0.3 requests

# App Node
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

COPY src ./src

# Carpetas de data
RUN mkdir -p /data/inbox /data/work /data/out /data/published /data/db /data/face /data/temp

# Ejecutar scheduler (reemplaza cron)
CMD ["node", "src/scheduler.js"]
