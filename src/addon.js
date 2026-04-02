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

function toMeta(item) {
  const meta = {
    id: item.id,
    type: item.type,
    name: item.name,
    poster: item.tmdb_poster || item.poster,
  };

  if (item.tmdb_bg) meta.background = item.tmdb_bg;
  if (item.tmdb_desc) meta.description = item.tmdb_desc;

  return meta;
}

builder.defineCatalogHandler(({ type, id }) => {
  let items;

  if (id === 'sync-library-movies') {
    items = db.getLibrary('movie', 200);
  } else if (id === 'sync-library-series') {
    items = db.getLibrary('series', 200);
  } else if (id === 'sync-continue-movies') {
    items = db.getContinueWatching('movie', 100);
  } else if (id === 'sync-continue-series') {
    items = db.getContinueWatching('series', 100);
  } else {
    return Promise.resolve({ metas: [] });
  }

  const metas = items.map(toMeta);
  return Promise.resolve({ metas });
});

module.exports = { builder, manifest };
