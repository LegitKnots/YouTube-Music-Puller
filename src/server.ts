import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import SpotifyWebApi from 'spotify-web-api-node';
import fs from 'fs';
import { fetchLiked, fetchPlaylist, runMapToYouTube, writeOutputs } from './lib/core.js';

const {
  SPOTIFY_CLIENT_ID = '',
  SPOTIFY_CLIENT_SECRET = '',
  SPOTIFY_REDIRECT_URI = '',
} = process.env;

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 5173;

// --- Static UI ---
app.use('/', express.static(path.join(process.cwd(), 'public')));

// --- OAuth (optional in web run; reuse token minter if needed) ---
const spotify = new SpotifyWebApi({
  clientId: SPOTIFY_CLIENT_ID,
  clientSecret: SPOTIFY_CLIENT_SECRET,
  redirectUri: SPOTIFY_REDIRECT_URI,
});

app.get('/auth/login', (_req, res) => {
  const scopes = ['user-library-read','playlist-read-private','playlist-read-collaborative'];
  const url = spotify.createAuthorizeURL(scopes, 'webstate123', true);
  res.redirect(url);
});

app.get('/callback', async (req, res) => {
  const code = String(req.query.code ?? '');
  if (!code) return res.status(400).send('Missing code');
  try {
    const { body } = await spotify.authorizationCodeGrant(code);
    const refresh = body.refresh_token;
    // Save to .env (append if absent)
    const envPath = path.join(process.cwd(), '.env');
    let envText = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    if (!/SPOTIFY_REFRESH_TOKEN=/.test(envText)) {
      envText += (envText.endsWith('\n') ? '' : '\n') + `SPOTIFY_REFRESH_TOKEN=${refresh}\n`;
      fs.writeFileSync(envPath, envText, 'utf8');
    }
    res.redirect('/?ok=1');
  } catch (e: any) {
    console.error(e?.response?.data || e.message || e);
    res.status(500).send('OAuth error. Check server logs.');
  }
});

// --- API: run job ---
app.post('/api/run', async (req, res) => {
  const { mode, playlistId } = req.body as { mode: 'liked'|'playlist', playlistId?: string };
  try {
    let tracks = [];
    if (mode === 'liked') tracks = await fetchLiked();
    else if (mode === 'playlist' && playlistId) tracks = await fetchPlaylist(playlistId);
    else return res.status(400).json({ error: 'Bad params' });

    const rows = await runMapToYouTube(tracks);
    const files = writeOutputs(rows);

    res.json({
      count: rows.length,
      json: '/download/json',
      csv: '/download/csv'
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

// --- Downloads (serve the most recent outputs) ---
app.get('/download/json', (_req, res) => {
  res.sendFile(path.join(process.cwd(), 'output', 'spotify_to_youtube.json'));
});
app.get('/download/csv', (_req, res) => {
  res.sendFile(path.join(process.cwd(), 'output', 'spotify_to_youtube.csv'));
});

app.listen(PORT, () => {
  console.log(`Web server on http://localhost:${PORT}`);
});
