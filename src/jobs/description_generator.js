import Database from 'better-sqlite3';

const dbPath = '/data/db/shorts.db';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const db = new Database(dbPath);

// Add description column if it doesn't exist (migration)
try {
  db.exec(`ALTER TABLE videos ADD COLUMN description TEXT`);
} catch (e) {
  // Column already exists, ignore
}

// Get videos that are transcribed but don't have a generated description
const videos = db.prepare(`
  SELECT id, title, transcription FROM videos
  WHERE status = 'transcribed' AND (description IS NULL OR description = '')
  LIMIT 3
`).all();

async function generateDescription(title, transcription) {
  const words = JSON.parse(transcription).words || [];
  const transcript = words.map(w => w.word).join(' ');

  const prompt = `You are a viral social media expert. Generate a short, engaging description for a TikTok/Instagram Reel.

Original title: ${title}
Video transcript: ${transcript || '(no audio)'}

Rules:
- Maximum 150 characters for the main text
- Use 1-2 relevant emojis
- Create curiosity or emotional hook
- Add a line break, then 5-8 relevant hashtags
- Don't use quotes around the text
- Write in the same language as the title/transcript

Example format:
Wait for it... This is absolutely insane! 🤯

#viral #fyp #amazing #shorts #mindblown`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
      temperature: 0.8
    })
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message);
  }

  return data.choices[0].message.content.trim();
}

for (const video of videos) {
  try {
    const description = await generateDescription(video.title || video.id, video.transcription || '{}');

    db.prepare(`
      UPDATE videos SET description = ? WHERE id = ?
    `).run(description, video.id);

    console.log('generated description for', video.id);
    console.log('Description:', description.substring(0, 80) + '...');
  } catch (err) {
    console.error('Error generating description for', video.id, ':', err.message);
  }
}

db.close();
