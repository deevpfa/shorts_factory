import nodemailer from 'nodemailer';

function getTransporter() {
  const { GMAIL_USER, GMAIL_APP_PASSWORD, ERROR_NOTIFY_EMAIL } = process.env;

  if (!GMAIL_USER || !GMAIL_APP_PASSWORD || !ERROR_NOTIFY_EMAIL) {
    return null;
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_APP_PASSWORD
    }
  });
}

export async function notifyError(jobName, error, context = {}) {
  console.error(`[${jobName}] Error:`, error.message);

  const transporter = getTransporter();
  if (!transporter) {
    console.log('Email notifications not configured, skipping...');
    return;
  }

  const { GMAIL_USER, ERROR_NOTIFY_EMAIL } = process.env;

  const timestamp = new Date().toISOString();
  const contextStr = Object.keys(context).length > 0
    ? Object.entries(context).map(([k, v]) => `${k}: ${v}`).join('\n')
    : 'No additional context';

  const html = `
    <h2>⚠️ Shorts Factory Error</h2>
    <p><strong>Job:</strong> ${jobName}</p>
    <p><strong>Time:</strong> ${timestamp}</p>
    <p><strong>Error:</strong></p>
    <pre style="background:#f5f5f5;padding:10px;border-radius:5px;">${error.message}</pre>
    <p><strong>Context:</strong></p>
    <pre style="background:#f5f5f5;padding:10px;border-radius:5px;">${contextStr}</pre>
    ${error.stack ? `<p><strong>Stack:</strong></p><pre style="background:#f5f5f5;padding:10px;border-radius:5px;font-size:12px;">${error.stack}</pre>` : ''}
  `;

  try {
    await transporter.sendMail({
      from: GMAIL_USER,
      to: ERROR_NOTIFY_EMAIL,
      subject: `[Shorts Factory] ${jobName} failed`,
      html
    });
    console.log('Error notification sent to', ERROR_NOTIFY_EMAIL);
  } catch (mailErr) {
    console.error('Failed to send error notification:', mailErr.message);
  }
}
