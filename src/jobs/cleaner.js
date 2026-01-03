import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const work = '/data/work';
const out = '/data/out';
const published = '/data/published';
const inbox = '/data/inbox';
const temp = '/data/temp';
const dbPath = '/data/db/shorts.db';

// Borrar videos publicados inmediatamente (ya no se necesitan)
const DELETE_PUBLISHED_IMMEDIATELY = true;
// O si prefieres mantenerlos unos días:
const MAX_AGE_DAYS = 1;

const db = new Database(dbPath);

// Limpiar videos publicados
const publishedVideos = db.prepare(`
  SELECT id, source_path FROM videos
  WHERE status = 'published'
  ${DELETE_PUBLISHED_IMMEDIATELY ? '' : `AND published_at < datetime('now', '-${MAX_AGE_DAYS} days')`}
`).all();

for (const video of publishedVideos) {
  if (video.source_path && fs.existsSync(video.source_path)) {
    fs.unlinkSync(video.source_path);
    console.log('deleted published video', video.source_path);
  }

  db.prepare('DELETE FROM videos WHERE id = ?').run(video.id);
  console.log('removed from db', video.id);
}

// Limpiar archivos huerfanos en todas las carpetas
const cleanOrphanFiles = (dir, maxAgeDays = 1) => {
  if (!fs.existsSync(dir)) return;

  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    try {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) continue;

      const ageMs = Date.now() - stat.mtimeMs;
      const ageDays = ageMs / (1000 * 60 * 60 * 24);

      if (ageDays > maxAgeDays) {
        fs.unlinkSync(filePath);
        console.log('cleaned orphan file', filePath);
      }
    } catch (e) {
      console.error('error cleaning', filePath, e.message);
    }
  }
};

cleanOrphanFiles(work, 1);
cleanOrphanFiles(out, 1);
cleanOrphanFiles(published, 1);
cleanOrphanFiles(temp, 0.5); // 12 horas para temp
cleanOrphanFiles(inbox, 7); // 7 días para inbox

// Limpiar archivos .ass huerfanos
if (fs.existsSync(out)) {
  const assFiles = fs.readdirSync(out).filter(f => f.endsWith('.ass'));
  for (const file of assFiles) {
    fs.unlinkSync(path.join(out, file));
    console.log('cleaned orphan ass file', file);
  }
}

db.close();
console.log('cleanup complete');
