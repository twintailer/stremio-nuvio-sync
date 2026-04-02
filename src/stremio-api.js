const fetch = require('node-fetch');
const db = require('./db');

const API_BASE = 'https://api.strem.io/api';

let authKey = null;

async function login() {
  const email = process.env.STREMIO_EMAIL;
  const password = process.env.STREMIO_PASSWORD;

  if (!email || !password) {
    throw new Error('STREMIO_EMAIL and STREMIO_PASSWORD must be set');
  }

  console.log('[Stremio] Logging in as', email);
  const res = await fetch(`${API_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, facebook: false }),
  });

  const data = await res.json();

  if (!data.result || !data.result.authKey) {
    throw new Error(`[Stremio] Login failed: ${JSON.stringify(data)}`);
  }

  authKey = data.result.authKey;
  console.log('[Stremio] Login successful');
  return authKey;
}

async function ensureAuth() {
  if (!authKey) {
    await login();
  }
  return authKey;
}

async function fetchLibrary() {
  await ensureAuth();

  const res = await fetch(`${API_BASE}/datastoreGet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      authKey,
      collection: 'libraryItem',
      ids: [],
      all: true,
    }),
  });

  if (res.status === 401) {
    console.log('[Stremio] Auth expired, re-authenticating...');
    authKey = null;
    await login();
    return fetchLibrary();
  }

  const data = await res.json();

  if (!data.result) {
    throw new Error(`[Stremio] datastoreGet failed: ${JSON.stringify(data)}`);
  }

  return data.result;
}

function mapLibraryItem(item) {
  const state = item.state || {};
  return {
    id: item._id,
    type: item.type || 'movie',
    name: item.name || '',
    poster: item.poster || null,
    time_watched: state.timeWatched || state.time_watched || 0,
    duration: state.duration || 0,
    last_watched: state.lastWatched || state.last_watched || null,
    video_id: state.video_id || state.videoId || null,
    updated_at: new Date().toISOString(),
  };
}

async function poll() {
  try {
    console.log('[Stremio] Polling library...');
    const items = await fetchLibrary();
    console.log(`[Stremio] Got ${items.length} library items`);

    const mapped = items
      .filter((item) => item._id && item._id.startsWith('tt'))
      .map(mapLibraryItem);

    if (mapped.length > 0) {
      db.upsertItems(mapped);
      console.log(`[Stremio] Upserted ${mapped.length} items into DB`);
    }

    return mapped.length;
  } catch (err) {
    console.error('[Stremio] Poll error:', err.message);
    return 0;
  }
}

module.exports = { login, poll };
