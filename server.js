/**
 * 三问登峰 · 作答页后端
 * 用法:node server.js   (默认端口 8788,render 会注入 PORT)
 * 存储:无 DATABASE_URL 用 answers.json;有 DATABASE_URL 用 PostgreSQL(生产)
 * 数据存 answers.json(本地)或 answers 表(生产)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { createStore } = require('./store');

const PORT = process.env.PORT || 8788;
const PUBLIC = path.join(__dirname, 'public');
const TARGET = 23;            // 管理层代表人数
const ADMIN_KEY = process.env.ADMIN_KEY || ''; // 清空数据密钥;不设则禁用 reset
const store = createStore();

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}
// CORS 预检(render 同源本不需要,但跨域/调试时友好)
function cors(req, res) {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-Admin-Key'
  });
  res.end();
}

const rateMap = new Map(); // ip -> [ts,...]

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return cors(req, res);
  const u = url.parse(req.url, true);
  // render/反向代理后真实 IP
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();

  // ---- 健康检查 ----
  if (u.pathname === '/api/health' && req.method === 'GET') {
    return send(res, 200, { ok: true, service: 'sanwen-dengfeng', time: Date.now(), db: !!process.env.DATABASE_URL });
  }

  // ---- 提交答案 ----
  if (u.pathname === '/api/answer' && req.method === 'POST') {
    const now = Date.now();
    const hits = (rateMap.get(ip) || []).filter(t => now - t < 60000);
    if (hits.length >= 10) return send(res, 429, { ok: false, msg: '太频繁了,喝口水再来' });
    hits.push(now); rateMap.set(ip, hits);

    let body = '';
    req.on('data', c => { body += c; if (body.length > 4000) req.destroy(); });
    req.on('end', async () => {
      try {
        const { q, text } = JSON.parse(body);
        const qi = parseInt(q, 10);
        const t = String(text || '').trim().slice(0, 200);
        if (![1, 2, 3].includes(qi) || !t) return send(res, 400, { ok: false, msg: '内容为空或问题编号不对' });

        // 同人同问同文 5 分钟内视为重复
        const all = await store.loadAll();
        const dup = all.find(a => a.ip === ip && a.q === qi && a.text === t && now - a.ts < 300000);
        if (dup) {
          const s = await store.stats(TARGET);
          return send(res, 200, { ok: true, dup: true, n: s['q' + qi] });
        }

        await store.add({ id: Date.now() + Math.floor(Math.random() * 1000), q: qi, text: t, ts: now, ip });
        const s = await store.stats(TARGET);
        return send(res, 200, { ok: true, n: s['q' + qi] });
      } catch (e) {
        return send(res, 400, { ok: false, msg: '提交失败,换个姿势再试' });
      }
    });
    return;
  }

  // ---- 全部回答(匿名,剥离 IP) ----
  if (u.pathname === '/api/answers' && req.method === 'GET') {
    const answers = (await store.loadAll()).map(({ ip, ...rest }) => rest);
    return send(res, 200, answers);
  }

  // ---- 参与统计 ----
  if (u.pathname === '/api/stats' && req.method === 'GET') {
    return send(res, 200, await store.stats(TARGET));
  }

  // ---- 清空数据(需 ADMIN_KEY) ----
  if (u.pathname === '/api/reset' && req.method === 'POST') {
    if (!ADMIN_KEY) return send(res, 403, { ok: false, msg: '未配置管理密钥,reset 已禁用' });
    if (req.headers['x-admin-key'] !== ADMIN_KEY) return send(res, 403, { ok: false, msg: '密钥不对' });
    await store.reset();
    return send(res, 200, { ok: true });
  }

  // ---- 静态文件 ----
  let fp = path.join(PUBLIC, u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname));
  if (!fp.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    const ext = path.extname(fp);
    const mime = {
      '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
      '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml'
    }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

(async () => {
  try { await store.init(); } catch (e) { console.error('存储初始化失败:', e.message); }
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`三问登峰作答页已启动: http://localhost:${PORT}  存储: ${process.env.DATABASE_URL ? 'PostgreSQL' : 'answers.json'}`);
  });
})();

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
