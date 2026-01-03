# Shorts Factory

Sistema automatizado para descubrir, procesar y publicar videos cortos en TikTok, Instagram y YouTube.

## Descripcion

Shorts Factory es una fabrica automatizada de shorts que:

1. **Descubre contenido**: Busca videos virales en Reddit (subreddit `/r/nextfuckinglevel`)
2. **Descarga**: Guarda automaticamente los videos mas populares
3. **Procesa**: Combina video viral + tu cara, agrega subtitulos estilo MrBeast
4. **Publica**: Sube automaticamente via Metricool a TikTok, Instagram y YouTube

## Layout del Video Final

```
┌─────────────────────┐
│                     │
│   Video Viral       │  70% (1080x1344)
│   (contenido)       │
│                     │
├─────────────────────┤
│   Face Video        │  30% (1080x576)
│   (tu cara)         │
└─────────────────────┘
```

Subtitulos estilo MrBeast:
- Fuente: Impact, 90px
- Texto en mayusculas
- Efecto pop-in animado
- 2 palabras a la vez

## Deploy en Render

### Paso 1: Subir a GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/TU_USUARIO/shorts-factory.git
git push -u origin main
```

### Paso 2: Crear servicio en Render

1. Ir a [render.com](https://render.com) y registrarse con GitHub
2. Click en **New** → **Background Worker**
3. Conectar tu repositorio `shorts-factory`
4. Configurar:
   - **Name**: `shorts-factory`
   - **Region**: Oregon (o la mas cercana)
   - **Branch**: `main`
   - **Runtime**: Docker
   - **Plan**: Standard ($25/mes - necesario para Docker)

### Paso 3: Agregar Persistent Disk

1. En tu servicio, ir a **Disks**
2. Click **Add Disk**:
   - **Name**: `data`
   - **Mount Path**: `/data`
   - **Size**: 10 GB

### Paso 4: Configurar variables de entorno

En **Environment**, agregar:

| Variable | Valor |
|----------|-------|
| `METRICOOL_TOKEN` | Tu token de Metricool |
| `METRICOOL_USER_ID` | Tu user ID de Metricool |
| `METRICOOL_BLOG_ID` | Tu blog ID de Metricool |
| `METRICOOL_PLATFORMS` | `tiktok,instagram,youtube` |
| `FACE_VIDEO_PATH` | `/data/face/face.mp4` |
| `LANG` | `en` |

### Paso 5: Subir tu video de cara

Una vez deployado, usar Render Shell para subir tu video:

```bash
# Opcion 1: Desde URL
curl -o /data/face/face.mp4 "https://tu-url/face.mp4"

# Opcion 2: Incluirlo en el repo (si es pequeño)
# Ponerlo en data/face/face.mp4 antes de hacer push
```

### Paso 6: Deploy

Click en **Create Background Worker**. Render va a:
1. Construir la imagen Docker
2. Montar el disco en `/data`
3. Iniciar el scheduler que ejecuta los jobs

## Obtener credenciales de Metricool

1. Ir a [Metricool](https://app.metricool.com) → Configuracion → API
2. Copiar el **token** (requiere plan Advanced o Custom)
3. Para `userId` y `blogId`:
   - Abrir DevTools (F12) en Metricool
   - Ir a Network → buscar cualquier request
   - Los IDs aparecen en los parametros de la URL

## Jobs y Frecuencias

| Job | Frecuencia | Descripcion |
|-----|------------|-------------|
| `viral_finder` | Cada 30 min | Busca videos virales en Reddit |
| `collector` | Cada 2 min | Mueve videos a trabajo |
| `transcribe` | Cada 5 min | Transcribe audio con Whisper |
| `editor` | Cada 5 min | Combina video + cara |
| `captioner` | Cada 10 min | Agrega subtitulos |
| `publisher` | Cada 15 min | Publica via Metricool |
| `cleaner` | Cada 24 hs | Limpia archivos viejos |

## Limpieza automatica

El `cleaner.js` se ejecuta diariamente y:
- Borra videos publicados inmediatamente
- Limpia archivos huerfanos:
  - `/data/work` - mayores a 1 dia
  - `/data/out` - mayores a 1 dia
  - `/data/temp` - mayores a 12 horas
  - `/data/inbox` - mayores a 7 dias

## Desarrollo local

```bash
# Construir
docker compose build

# Ejecutar
docker compose up -d

# Ver logs
docker compose logs -f

# Detener
docker compose down
```

## Estructura del Proyecto

```
/shorts-factory/
├── src/
│   ├── scheduler.js          # Ejecuta jobs a intervalos
│   └── jobs/
│       ├── viral_finder.js   # Descubre videos en Reddit
│       ├── collector.js      # Registra videos en DB
│       ├── transcribe.js     # Transcribe con Whisper
│       ├── editor.js         # Combina video + cara
│       ├── captioner.js      # Agrega subtitulos
│       ├── publisher.js      # Publica via Metricool
│       └── cleaner.js        # Limpieza de archivos
├── data/                     # Volumen persistente
│   ├── inbox/
│   ├── work/
│   ├── out/
│   ├── published/
│   ├── db/
│   └── face/
├── Dockerfile
├── docker-compose.yml
├── render.yaml
├── package.json
└── .env.example
```

## Costos estimados (Render)

- **Background Worker Standard**: $25/mes
- **Persistent Disk 10GB**: $2.50/mes
- **Total**: ~$27.50/mes
