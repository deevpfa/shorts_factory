import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { notifyError } from '../lib/notify.js';

const dataPath = process.env.DATA_PATH || '/data';
const inbox = `${dataPath}/inbox`;
const out = `${dataPath}/out`;
const faceVideo = process.env.FACE_VIDEO_PATH || `${dataPath}/face/face.mp4`;
const backupAudio = `${dataPath}/audio/backup.mp3`;

// Crear carpetas si no existen
fs.mkdirSync(inbox, { recursive: true });
fs.mkdirSync(out, { recursive: true });

// Verificar si el video tiene audio
function hasAudio(videoPath) {
  try {
    const result = execSync(
      `ffprobe -v error -select_streams a:0 -show_entries stream=codec_type -of csv=p=0 "${videoPath}"`,
      { encoding: 'utf8' }
    );
    return result.trim().includes('audio');
  } catch {
    return false;
  }
}

// Obtener todos los .mp4 de inbox
const videos = fs.readdirSync(inbox).filter(f => f.endsWith('.mp4'));

console.log('Face video path:', faceVideo);
console.log('Face video exists:', fs.existsSync(faceVideo));
console.log('Backup audio path:', backupAudio);
console.log('Backup audio exists:', fs.existsSync(backupAudio));
console.log('Videos to process:', videos.length);

if (!fs.existsSync(faceVideo)) {
  console.error('Face video not found:', faceVideo);
  process.exit(1);
}

for (const videoFile of videos) {
  const inputPath = path.join(inbox, videoFile);
  const baseName = path.basename(videoFile, '.mp4');
  const outputPath = path.join(out, `${baseName}_edited.mp4`);

  console.log('Processing:', videoFile);

  // Obtener duración del video de entrada
  let duration;
  try {
    const durationCmd = `ffprobe -v error -show_entries format=duration -of csv=p=0 "${inputPath}"`;
    duration = parseFloat(execSync(durationCmd, { encoding: 'utf8' }).trim());
    console.log('Input duration:', duration, 'seconds');
  } catch (err) {
    console.error('Failed to get duration:', err.message);
    continue;
  }

  const videoHasAudio = hasAudio(inputPath);
  console.log('Has audio:', videoHasAudio);

  // Layout vertical: video viral arriba (70%), face abajo (30%)
  // Output: 1080x1920 (9:16 vertical para shorts)
  let ffmpegCmd;

  if (videoHasAudio) {
    // Con audio del video original
    ffmpegCmd = `ffmpeg -y \
      -i "${inputPath}" \
      -stream_loop -1 -i "${faceVideo}" \
      -filter_complex "
        [0:v]fps=30,scale=1080:1344:force_original_aspect_ratio=increase,crop=1080:1344,setsar=1[top];
        [1:v]fps=30,scale=1080:576:force_original_aspect_ratio=increase,crop=1080:576,setsar=1[bottom];
        [top][bottom]vstack=inputs=2[outv]
      " \
      -map "[outv]" \
      -map 0:a \
      -c:v libx264 -preset fast -crf 23 \
      -c:a aac -b:a 128k \
      -t ${duration} \
      "${outputPath}"`;
  } else if (fs.existsSync(backupAudio)) {
    // Sin audio en video - usar audio de backup
    console.log('Using backup audio');
    ffmpegCmd = `ffmpeg -y \
      -i "${inputPath}" \
      -stream_loop -1 -i "${faceVideo}" \
      -stream_loop -1 -i "${backupAudio}" \
      -filter_complex "
        [0:v]fps=30,scale=1080:1344:force_original_aspect_ratio=increase,crop=1080:1344,setsar=1[top];
        [1:v]fps=30,scale=1080:576:force_original_aspect_ratio=increase,crop=1080:576,setsar=1[bottom];
        [top][bottom]vstack=inputs=2[outv]
      " \
      -map "[outv]" \
      -map 2:a \
      -c:v libx264 -preset fast -crf 23 \
      -c:a aac -b:a 128k \
      -t ${duration} \
      "${outputPath}"`;
  } else {
    // Sin audio - video silencioso
    console.log('No audio available, creating silent video');
    ffmpegCmd = `ffmpeg -y \
      -i "${inputPath}" \
      -stream_loop -1 -i "${faceVideo}" \
      -filter_complex "
        [0:v]fps=30,scale=1080:1344:force_original_aspect_ratio=increase,crop=1080:1344,setsar=1[top];
        [1:v]fps=30,scale=1080:576:force_original_aspect_ratio=increase,crop=1080:576,setsar=1[bottom];
        [top][bottom]vstack=inputs=2[outv]
      " \
      -map "[outv]" \
      -c:v libx264 -preset fast -crf 23 \
      -t ${duration} \
      "${outputPath}"`;
  }

  try {
    console.log('Running ffmpeg...');
    execSync(ffmpegCmd, { stdio: 'inherit' });

    // Eliminar video original de inbox después de procesar
    fs.unlinkSync(inputPath);
    console.log('Done:', baseName, '-> deleted from inbox');
  } catch (err) {
    await notifyError('editor', err, { video: videoFile });
  }
}

console.log('Editor finished. Processed:', videos.length, 'videos');
