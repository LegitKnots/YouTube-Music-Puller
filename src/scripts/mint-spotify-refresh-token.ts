import 'dotenv/config';
import express from 'express';
import open from 'open';
import SpotifyWebApi from 'spotify-web-api-node';
import fs from 'fs';
import path from 'path';

const {
  SPOTIFY_CLIENT_ID = '',
  SPOTIFY_CLIENT_SECRET = '',
  SPOTIFY_REDIRECT_URI = 'http://localhost:5173/callback',
} = process.env;

if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
  console.error('Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env');
  process.exit(1);
}

const PORT = Number(new URL(SPOTIFY_REDIRECT_URI).port || 5173);
const app = express();

const scopes = [
  'user-library-read',
  'playlist-read-private',
  'playlist-read-collaborative',
];

const spotify = new SpotifyWebApi({
  clientId: SPOTIFY_CLIENT_ID,
  clientSecret: SPOTIFY_CLIENT_SECRET,
  redirectUri: SPOTIFY_REDIRECT_URI,
});

app.get('/login', (_req, res) => {
  const url = spotify.createAuthorizeURL(scopes, 'state123', true);
  res.redirect(url);
});

app.get('/callback', async (req, res) => {
  const code = String(req.query.code ?? '');
  if (!code) return res.status(400).send('Missing code');

  try {
    const { body } = await spotify.authorizationCodeGrant(code);
    const refresh = body.refresh_token;

    // Write to .env if not present
    const envPath = path.join(process.cwd(), '.env');
    let envText = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    if (!/SPOTIFY_REFRESH_TOKEN=/.test(envText)) {
      envText += (envText.endsWith('\n') ? '' : '\n') + `SPOTIFY_REFRESH_TOKEN=${refresh}\n`;
      fs.writeFileSync(envPath, envText, 'utf8');
    }

    res.send(`
      <h2>Refresh token minted ✅</h2>
      <p><b>SPOTIFY_REFRESH_TOKEN</b>:</p>
      <pre style="white-space:pre-wrap">${refresh}</pre>
      <p>Saved to <code>.env</code> if it wasn't already there.</p>
      <p>You can close this tab.</p>
    `);

    console.log('SPOTIFY_REFRESH_TOKEN:', refresh);
    process.nextTick(() => process.exit(0));
  } catch (e: any) {
    console.error(e?.response?.data || e.message || e);
    res.status(500).send('Auth error. Check console.');
  }
});

app.listen(PORT, async () => {
  const loginUrl = `http://localhost:${PORT}/login`;
  console.log(`Minting server on http://localhost:${PORT} …`);
  console.log('Opening browser for Spotify login …');
  await open(loginUrl);
});
