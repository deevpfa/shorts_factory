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
  : '.venv/bin/yt-dlp';

// Subreddits con videos cortos virales (no requieren auth)
const subreddits = [
  'oddlysatisfying',
  'nextfuckinglevel',
  'BeAmazed',
  'Damnthatsinteresting',
  'interestingasfuck',
  'toptalent',
  'woahdude',
  'blackmagicfuckery'
];

// Seleccionar un subreddit aleatorio
const subreddit = subreddits[Math.floor(Math.random() * subreddits.length)];
console.log('Searching subreddit:', subreddit);

// Buscar videos en Reddit
async function searchRedditVideos() {
  const videos = [];

  try {
    console.log('Fetching from Reddit...');

    // Usar la API JSON pública de Reddit
    const res = await fetch(`https://www.reddit.com/r/${subreddit}/hot.json?limit=25`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VideoBot/1.0)'
      }
    });

    if (!res.ok) {
      throw new Error(`Reddit API error: ${res.status}`);
    }

    const data = await res.json();

    for (const post of data.data.children) {
      const p = post.data;

      // Solo posts con video de Reddit
      const isVideo = p.is_video && p.media?.reddit_video?.fallback_url;

      if (!isVideo) continue;

      // Filtrar por upvotes (popularidad)
      if (p.ups < 1000) continue;

      // Obtener duración
      const duration = p.media?.reddit_video?.duration || 0;

      // Solo videos cortos (menos de 60 segundos)
      if (duration > 60) continue;

      videos.push({
        platform: 'reddit',
        id: p.id,
        title: p.title || '',
        views: p.ups,
        duration: duration,
        url: `https://www.reddit.com${p.permalink}`,
        permalink: p.permalink
      });
    }

    console.log(`Found ${videos.length} Reddit videos`);
  } catch (err) {
    console.log('Reddit search failed:', err.message);
  }

  return videos;
}

// Descargar video con yt-dlp
async function downloadVideo(video) {
  const prefix = 'rd';
  const finalPath = path.join(inbox, `${prefix}_${video.id}.mp4`);
  const metaPath = path.join(inbox, `${prefix}_${video.id}.json`);

  // Skip si ya existe
  if (fs.existsSync(finalPath)) {
    console.log('Already exists:', finalPath);
    return false;
  }

  try {
    console.log(`Downloading: ${video.title.slice(0, 50)}... (${video.views.toLocaleString()} upvotes)`);

    execSync(
      `${ytdlp} "${video.url}" -f "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best" --merge-output-format mp4 -o "${finalPath}" --no-playlist 2>&1`,
      { stdio: 'pipe', timeout: 120000 }
    );

    // Verificar que el archivo existe y tiene tamaño razonable
    if (!fs.existsSync(finalPath)) {
      throw new Error('File not created');
    }

    const stats = fs.statSync(finalPath);
    if (stats.size < 10000) {
      fs.unlinkSync(finalPath);
      throw new Error('File too small, likely failed');
    }

    // Guardar metadata
    fs.writeFileSync(metaPath, JSON.stringify({
      title: video.title,
      platform: video.platform,
      views: video.views,
      url: video.url,
      subreddit: subreddit
    }));

    console.log('Downloaded:', path.basename(finalPath));
    return true;
  } catch (err) {
    console.error(`Failed to download ${video.id}:`, err.message);
    if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
    return false;
  }
}

// Main
try {
  const videos = await searchRedditVideos();

  if (videos.length === 0) {
    console.log('No videos found');
    process.exit(0);
  }

  // Ordenar por upvotes (más populares primero)
  videos.sort((a, b) => b.views - a.views);

  console.log(`\nTop videos by upvotes:`);
  videos.slice(0, 10).forEach((v, i) => {
    console.log(`${i + 1}. ${v.views.toLocaleString()} upvotes - ${v.title.slice(0, 50)}`);
  });

  // Descargar solo 1 video por ejecución
  let downloaded = 0;
  const maxDownloads = 1;

  for (const video of videos) {
    if (downloaded >= maxDownloads) break;

    const success = await downloadVideo(video);
    if (success) downloaded++;
  }

  console.log(`\nDownloaded ${downloaded} videos`);
} catch (err) {
  await notifyError('viral_finder', err, { subreddit });
}
