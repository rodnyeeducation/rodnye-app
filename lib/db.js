// Подключение к PostgreSQL и создание таблиц при старте.
const { Pool } = require('pg');

function makePool() {
  const ssl = process.env.DATABASE_SSL === 'false' ? false : (process.env.DATABASE_URL || '').includes('localhost') ? false : { rejectUnauthorized: false };
  return new Pool({ connectionString: process.env.DATABASE_URL, ssl, max: 5 });
}

const pool = makePool();
const q = (text, params = []) => pool.query(text, params).then(r => r.rows);
const one = async (text, params) => (await q(text, params))[0] || null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  tg_id BIGINT UNIQUE,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS invites (
  username TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  stream TEXT NOT NULL,
  tariff TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS enrollments (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  stream TEXT NOT NULL,
  tariff TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, course_id)
);
CREATE TABLE IF NOT EXISTS progress (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  watched BOOLEAN NOT NULL DEFAULT FALSE,
  quiz_score INT,
  quiz_ok BOOLEAN NOT NULL DEFAULT FALSE,
  done_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, course_id, lesson_id)
);
CREATE TABLE IF NOT EXISTS homework (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  answer TEXT NOT NULL,
  status TEXT NOT NULL,            -- wait | ok | back | self
  late BOOLEAN NOT NULL DEFAULT FALSE,
  tariff TEXT NOT NULL,
  comment TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS homework_user ON homework (user_id, course_id, lesson_id);
CREATE TABLE IF NOT EXISTS points (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  amount INT NOT NULL,
  reason TEXT NOT NULL,
  ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, course_id, reason, ref)
);
CREATE TABLE IF NOT EXISTS activity_days (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  PRIMARY KEY (user_id, day)
);
CREATE TABLE IF NOT EXISTS reminders_sent (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  day DATE NOT NULL,
  PRIMARY KEY (user_id, kind, day)
);
`;

async function migrate() {
  for (const stmt of SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) await q(stmt);
}

module.exports = { pool, q, one, migrate };
