import fs from 'fs';
import path from 'path';

const dataPath = process.env.DATA_PATH || '/data';
const out = `${dataPath}/out`;
const temp = `${dataPath}/temp`;

// Limpiar archivos más viejos que X días
const cleanOldFiles = (dir, maxAgeDays) => {
  if (!fs.existsSync(dir)) return;

  const files = fs.readdirSync(dir);
  let cleaned = 0;

  for (const file of files) {
    const filePath = path.join(dir, file);
    try {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) continue;

      const ageMs = Date.now() - stat.mtimeMs;
      const ageDays = ageMs / (1000 * 60 * 60 * 24);

      if (ageDays > maxAgeDays) {
        fs.unlinkSync(filePath);
        console.log('Deleted:', filePath, `(${ageDays.toFixed(1)} days old)`);
        cleaned++;
      }
    } catch (e) {
      console.error('Error cleaning', filePath, e.message);
    }
  }

  return cleaned;
};

console.log('Running cleaner...');

// Limpiar out/ - videos editados más viejos de 1 día
const outCleaned = cleanOldFiles(out, 1);
console.log(`Cleaned ${outCleaned} files from out/`);

// Limpiar temp/ - archivos temporales más viejos de 12 horas
const tempCleaned = cleanOldFiles(temp, 0.5);
console.log(`Cleaned ${tempCleaned} files from temp/`);

console.log('Cleaner finished');
