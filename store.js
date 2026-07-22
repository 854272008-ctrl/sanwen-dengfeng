/**
 * 存储抽象层
 * - 无 DATABASE_URL:FileStore(本地开发,answers.json)
 * - 有 DATABASE_URL:PgStore(生产,PostgreSQL,兼容 render 自带 PG / Supabase)
 *
 * 接口:init / loadAll / add / stats / reset,均为 async
 */
const fs = require('fs');
const path = require('path');

/* ---------- FileStore(本地开发 / 备底) ---------- */
function FileStore(dir) {
  const DATA = path.join(dir, 'answers.json');
  const init = () => { if (!fs.existsSync(DATA)) fs.writeFileSync(DATA, '[]'); };
  const load = () => { try { return JSON.parse(fs.readFileSync(DATA, 'utf8')); } catch (e) { return []; } };
  const save = (l) => fs.writeFileSync(DATA, JSON.stringify(l, null, 2));
  return {
    async init() { init(); },
    async loadAll() { return load(); },
    async add(item) { const l = load(); l.push(item); save(l); return item; },
    async stats(target) {
      const l = load();
      const s = { target, q1: 0, q2: 0, q3: 0 };
      for (const a of l) s['q' + a.q] = (s['q' + a.q] || 0) + 1;
      return s;
    },
    async reset() { save([]); }
  };
}

/* ---------- PgStore(生产,PostgreSQL) ---------- */
function PgStore(databaseUrl) {
  let pool = null;
  // pg 条件加载:本地无 pg 也不报错
  const pg = require('pg');
  return {
    async init() {
      // rejectUnauthorized:false 兼容 render PG 自签证书;Supabase 也兼容
      pool = new pg.Pool({
        connectionString: databaseUrl,
        ssl: { rejectUnauthorized: false },
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000
      });
      await pool.query(`
        CREATE TABLE IF NOT EXISTS answers (
          id    BIGINT PRIMARY KEY,
          q     SMALLINT NOT NULL,
          text  TEXT NOT NULL,
          ts    BIGINT NOT NULL,
          ip    TEXT
        )
      `);
      // 按问统计索引
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_answers_q ON answers(q)`);
    },
    async loadAll() {
      const { rows } = await pool.query('SELECT id, q, text, ts, ip FROM answers ORDER BY ts ASC');
      return rows;
    },
    async add(item) {
      await pool.query(
        'INSERT INTO answers(id, q, text, ts, ip) VALUES($1,$2,$3,$4,$5)',
        [item.id, item.q, item.text, item.ts, item.ip]
      );
      return item;
    },
    async stats(target) {
      const { rows } = await pool.query('SELECT q, COUNT(*)::int AS n FROM answers GROUP BY q');
      const s = { target, q1: 0, q2: 0, q3: 0 };
      for (const r of rows) s['q' + r.q] = r.n;
      return s;
    },
    async reset() { await pool.query('DELETE FROM answers'); }
  };
}

function createStore() {
  if (process.env.DATABASE_URL) return PgStore(process.env.DATABASE_URL);
  return FileStore(__dirname);
}

module.exports = { createStore, FileStore, PgStore };
