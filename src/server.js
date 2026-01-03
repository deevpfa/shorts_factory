import 'dotenv/config';
import http from 'http';
import { spawn } from 'child_process';
import { notifyError } from './lib/notify.js';

const PORT = process.env.PORT || 3000;
const CRON_INTERVAL = process.env.CRON_INTERVAL || 60; // minutos

let isRunning = false;
let lastRun = null;
let lastResult = null;

// Ejecutar un job
async function runJob(name) {
  const jobPath = `./src/jobs/${name}.js`;
  console.log(`[${new Date().toISOString()}] Running ${name}...`);

  return new Promise((resolve) => {
    const proc = spawn('node', [jobPath], {
      stdio: 'inherit',
      env: process.env
    });

    proc.on('close', (code) => {
      if (code === 0) {
        console.log(`[${name}] completed successfully`);
        resolve({ success: true });
      } else {
        console.error(`[${name}] failed with code ${code}`);
        resolve({ success: false, code });
      }
    });

    proc.on('error', (err) => {
      console.error(`[${name}] error:`, err.message);
      resolve({ success: false, error: err.message });
    });
  });
}

// Pipeline completo
async function runPipeline() {
  if (isRunning) {
    console.log('Pipeline already running, skipping...');
    return { skipped: true };
  }

  isRunning = true;
  const startTime = Date.now();
  const results = {};

  try {
    console.log('\n========== PIPELINE START ==========\n');

    // 1. Buscar videos virales
    results.viral_finder = await runJob('viral_finder');

    // 2. Editar videos
    results.editor = await runJob('editor');

    // 3. Transcribir
    results.transcribe = await runJob('transcribe');

    // 4. Agregar subtítulos
    results.captioner = await runJob('captioner');

    // 5. Publicar
    results.publisher = await runJob('publisher');

    // 6. Limpiar
    results.cleaner = await runJob('cleaner');

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n========== PIPELINE END (${duration}s) ==========\n`);

    lastRun = new Date().toISOString();
    lastResult = { success: true, results, duration: `${duration}s` };

  } catch (err) {
    await notifyError('pipeline', err, { stage: 'main' });
    lastResult = { success: false, error: err.message };
  } finally {
    isRunning = false;
  }

  return lastResult;
}

// Servidor HTTP
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Health check
  if (url.pathname === '/' || url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      isRunning,
      lastRun,
      lastResult,
      cronInterval: `${CRON_INTERVAL} minutes`
    }));
    return;
  }

  // Ejecutar pipeline manualmente
  if (url.pathname === '/run') {
    if (isRunning) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Pipeline already running' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Pipeline started' }));

    // Ejecutar en background
    runPipeline();
    return;
  }

  // Ejecutar job específico
  if (url.pathname.startsWith('/job/')) {
    const jobName = url.pathname.replace('/job/', '');
    const validJobs = ['viral_finder', 'editor', 'transcribe', 'captioner', 'publisher', 'cleaner'];

    if (!validJobs.includes(jobName)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Job not found', validJobs }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: `Job ${jobName} started` }));

    runJob(jobName);
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    error: 'Not found',
    endpoints: {
      '/': 'Health check',
      '/run': 'Run full pipeline',
      '/job/:name': 'Run specific job (viral_finder, editor, transcribe, captioner, publisher, cleaner)'
    }
  }));
});

// Cron interno
function startCron() {
  const intervalMs = CRON_INTERVAL * 60 * 1000;
  console.log(`Cron scheduled every ${CRON_INTERVAL} minutes`);

  setInterval(() => {
    console.log('Cron triggered');
    runPipeline();
  }, intervalMs);
}

// Iniciar servidor
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/`);
  console.log(`Run pipeline: http://localhost:${PORT}/run`);

  // Iniciar cron
  startCron();

  // Ejecutar pipeline inicial después de 10 segundos
  setTimeout(() => {
    console.log('Running initial pipeline...');
    runPipeline();
  }, 10000);
});
