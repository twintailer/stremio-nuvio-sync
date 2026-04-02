const { addonBuilder } = require('stremio-addon-sdk');
const pkg = require('../package.json');
const db = require('./db');

const manifest = {
  id: 'community.stremio-nuvio-sync',
  version: pkg.version,
  name: 'Stremio↔Nuvio Sync',
  description: 'Syncs Stremio library and watch progress to Nuvio catalogs',
  catalogs: [
    { type: 'movie', id: 'sync-library-movies', name: 'Bibliothek – Filme' },
    { type: 'series', id: 'sync-library-series', name: 'Bibliothek – Serien' },
    { type: 'movie', id: 'sync-continue-movies', name: 'Weiterschauen – Filme' },
    { type: 'series', id: 'sync-continue-series', name: 'Weiterschauen – Serien' },
  ],
  resources: ['catalog'],
  types: ['movie', 'series'],
  idPrefixes: ['tt'],
};

const builder = new addonBuilder(manifest);

function formatTime(seconds) {
  if (!seconds || seconds <= 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

function parseVideoId(videoId) {
  if (!videoId) return null;
  // Format: tt1234567:season:episode
  const parts = videoId.split(':');
  if (parts.length >= 3) {
    const season = parseInt(parts[1], 10);
    const episode = parseInt(parts[2], 10);
    if (!isNaN(season) && !isNaN(episode)) {
      return { season, episode };
    }
  }
  return null;
}

function buildDescription(item) {
  const parts = [];

  // Episode info for series
  if (item.type === 'series' && item.video_id) {
    const ep = parseVideoId(item.video_id);
    if (ep) {
      parts.push(`📺 Staffel ${ep.season}, Folge ${ep.episode}`);
    }
  }

  // Watch progress
  if (item.time_watched > 0 && item.duration > 0) {
    const percent = Math.round((item.time_watched / item.duration) * 100);
    parts.push(`⏱ ${formatTime(item.time_watched)} / ${formatTime(item.duration)} (${percent}%)`);
  }

  // TMDB description
  if (item.tmdb_desc) {
    parts.push('');
    parts.push(item.tmdb_desc);
  }

  return parts.length > 0 ? parts.join('\n') : undefined;
}

function toMeta(item, isContinue) {
  const meta = {
    id: item.id,
    type: item.type,
    name: item.name,
    poster: item.tmdb_poster || item.poster,
  };

  if (item.tmdb_bg) meta.background = item.tmdb_bg;

  const desc = buildDescription(item);
  if (desc) meta.description = desc;

  return meta;
}

builder.defineCatalogHandler(({ type, id }) => {
  let items;
  let isContinue = false;

  if (id === 'sync-library-movies') {
    items = db.getLibrary('movie', 200);
  } else if (id === 'sync-library-series') {
    items = db.getLibrary('series', 200);
  } else if (id === 'sync-continue-movies') {
    items = db.getContinueWatching('movie', 100);
    isContinue = true;
  } else if (id === 'sync-continue-series') {
    items = db.getContinueWatching('series', 100);
    isContinue = true;
  } else {
    return Promise.resolve({ metas: [] });
  }

  const metas = items.map((item) => toMeta(item, isContinue));
  return Promise.resolve({ metas });
});

module.exports = { builder, manifest };
