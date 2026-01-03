import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const dataPath = process.env.DATA_PATH || '/data';
const out = `${dataPath}/out`;
const temp = `${dataPath}/temp`;

// Crear carpetas si no existen
fs.mkdirSync(temp, { recursive: true });

// Obtener todos los _edited.mp4 de out que no tengan .json
const videos = fs.readdirSync(out)
  .filter(f => f.endsWith('_edited.mp4'))
  .filter(f => {
    const jsonPath = path.join(out, f.replace('_edited.mp4', '.json'));
    return !fs.existsSync(jsonPath); // Solo procesar si no existe el .json
  });

console.log('Videos to transcribe:', videos.length);

for (const videoFile of videos) {
  const videoPath = path.join(out, videoFile);
  const baseName = videoFile.replace('_edited.mp4', '');
  const audioPath = path.join(temp, `${baseName}.wav`);
  const jsonPath = path.join(out, `${baseName}.json`);

  console.log('Transcribing:', videoFile);

  // Extraer audio
  try {
    execSync(`ffmpeg -y -i "${videoPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${audioPath}" 2>&1`, {
      stdio: 'pipe'
    });
  } catch (err) {
    // Video sin audio - crear transcripcion vacia
    console.log('No audio in video, creating empty transcription:', baseName);
    fs.writeFileSync(jsonPath, JSON.stringify({ words: [], language: 'en' }));
    continue;
  }

  // Verificar que el audio tenga contenido
  const audioStats = fs.statSync(audioPath);
  if (audioStats.size < 1000) {
    console.log('Audio too short, creating empty transcription:', baseName);
    fs.writeFileSync(jsonPath, JSON.stringify({ words: [], language: 'en' }));
    fs.unlinkSync(audioPath);
    continue;
  }

  // Transcribir con faster-whisper
  const whisperScript = `
import json
from faster_whisper import WhisperModel

model = WhisperModel("base", device="cpu", compute_type="int8")
segments, info = model.transcribe("${audioPath}", word_timestamps=True)

words = []
for segment in segments:
    for word in segment.words:
        words.append({
            "word": word.word.strip(),
            "start": round(word.start, 3),
            "end": round(word.end, 3)
        })

with open("${jsonPath}", "w") as f:
    json.dump({"words": words, "language": info.language}, f)

print(f"Transcribed {len(words)} words")
`;

  try {
    // Usar el venv si existe, sino python3 directo
    const pythonCmd = fs.existsSync('/opt/whisper/bin/python3')
      ? '/opt/whisper/bin/python3'
      : fs.existsSync('.venv/bin/python3')
        ? '.venv/bin/python3'
        : 'python3';

    execSync(`${pythonCmd} -c '${whisperScript.replace(/'/g, "'\\''")}'`, {
      stdio: 'inherit'
    });

    console.log('Done:', baseName);
  } catch (err) {
    console.error('Failed to transcribe', baseName, err.message);
    // Crear JSON vacío para no bloquear el pipeline
    fs.writeFileSync(jsonPath, JSON.stringify({ words: [], language: 'en' }));
  }

  // Limpiar audio temporal
  if (fs.existsSync(audioPath)) {
    fs.unlinkSync(audioPath);
  }
}

console.log('Transcription finished');
