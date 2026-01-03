// Scheduler - Runs jobs at specified intervals (replaces cron for Render)
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const jobs = [
  { name: 'viral_finder', interval: 6 * 60 * 60 * 1000, file: 'jobs/viral_finder.js' },  // 6 horas
  { name: 'collector', interval: 1 * 60 * 60 * 1000, file: 'jobs/collector.js' },        // 1 hora
  { name: 'transcribe', interval: 1 * 60 * 60 * 1000, file: 'jobs/transcribe.js' },      // 1 hora
  { name: 'description_generator', interval: 1 * 60 * 60 * 1000, file: 'jobs/description_generator.js' }, // 1 hora
  { name: 'editor', interval: 1 * 60 * 60 * 1000, file: 'jobs/editor.js' },              // 1 hora
  { name: 'captioner', interval: 2 * 60 * 60 * 1000, file: 'jobs/captioner.js' },        // 2 horas
  { name: 'publisher', interval: 6 * 60 * 60 * 1000, file: 'jobs/publisher.js' },        // 6 horas (4 posts/dia)
  { name: 'cleaner', interval: 24 * 60 * 60 * 1000, file: 'jobs/cleaner.js' }            // 24 horas
];

function runJob(job) {
  const jobPath = path.join(__dirname, job.file);
  console.log(`[${new Date().toISOString()}] Running ${job.name}...`);

  const child = spawn('node', [jobPath], {
    stdio: 'inherit',
    env: process.env
  });

  child.on('error', (err) => {
    console.error(`[${job.name}] Error:`, err.message);
  });

  child.on('close', (code) => {
    if (code !== 0) {
      console.error(`[${job.name}] Exited with code ${code}`);
    } else {
      console.log(`[${job.name}] Completed`);
    }
  });
}

// Run all jobs once on startup
console.log('Starting scheduler...');
console.log('Jobs:', jobs.map(j => `${j.name} (every ${j.interval / 60000} min)`).join(', '));

for (const job of jobs) {
  // Run immediately on startup
  setTimeout(() => runJob(job), Math.random() * 10000); // Stagger initial runs

  // Then run at interval
  setInterval(() => runJob(job), job.interval);
}

// Keep process alive
console.log('Scheduler running. Press Ctrl+C to stop.');
