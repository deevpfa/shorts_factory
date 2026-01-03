import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { notifyError } from '../lib/notify.js';

const dataPath = process.env.DATA_PATH || '/data';
const out = `${dataPath}/out`;

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

// Obtener todos los _edited.mp4 que tengan .json pero no sean _captioned.mp4
const videos = fs.readdirSync(out)
  .filter(f => f.endsWith('_edited.mp4'))
  .filter(f => {
    const baseName = f.replace('_edited.mp4', '');
    const jsonPath = path.join(out, `${baseName}.json`);
    const captionedPath = path.join(out, `${baseName}_captioned.mp4`);
    return fs.existsSync(jsonPath) && !fs.existsSync(captionedPath);
  });

console.log('Videos to caption:', videos.length);

for (const videoFile of videos) {
  const baseName = videoFile.replace('_edited.mp4', '');
  const inputPath = path.join(out, videoFile);
  const jsonPath = path.join(out, `${baseName}.json`);
  const assPath = path.join(out, `${baseName}.ass`);
  const outputPath = path.join(out, `${baseName}_captioned.mp4`);

  console.log('Captioning:', videoFile);

  try {
    const transcription = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

    // Palabras que indican que es solo música/sonido, no speech
    const musicKeywords = ['music', 'música', 'musica', '[music]', '♪', '♫'];
    const isOnlyMusic = !transcription.words ||
      transcription.words.length === 0 ||
      (transcription.words.length <= 3 &&
        transcription.words.every(w =>
          musicKeywords.some(k => w.word.toLowerCase().includes(k))
        )
      );

    if (isOnlyMusic) {
      console.log('Only music detected, copying without captions:', baseName);
      // Copiar el video sin subtítulos
      fs.copyFileSync(inputPath, outputPath);
      // Eliminar el _edited.mp4 ya que tenemos _captioned.mp4
      fs.unlinkSync(inputPath);
      fs.unlinkSync(jsonPath);
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

    // Limpiar archivos intermedios
    fs.unlinkSync(inputPath);  // Eliminar _edited.mp4
    fs.unlinkSync(assPath);    // Eliminar .ass
    fs.unlinkSync(jsonPath);   // Eliminar .json

    console.log('Done:', baseName);
  } catch (err) {
    await notifyError('captioner', err, { video: baseName });
    // Limpiar .ass si quedó
    if (fs.existsSync(assPath)) {
      fs.unlinkSync(assPath);
    }
  }
}

console.log('Captioning finished');
