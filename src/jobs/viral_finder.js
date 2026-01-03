import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { notifyError } from '../lib/notify.js';

const dataPath = process.env.DATA_PATH || '/data';
const inbox = `${dataPath}/inbox`;
const temp = `${dataPath}/temp`;
fs.mkdirSync(inbox, { recursive: true });
fs.mkdirSync(temp, { recursive: true });

// Buscar yt-dlp en diferentes ubicaciones
const ytdlp = fs.existsSync('/opt/whisper/bin/yt-dlp')
  ? '/opt/whisper/bin/yt-dlp'
  : 'yt-dlp';

// Términos de búsqueda para videos virales
const searchTerms = [
  'viral shorts',
  'satisfying video',
  'amazing moments',
  'incredible skills',
  'next level'
];

// Obtener un término aleatorio
const searchTerm = searchTerms[Math.floor(Math.random() * searchTerms.length)];
console.log('Searching for:', searchTerm);

// Buscar videos en las 3 plataformas
async function searchVideos() {
  const videos = [];

  // YouTube Shorts
  try {
    console.log('Searching YouTube Shorts...');
    const ytResult = execSync(
      `${ytdlp} "ytsearch10:${searchTerm} shorts" --print "%(id)s|%(title)s|%(view_count)s|%(duration)s" --no-download 2>/dev/null`,
      { encoding: 'utf8', timeout: 60000 }
    );

    for (const line of ytResult.trim().split('\n')) {
      if (!line) continue;
      const [id, title, views, duration] = line.split('|');
      const viewCount = parseInt(views) || 0;
      const dur = parseInt(duration) || 0;

      // Solo videos cortos (menos de 60 segundos) con muchas vistas
      if (dur > 0 && dur <= 60 && viewCount > 10000) {
        videos.push({
          platform: 'youtube',
          id,
          title: title || '',
          views: viewCount,
          duration: dur,
          url: `https://www.youtube.com/shorts/${id}`
        });
      }
    }
    console.log(`Found ${videos.filter(v => v.platform === 'youtube').length} YouTube videos`);
  } catch (err) {
    console.log('YouTube search failed:', err.message);
  }

  // TikTok (búsqueda limitada sin auth)
  try {
    console.log('Searching TikTok...');
    const ttResult = execSync(
      `${ytdlp} "https://www.tiktok.com/tag/${searchTerm.replace(/\s+/g, '')}" --flat-playlist --print "%(id)s|%(title)s|%(view_count)s|%(duration)s" --playlist-items 1-10 --no-download 2>/dev/null || true`,
      { encoding: 'utf8', timeout: 60000 }
    );

    for (const line of ttResult.trim().split('\n')) {
      if (!line || line.includes('ERROR')) continue;
      const [id, title, views, duration] = line.split('|');
      const viewCount = parseInt(views) || 0;
      const dur = parseInt(duration) || 0;

      if (id && viewCount > 10000) {
        videos.push({
          platform: 'tiktok',
          id,
          title: title || '',
          views: viewCount,
          duration: dur,
          url: `https://www.tiktok.com/@/video/${id}`
        });
      }
    }
    console.log(`Found ${videos.filter(v => v.platform === 'tiktok').length} TikTok videos`);
  } catch (err) {
    console.log('TikTok search skipped:', err.message);
  }

  return videos;
}

// Descargar video con yt-dlp
async function downloadVideo(video) {
  const prefix = video.platform === 'youtube' ? 'yt' : video.platform === 'tiktok' ? 'tt' : 'tw';
  const finalPath = path.join(inbox, `${prefix}_${video.id}.mp4`);
  const metaPath = path.join(inbox, `${prefix}_${video.id}.json`);

  // Skip si ya existe
  if (fs.existsSync(finalPath)) {
    console.log('Already exists:', finalPath);
    return false;
  }

  try {
    console.log(`Downloading ${video.platform}: ${video.title.slice(0, 40)}... (${video.views.toLocaleString()} views)`);

    execSync(
      `${ytdlp} "${video.url}" -f "bestvideo[height<=1080]+bestaudio/best[height<=1080]" --merge-output-format mp4 -o "${finalPath}" --no-playlist 2>&1`,
      { stdio: 'pipe', timeout: 120000 }
    );

    // Guardar metadata
    fs.writeFileSync(metaPath, JSON.stringify({
      title: video.title,
      platform: video.platform,
      views: video.views,
      url: video.url
    }));

    console.log('Downloaded:', path.basename(finalPath));
    return true;
  } catch (err) {
    console.error(`Failed to download ${video.id}:`, err.message);
    // Limpiar archivo parcial
    if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
    return false;
  }
}

// Main
try {
  const videos = await searchVideos();

  if (videos.length === 0) {
    console.log('No videos found');
    process.exit(0);
  }

  // Ordenar por vistas (más vistas primero)
  videos.sort((a, b) => b.views - a.views);

  console.log(`\nTop videos by views:`);
  videos.slice(0, 10).forEach((v, i) => {
    console.log(`${i + 1}. [${v.platform}] ${v.views.toLocaleString()} views - ${v.title.slice(0, 50)}`);
  });

  // Descargar los top 5 con más vistas
  let downloaded = 0;
  const maxDownloads = 5;

  for (const video of videos) {
    if (downloaded >= maxDownloads) break;

    const success = await downloadVideo(video);
    if (success) downloaded++;
  }

  console.log(`\nDownloaded ${downloaded} videos`);
} catch (err) {
  await notifyError('viral_finder', err, { search: searchTerm });
}
