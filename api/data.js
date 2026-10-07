// StokBakeri shared data API (Vercel serverless function).
//
//   GET  /api/data?v=<version>  -> { version, items, tx, lecturers, initialized }
//                                  or { version, unchanged: true } when v matches
//   POST /api/data  { ops: [...] } -> { version }
//
// Storage: Upstash Redis over its REST API. Connect "Upstash for Redis" from the
// Vercel Storage tab; it sets KV_REST_API_URL / KV_REST_API_TOKEN.
// Optional: set APP_PASSWORD to require a shared password (header x-app-password).

const crypto = require('crypto');

const K = {
  items: 'sb:items',
  tx: 'sb:tx',
  lecturers: 'sb:lecturers',
  version: 'sb:version',
  init: 'sb:init',
};
const MAX_OPS = 1000;

function redisConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

async function redis(cfg, path, commands) {
  const res = await fetch(cfg.url + path, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + cfg.token, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error('Redis HTTP ' + res.status);
  const out = await res.json();
  const list = Array.isArray(out) ? out : [out];
  for (const r of list) if (r && r.error) throw new Error('Redis: ' + r.error);
  return list.map((r) => r.result);
}
const pipeline = (cfg, cmds) => redis(cfg, '/pipeline', cmds);
const transaction = (cfg, cmds) => redis(cfg, '/multi-exec', cmds);

function hashToList(flat) {
  const out = [];
  for (let i = 0; flat && i < flat.length; i += 2) {
    try { out.push(JSON.parse(flat[i + 1])); } catch (e) { /* skip corrupt entry */ }
  }
  return out;
}

/* ---------- validation ---------- */

const str = (v, max) => String(v == null ? '' : v).slice(0, max);
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : 0;
};
const id = (v) => {
  const s = str(v, 80);
  if (!/^[\w.-]+$/.test(s)) throw new Error('Bad id');
  return s;
};

function cleanItem(i) {
  if (!i || typeof i !== 'object') throw new Error('Bad item');
  return {
    id: id(i.id),
    code: str(i.code, 30),
    name: str(i.name, 120),
    category: str(i.category, 60),
    unit: str(i.unit, 20),
    initialStock: Math.max(0, num(i.initialStock)),
    minStock: Math.max(0, num(i.minStock)),
    location: str(i.location, 60),
  };
}
function cleanTx(t) {
  if (!t || typeof t !== 'object') throw new Error('Bad transaction');
  return {
    id: id(t.id),
    itemId: id(t.itemId),
    type: t.type === 'KELUAR' ? 'KELUAR' : 'TERIMA',
    quantity: Math.max(0, num(t.quantity)),
    date: /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : new Date().toISOString().slice(0, 10),
    person: str(t.person, 80),
    lecturer: str(t.lecturer, 80),
    notes: str(t.notes, 160),
    createdAt: num(t.createdAt),
  };
}
function cleanLecturers(list) {
  if (!Array.isArray(list)) throw new Error('Bad lecturers');
  return list.slice(0, 200).map((l) => str(l, 80)).filter(Boolean);
}

function hset(key, list) {
  if (!list.length) return [];
  const cmd = ['HSET', key];
  list.forEach((x) => cmd.push(x.id, JSON.stringify(x)));
  return [cmd];
}

/** Turn client operations into Redis commands. */
async function commandsFor(cfg, ops) {
  const cmds = [];
  let txCache = null;
  const allTx = async () => {
    if (!txCache) txCache = hashToList((await pipeline(cfg, [['HGETALL', K.tx]]))[0]);
    return txCache;
  };
  for (const op of ops) {
    switch (op && op.op) {
      case 'putItem': cmds.push(...hset(K.items, [cleanItem(op.item)])); break;
      case 'delItem': {
        const itemId = id(op.id);
        cmds.push(['HDEL', K.items, itemId]);
        const ids = (await allTx()).filter((t) => t.itemId === itemId).map((t) => t.id);
        if (ids.length) cmds.push(['HDEL', K.tx, ...ids]);
        break;
      }
      case 'putTx': cmds.push(...hset(K.tx, [cleanTx(op.tx)])); break;
      case 'delTx': cmds.push(['HDEL', K.tx, id(op.id)]); break;
      case 'setLecturers': cmds.push(['SET', K.lecturers, JSON.stringify(cleanLecturers(op.list))]); break;
      case 'clearTx': cmds.push(['DEL', K.tx]); break;
      case 'clearAll': cmds.push(['DEL', K.items, K.tx]); break;
      case 'replaceAll': {
        const d = op.data || {};
        cmds.push(['DEL', K.items, K.tx]);
        cmds.push(...hset(K.items, (d.items || []).map(cleanItem)));
        cmds.push(...hset(K.tx, (d.tx || []).map(cleanTx)));
        if (Array.isArray(d.lecturers)) cmds.push(['SET', K.lecturers, JSON.stringify(cleanLecturers(d.lecturers))]);
        break;
      }
      default: throw new Error('Unknown operation');
    }
  }
  return cmds;
}

/* ---------- auth ---------- */

function authorised(req) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return true;
  const given = String(req.headers['x-app-password'] || '');
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

/* ---------- handler ---------- */

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const cfg = redisConfig();
  if (!cfg) return res.status(503).json({ error: 'no-db' });
  if (!authorised(req)) return res.status(401).json({ error: 'password' });

  try {
    if (req.method === 'GET') {
      const since = req.query && req.query.v;
      const [version] = await pipeline(cfg, [['GET', K.version]]);
      const v = Number(version) || 0;
      if (since != null && String(since) === String(v)) return res.status(200).json({ version: v, unchanged: true });
      const [items, tx, lecturers, init, v2] = await pipeline(cfg, [
        ['HGETALL', K.items], ['HGETALL', K.tx], ['GET', K.lecturers], ['EXISTS', K.init], ['GET', K.version],
      ]);
      let lec = null;
      try { lec = lecturers ? JSON.parse(lecturers) : null; } catch (e) { lec = null; }
      return res.status(200).json({
        version: Number(v2) || 0,
        initialized: init === 1,
        items: hashToList(items),
        tx: hashToList(tx),
        lecturers: lec,
      });
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body || '{}');
      const ops = body && body.ops;
      if (!Array.isArray(ops) || ops.length > MAX_OPS) return res.status(400).json({ error: 'Bad request' });
      let cmds;
      try { cmds = await commandsFor(cfg, ops); } catch (e) { return res.status(400).json({ error: e.message }); }
      cmds.push(['SET', K.init, '1'], ['INCR', K.version]);
      const out = await transaction(cfg, cmds);
      return res.status(200).json({ version: Number(out[out.length - 1]) || 0 });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'server' });
  }
};
