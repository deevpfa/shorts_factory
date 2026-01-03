import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import Database from 'better-sqlite3';

const published = '/data/published';
const dbPath = '/data/db/shorts.db';

fs.mkdirSync(published, { recursive: true });

const db = new Database(dbPath);

const {
  METRICOOL_TOKEN,
  METRICOOL_USER_ID,
  METRICOOL_BLOG_ID,
  METRICOOL_PLATFORMS // comma-separated: tiktok,instagram,facebook,youtube
} = process.env;

if (!METRICOOL_TOKEN || !METRICOOL_USER_ID || !METRICOOL_BLOG_ID) {
  console.error('Missing Metricool API credentials');
  console.error('Required: METRICOOL_TOKEN, METRICOOL_USER_ID, METRICOOL_BLOG_ID');
  process.exit(1);
}

const BASE_URL = 'https://app.metricool.com/api';
const platforms = (METRICOOL_PLATFORMS || 'tiktok,instagram,youtube').split(',').map(p => p.trim().toUpperCase());

// Upload video to tmpfiles.org (temporary public storage)
async function uploadToTempStorage(filePath) {
  console.log('Uploading to temp storage...');
  const fileBuffer = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);

  const formData = new FormData();
  formData.append('file', new Blob([fileBuffer]), fileName);

  const res = await fetch('https://tmpfiles.org/api/v1/upload', {
    method: 'POST',
    body: formData
  });

  const data = await res.json();

  if (data.status !== 'success' || !data.data?.url) {
    throw new Error('Failed to upload: ' + JSON.stringify(data));
  }

  // Convert view URL to direct download URL
  const directUrl = data.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
  console.log('Uploaded to:', directUrl);
  return directUrl;
}

// Schedule post on multiple platforms via Metricool
async function schedulePost(mediaUrl, title) {
  console.log('Scheduling post on Metricool...');

  const url = `${BASE_URL}/v2/scheduler/posts?blogId=${METRICOOL_BLOG_ID}&userId=${METRICOOL_USER_ID}`;

  // Publication date: now + 10 minutes
  const pubDate = new Date(Date.now() + 10 * 60 * 1000);
  const dateTime = pubDate.toISOString().slice(0, 19);

  // Build providers array based on configured platforms
  const providers = platforms.map(network => ({ network }));

  const postConfig = {
    text: title, // Already formatted with hashtags from description_generator
    publicationDate: {
      dateTime: dateTime,
      timezone: 'America/Argentina/Buenos_Aires'
    },
    media: [mediaUrl],
    providers: providers,
    autoPublish: true
  };

  // Add platform-specific data
  if (platforms.includes('INSTAGRAM')) {
    postConfig.instagramData = {
      type: 'REEL',
      autoPublish: true
    };
  }

  if (platforms.includes('YOUTUBE')) {
    postConfig.youtubeData = {
      title: title.slice(0, 100),
      type: 'SHORT',
      privacy: 'PUBLIC',
      madeForKids: false
    };
  }

  if (platforms.includes('TIKTOK')) {
    postConfig.tiktokData = {
      disableComment: false,
      disableDuet: false,
      disableStitch: false
    };
  }

  if (platforms.includes('FACEBOOK')) {
    postConfig.facebookData = {
      type: 'REEL'
    };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Mc-Auth': METRICOOL_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(postConfig)
  });

  const data = await res.json();

  if (res.status >= 400) {
    throw new Error('Failed to schedule: ' + JSON.stringify(data));
  }

  return data;
}

const videos = db.prepare(`
  SELECT id, source_path, title, description FROM videos
  WHERE status = 'captioned'
  LIMIT 1
`).all();

for (const video of videos) {
  try {
    console.log('Publishing', video.id, 'to platforms:', platforms.join(', '));

    // Step 1: Upload to temporary public storage
    const mediaUrl = await uploadToTempStorage(video.source_path);

    // Step 2: Schedule post on all platforms via Metricool
    // Use AI-generated description if available, otherwise fallback to title
    const postText = video.description || video.title || `Amazing viral content ${video.id}`;
    const result = await schedulePost(mediaUrl, postText);
    console.log('Scheduled post ID:', result.data?.id);

    // Move to published folder
    const destPath = path.join(published, path.basename(video.source_path));
    fs.renameSync(video.source_path, destPath);

    db.prepare(`
      UPDATE videos
      SET status = 'published', source_path = ?, published_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(destPath, video.id);

    console.log('Published', video.id, 'to', platforms.join(', '));
  } catch (err) {
    console.error('Failed to publish', video.id, err.message);
  }
}

db.close();
