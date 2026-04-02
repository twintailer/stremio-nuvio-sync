const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.resolve(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'sync.db');

let db;

function save() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

async function init() {
  fs.mkdirSync(DB_DIR, { recursive: true });

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS library_items (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT,
      poster TEXT,
      time_watched INTEGER DEFAULT 0,
      duration INTEGER DEFAULT 0,
      last_watched TEXT,
      video_id TEXT,
      updated_at TEXT,
      tmdb_poster TEXT,
      tmdb_bg TEXT,
      tmdb_desc TEXT,
      tmdb_fetched_at TEXT
    )
  `);

  save();
  console.log('[DB] Initialized at', DB_PATH);
  return db;
}

function upsertItems(items) {
  const stmt = db.prepare(`
    INSERT INTO library_items (id, type, name, poster, time_watched, duration, last_watched, video_id, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      type = excluded.type,
      name = excluded.name,
      poster = COALESCE(excluded.poster, library_items.poster),
      time_watched = excluded.time_watched,
      duration = excluded.duration,
      last_watched = excluded.last_watched,
      video_id = excluded.video_id,
      updated_at = excluded.updated_at
  `);

  for (const row of items) {
    stmt.run([row.id, row.type, row.name, row.poster, row.time_watched, row.duration, row.last_watched, row.video_id, row.updated_at]);
  }
  stmt.free();
  save();
}

function queryAll(sql, params = []) {
  const results = [];
  const stmt = db.prepare(sql);
  stmt.bind(params);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function getLibrary(type, limit = 200) {
  return queryAll(`
    SELECT * FROM library_items
    WHERE type = ?
    ORDER BY last_watched DESC
    LIMIT ?
  `, [type, limit]);
}

function getContinueWatching(type, limit = 100) {
  return queryAll(`
    SELECT * FROM library_items
    WHERE type = ?
      AND time_watched > 0
      AND duration > 0
      AND (CAST(time_watched AS REAL) / duration) < 0.90
    ORDER BY last_watched DESC
    LIMIT ?
  `, [type, limit]);
}

function getItemsNeedingTmdb(limit = 20) {
  return queryAll(`
    SELECT id FROM library_items
    WHERE tmdb_fetched_at IS NULL
       OR tmdb_fetched_at < datetime('now', '-7 days')
    LIMIT ?
  `, [limit]);
}

function updateTmdb(id, poster, bg, desc) {
  db.run(`
    UPDATE library_items
    SET tmdb_poster = ?, tmdb_bg = ?, tmdb_desc = ?, tmdb_fetched_at = datetime('now')
    WHERE id = ?
  `, [poster, bg, desc, id]);
  save();
}

function close() {
  if (db) {
    save();
    db.close();
    console.log('[DB] Closed');
  }
}

function getDb() {
  return db;
}

module.exports = { init, upsertItems, getLibrary, getContinueWatching, getItemsNeedingTmdb, updateTmdb, close, getDb };
