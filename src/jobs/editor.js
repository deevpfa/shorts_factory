import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import Database from 'better-sqlite3';

const work = '/data/work';
const out = '/data/out';
const dbPath = '/data/db/shorts.db';
const faceVideo = process.env.FACE_VIDEO_PATH || '/data/face/face.mp4';

fs.mkdirSync(out, { recursive: true });

const db = new Database(dbPath);

const videos = db.prepare(`
  SELECT id, source_path FROM videos
  WHERE status = 'transcribed'
  LIMIT 1
`).all();

console.log('Face video path:', faceVideo);
console.log('Face video exists:', fs.existsSync(faceVideo));
console.log('Videos to process:', videos.length);

for (const video of videos) {
  const inputPath = video.source_path;
  const outputPath = path.join(out, `${video.id}_edited.mp4`);

  console.log('Processing:', video.id);
  console.log('Input path:', inputPath);
  console.log('Input exists:', fs.existsSync(inputPath));

  if (!fs.existsSync(faceVideo)) {
    console.error('Face video not found:', faceVideo);
    continue;
  }

  if (!fs.existsSync(inputPath)) {
    console.error('Input video not found:', inputPath);
    continue;
  }

  // Layout vertical: video viral arriba (70%), face abajo (30%)
  // Output: 1080x1920 (9:16 vertical para shorts)
  // 70% de 1920 = 1344, 30% de 1920 = 576
  const ffmpegCmd = `ffmpeg -y \
    -i "${inputPath}" \
    -stream_loop -1 -i "${faceVideo}" \
    -filter_complex "
      [0:v]fps=30,scale=1080:1344:force_original_aspect_ratio=increase,crop=1080:1344,setsar=1[top];
      [1:v]fps=30,scale=1080:576:force_original_aspect_ratio=increase,crop=1080:576,setsar=1[bottom];
      [top][bottom]vstack=inputs=2[outv]
    " \
    -map "[outv]" \
    -map 0:a? \
    -c:v libx264 -preset fast -crf 23 \
    -c:a aac -b:a 128k \
    -shortest \
    "${outputPath}"`;

  try {
    console.log('Running ffmpeg...');
    execSync(ffmpegCmd, { stdio: 'inherit' });

    db.prepare(`
      UPDATE videos SET status = 'edited', source_path = ? WHERE id = ?
    `).run(outputPath, video.id);

    if (fs.existsSync(inputPath)) {
      fs.unlinkSync(inputPath);
    }

    console.log('edited', video.id);
  } catch (err) {
    console.error('Failed to edit', video.id, err.message);
  }
}

db.close();
