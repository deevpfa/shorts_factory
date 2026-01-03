import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import Database from 'better-sqlite3';

const out = '/data/out';
const dbPath = '/data/db/shorts.db';

const db = new Database(dbPath);

const videos = db.prepare(`
  SELECT id, source_path, transcription FROM videos
  WHERE status = 'edited' AND transcription IS NOT NULL
  LIMIT 1
`).all();

// Generar ASS con estilo MrBeast
function generateMrBeastASS(words, videoWidth = 1080, videoHeight = 1920) {
  const header = `[Script Info]
Title: MrBeast Style Captions
ScriptType: v4.00+
PlayResX: ${videoWidth}
PlayResY: ${videoHeight}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: MrBeast,Impact,90,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,2,2,10,10,350,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = [];

  // Mostrar 2-3 palabras a la vez para efecto MrBeast
  const wordsPerGroup = 2;

  for (let i = 0; i < words.length; i += wordsPerGroup) {
    const group = words.slice(i, i + wordsPerGroup);
    if (group.length === 0) continue;

    const start = group[0].start;
    const end = group[group.length - 1].end;
    const text = group.map(w => w.word.toUpperCase()).join(' ');

    const startTime = formatASSTime(start);
    const endTime = formatASSTime(end);

    // Efecto de scale pop-in estilo MrBeast
    events.push(`Dialogue: 0,${startTime},${endTime},MrBeast,,0,0,0,,{\\fscx120\\fscy120\\t(0,50,\\fscx100\\fscy100)}${text}`);
  }

  return header + events.join('\n');
}

function formatASSTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

for (const video of videos) {
  const inputPath = video.source_path;
  const outputPath = path.join(out, `${video.id}_captioned.mp4`);
  const assPath = path.join(out, `${video.id}.ass`);

  try {
    const transcription = JSON.parse(video.transcription);

    if (!transcription.words || transcription.words.length === 0) {
      console.log('No words found for', video.id);
      continue;
    }

    // Generar archivo ASS
    const assContent = generateMrBeastASS(transcription.words);
    fs.writeFileSync(assPath, assContent);

    // Agregar subtitulos al video
    const ffmpegCmd = `ffmpeg -y \
      -i "${inputPath}" \
      -vf "ass=${assPath}" \
      -c:v libx264 -preset fast -crf 23 \
      -c:a copy \
      "${outputPath}"`;

    execSync(ffmpegCmd, { stdio: 'inherit' });

    db.prepare(`
      UPDATE videos SET status = 'captioned', source_path = ? WHERE id = ?
    `).run(outputPath, video.id);

    // Limpiar archivos intermedios
    if (fs.existsSync(inputPath) && inputPath !== outputPath) {
      fs.unlinkSync(inputPath);
    }
    fs.unlinkSync(assPath);

    console.log('captioned', video.id);
  } catch (err) {
    console.error('Failed to caption', video.id, err.message);
  }
}

db.close();
