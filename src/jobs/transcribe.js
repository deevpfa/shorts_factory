import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import Database from 'better-sqlite3';

const work = '/data/work';
const dbPath = '/data/db/shorts.db';

const db = new Database(dbPath);

const videos = db.prepare(`
  SELECT id, source_path FROM videos
  WHERE status = 'collected'
  LIMIT 1
`).all();

for (const video of videos) {
  const videoPath = video.source_path;
  const audioPath = path.join(work, `${video.id}.wav`);
  const jsonPath = path.join(work, `${video.id}.json`);

  // Extraer audio (skip si no tiene audio)
  try {
    execSync(`ffmpeg -y -i "${videoPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${audioPath}" 2>&1`, {
      stdio: 'pipe'
    });
  } catch (err) {
    // Video sin audio - crear transcripcion vacia y continuar
    console.log('No audio in video, skipping transcription:', video.id);
    const emptyTranscription = JSON.stringify({ words: [], language: 'en' });
    db.prepare(`
      UPDATE videos SET status = 'transcribed', transcription = ? WHERE id = ?
    `).run(emptyTranscription, video.id);
    continue;
  }

  // Transcribir con faster-whisper (genera JSON con timestamps)
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
`;

  execSync(`python3 -c '${whisperScript.replace(/'/g, "'\\''")}'`, {
    stdio: 'inherit'
  });

  // Leer transcripcion y guardar en DB
  const transcription = fs.readFileSync(jsonPath, 'utf-8');

  db.prepare(`
    UPDATE videos SET status = 'transcribed', transcription = ? WHERE id = ?
  `).run(transcription, video.id);

  // Limpiar audio temporal
  fs.unlinkSync(audioPath);

  console.log('transcribed', video.id);
}

db.close();
