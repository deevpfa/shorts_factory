import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const inbox = '/data/inbox';
const work = '/data/work';
const dbPath = '/data/db/shorts.db';

fs.mkdirSync(work, { recursive: true });
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY,
    source_path TEXT,
    status TEXT DEFAULT 'collected',
    title TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    transcription TEXT,
    description TEXT,
    published_at TEXT
  )
`);

// Add description column if it doesn't exist (migration for existing DBs)
try {
  db.exec(`ALTER TABLE videos ADD COLUMN description TEXT`);
} catch (e) {
  // Column already exists, ignore
}

const files = fs.readdirSync(inbox).filter(f => f.endsWith('.mp4'));

for (const file of files) {
  const id = path.basename(file, '.mp4');
  const srcPath = path.join(inbox, file);
  const destPath = path.join(work, file);
  const metaPath = path.join(inbox, `${id}.json`);

  const existing = db.prepare('SELECT id FROM videos WHERE id = ?').get(id);
  if (existing) continue;

  // Leer título del archivo de metadata si existe
  let title = id;
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      title = meta.title || id;
      fs.unlinkSync(metaPath); // Limpiar archivo de metadata
    } catch (e) {}
  }

  fs.renameSync(srcPath, destPath);

  db.prepare(`
    INSERT INTO videos (id, source_path, status, title)
    VALUES (?, ?, 'collected', ?)
  `).run(id, destPath, title);

  console.log('collected', id, '-', title.slice(0, 50));
}

db.close();
