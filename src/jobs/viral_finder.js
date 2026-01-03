import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const dataPath = process.env.DATA_PATH || '/data';
const inbox = `${dataPath}/inbox`;
const temp = `${dataPath}/temp`;
fs.mkdirSync(inbox, { recursive: true });
fs.mkdirSync(temp, { recursive: true });

const r = await fetch('https://www.reddit.com/r/nextfuckinglevel/top.json?t=day&limit=5', {
  headers: { 'User-Agent': 'sf' }
});
const j = await r.json();

for (const c of j.data.children) {
  const redditVideo = c.data.secure_media?.reddit_video;
  if (!redditVideo) continue;

  const id = c.data.id;
  const title = c.data.title || '';
  const finalPath = path.join(inbox, `rd_${id}.mp4`);
  const metaPath = path.join(inbox, `rd_${id}.json`);

  if (fs.existsSync(finalPath)) continue;

  // Usar HLS URL que tiene video + audio combinado
  const hlsUrl = redditVideo.hls_url;
  const fallbackUrl = redditVideo.fallback_url;

  if (!hlsUrl && !fallbackUrl) continue;

  try {
    if (hlsUrl) {
      // Descargar con ffmpeg desde HLS (incluye audio)
      const cleanHlsUrl = hlsUrl.replace(/&amp;/g, '&');
      execSync(`ffmpeg -y -i "${cleanHlsUrl}" -c:v libx264 -c:a aac -shortest "${finalPath}"`, {
        stdio: 'pipe',
        timeout: 120000
      });
      // Guardar metadata con título
      fs.writeFileSync(metaPath, JSON.stringify({ title }));
      console.log('downloaded (hls)', finalPath, '-', title.slice(0, 50));
    } else {
      // Fallback: intentar descargar video + audio separados
      const tempVideo = path.join(temp, `${id}_video.mp4`);
      const tempAudio = path.join(temp, `${id}_audio.mp4`);

      // Descargar video
      const videoRes = await fetch(fallbackUrl);
      await new Promise(ok => {
        const w = fs.createWriteStream(tempVideo);
        videoRes.body.pipe(w);
        w.on('finish', ok);
      });

      // Intentar descargar audio
      const baseUrl = fallbackUrl.split('/CMAF_')[0].split('/DASH_')[0] + '/';
      let audioDownloaded = false;

      for (const audioFile of ['DASH_AUDIO_128.mp4', 'DASH_audio.mp4', 'audio.mp4', 'audio']) {
        try {
          const audioUrl = baseUrl + audioFile;
          const audioRes = await fetch(audioUrl);
          if (audioRes.ok) {
            await new Promise(ok => {
              const w = fs.createWriteStream(tempAudio);
              audioRes.body.pipe(w);
              w.on('finish', ok);
            });
            audioDownloaded = true;
            break;
          }
        } catch (e) {}
      }

      if (audioDownloaded) {
        execSync(`ffmpeg -y -i "${tempVideo}" -i "${tempAudio}" -c:v copy -c:a aac -shortest "${finalPath}"`, {
          stdio: 'pipe'
        });
      } else {
        fs.renameSync(tempVideo, finalPath);
        console.log('warning: no audio found for', id);
      }

      if (fs.existsSync(tempVideo)) fs.unlinkSync(tempVideo);
      if (fs.existsSync(tempAudio)) fs.unlinkSync(tempAudio);

      // Guardar metadata con título
      fs.writeFileSync(metaPath, JSON.stringify({ title }));
      console.log('downloaded (fallback)', finalPath, '-', title.slice(0, 50));
    }
  } catch (err) {
    console.error('Failed to download', id, err.message);
    // Limpiar temporales
    const tempVideo = path.join(temp, `${id}_video.mp4`);
    const tempAudio = path.join(temp, `${id}_audio.mp4`);
    if (fs.existsSync(tempVideo)) fs.unlinkSync(tempVideo);
    if (fs.existsSync(tempAudio)) fs.unlinkSync(tempAudio);
  }
}
