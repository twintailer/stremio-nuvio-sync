const fetch = require('node-fetch');
const db = require('./db');

const TMDB_BASE = 'https://api.themoviedb.org/3';

async function enrichItem(imdbId, apiKey) {
  const url = `${TMDB_BASE}/find/${imdbId}?external_source=imdb_id&api_key=${apiKey}`;
  const res = await fetch(url);

  if (res.status === 429) {
    console.log('[TMDB] Rate limited, backing off 30s...');
    await new Promise((r) => setTimeout(r, 30000));
    const retry = await fetch(url);
    if (!retry.ok) {
      console.log(`[TMDB] Retry failed for ${imdbId}, skipping`);
      return;
    }
    return processResponse(imdbId, await retry.json());
  }

  if (!res.ok) {
    console.log(`[TMDB] Error ${res.status} for ${imdbId}`);
    return;
  }

  return processResponse(imdbId, await res.json());
}

function processResponse(imdbId, data) {
  const result =
    (data.movie_results && data.movie_results[0]) ||
    (data.tv_results && data.tv_results[0]);

  if (!result) {
    db.updateTmdb(imdbId, null, null, null);
    return;
  }

  const poster = result.poster_path
    ? `https://image.tmdb.org/t/p/w500${result.poster_path}`
    : null;
  const bg = result.backdrop_path
    ? `https://image.tmdb.org/t/p/original${result.backdrop_path}`
    : null;
  const desc = result.overview || null;

  db.updateTmdb(imdbId, poster, bg, desc);
}

async function runEnrichment() {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return;

  const items = db.getItemsNeedingTmdb(20);
  if (items.length === 0) return;

  console.log(`[TMDB] Enriching ${items.length} items...`);

  for (const item of items) {
    try {
      await enrichItem(item.id, apiKey);
    } catch (err) {
      console.error(`[TMDB] Error enriching ${item.id}:`, err.message);
    }
    // Small delay to respect rate limits
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log('[TMDB] Enrichment pass complete');
}

module.exports = { runEnrichment };
