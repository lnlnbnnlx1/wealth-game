require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-please';
const ADMIN_USER = 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

async function q(sql, params = []) {
  const r = await pool.query(sql, params);
  return r.rows;
}

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password TEXT NOT NULL,
      is_admin INTEGER DEFAULT 0,
      is_banned INTEGER DEFAULT 0,
      ban_reason TEXT,
      cash REAL DEFAULT 1000,
      bank REAL DEFAULT 0,
      xp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      current_job INTEGER DEFAULT 0,
      gold REAL DEFAULT 0,
      stocks TEXT DEFAULT '{}',
      businesses TEXT DEFAULT '{}',
      real_estate TEXT DEFAULT '{}',
      deposits TEXT DEFAULT '[]',
      loans TEXT DEFAULT '[]',
      stats TEXT DEFAULT '{}',
      missions TEXT DEFAULT '{}',
      logs TEXT DEFAULT '[]',
      last_work BIGINT DEFAULT 0,
      last_extra BIGINT DEFAULT 0,
      last_seen BIGINT DEFAULT 0,
      created_at BIGINT DEFAULT 0
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gift_codes (
      id SERIAL PRIMARY KEY,
      code VARCHAR(50) UNIQUE NOT NULL,
      cash INTEGER DEFAULT 0,
      xp INTEGER DEFAULT 0,
      gold INTEGER DEFAULT 0,
      max_uses INTEGER DEFAULT 1,
      uses INTEGER DEFAULT 0,
      created_at BIGINT,
      expires_at BIGINT DEFAULT 0
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gift_redemptions (
      id SERIAL PRIMARY KEY,
      code VARCHAR(50),
      user_id INTEGER,
      redeemed_at BIGINT,
      UNIQUE(code, user_id)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS global_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      username VARCHAR(50),
      action VARCHAR(50),
      details TEXT,
      at BIGINT
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS transfers (
      id SERIAL PRIMARY KEY,
      from_id INTEGER,
      from_username VARCHAR(50),
      to_id INTEGER,
      to_username VARCHAR(50),
      amount INTEGER,
      fee INTEGER,
      at BIGINT
    );
  `);

  const admin = await q('SELECT id FROM users WHERE username = $1', [ADMIN_USER]);
  if (admin.length === 0) {
    const hash = bcrypt.hashSync(ADMIN_PASS, 10);
    await q('INSERT INTO users (username,password,is_admin,created_at) VALUES ($1,$2,1,$3)',
      [ADMIN_USER, hash, Date.now()]);
    console.log('✅ Admin created: ' + ADMIN_USER);
  }
  console.log('✅ Database initialized');
}

async function logGlobal(userId, username, action, details) {
  try {
    await q('INSERT INTO global_logs (user_id,username,action,details,at) VALUES ($1,$2,$3,$4,$5)',
      [userId, username, action, details || '', Date.now()]);
  } catch(e) { console.error('log error:', e.message); }
}

function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'غير مصرح' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    q('SELECT * FROM users WHERE id = $1', [payload.id]).then(rows => {
      if (!rows.length) return res.status(401).json({ error: 'حساب غير موجود' });
      const user = rows[0];
      if (user.is_banned) return res.status(403).json({ error: 'محظور: ' + (user.ban_reason || '') });
      req.user = user;
      next();
    }).catch(err => res.status(500).json({ error: err.message }));
  } catch { res.status(401).json({ error: 'جلسة منتهية' }); }
}

function adminOnly(req, res, next) {
  auth(req, res, () => {
    if (!req.user.is_admin) return res.status(403).json({ error: 'أدمن فقط' });
    next();
  });
}

app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'أدخل كل البيانات' });
    if (username.length < 3 || username.length > 20) return res.status(400).json({ error: 'الاسم 3-20 حرف' });
    if (password.length < 4) return res.status(400).json({ error: 'كلمة السر قصيرة' });

    const existing = await q('SELECT id FROM users WHERE username = $1', [username]);
    if (existing.length) return res.status(400).json({ error: 'الاسم مستخدم' });

    const hash = bcrypt.hashSync(password, 10);
    const defaultStats = JSON.stringify({ works:0, extraWorks:0, stocksBought:0, stocksSold:0, deposits:0, goldBought:0, goldSold:0, gamesPlayed:0, gamesWon:0, moneyEarned:0, moneyLost:0 });
    const result = await q(
      'INSERT INTO users (username,password,stats,created_at,last_seen) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [username, hash, defaultStats, Date.now(), Date.now()]
    );
    const userId = result[0].id;
    await logGlobal(userId, username, 'register', 'حساب جديد');
    const token = jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, username });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const rows = await q('SELECT * FROM users WHERE username = $1', [username]);
    if (!rows.length || !bcrypt.compareSync(password, rows[0].password))
      return res.status(400).json({ error: 'بيانات خاطئة' });
    const user = rows[0];
    if (user.is_banned) return res.status(403).json({ error: 'محظور: ' + (user.ban_reason || '') });
    await q('UPDATE users SET last_seen = $1 WHERE id = $2', [Date.now(), user.id]);
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, username: user.username, isAdmin: !!user.is_admin });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/state', auth, (req, res) => {
  const u = req.user;
  res.json({
    username: u.username, cash: u.cash, bank: u.bank, xp: u.xp, level: u.level,
    currentJobId: u.current_job, gold: u.gold,
    stocks: JSON.parse(u.stocks), businesses: JSON.parse(u.businesses),
    realEstate: JSON.parse(u.real_estate), deposits: JSON.parse(u.deposits),
    loans: JSON.parse(u.loans), stats: JSON.parse(u.stats),
    missions: JSON.parse(u.missions), logs: JSON.parse(u.logs),
    lastWork: parseInt(u.last_work), lastExtra: parseInt(u.last_extra),
    isAdmin: !!u.is_admin, serverTime: Date.now()
  });
});

app.post('/api/save', auth, async (req, res) => {
  try {
    const s = req.body;
    const u = req.user;
    if (s.cash < 0 || s.level < 1) return res.status(400).json({ error: 'بيانات غير صحيحة' });
    await q(`UPDATE users SET
      cash=$1, bank=$2, xp=$3, level=$4, current_job=$5, gold=$6,
      stocks=$7, businesses=$8, real_estate=$9, deposits=$10, loans=$11,
      stats=$12, missions=$13, logs=$14, last_work=$15, last_extra=$16, last_seen=$17
      WHERE id=$18`, [
        s.cash, s.bank, s.xp, s.level, s.currentJobId, s.gold,
        JSON.stringify(s.stocks||{}), JSON.stringify(s.businesses||{}),
        JSON.stringify(s.realEstate||{}), JSON.stringify(s.deposits||[]),
        JSON.stringify(s.loans||[]), JSON.stringify(s.stats||{}),
        JSON.stringify(s.missions||{}), JSON.stringify((s.logs||[]).slice(0,60)),
        s.lastWork||0, s.lastExtra||0, Date.now(), u.id
      ]);
    res.json({ ok: true });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/redeem', auth, async (req, res) => {
  try {
    const { code } = req.body;
    const rows = await q('SELECT * FROM gift_codes WHERE code = $1', [code]);
    if (!rows.length) return res.status(400).json({ error: 'كود غير صحيح' });
    const gift = rows[0];
    if (gift.expires_at && Date.now() > gift.expires_at) return res.status(400).json({ error: 'انتهت الصلاحية' });
    if (gift.uses >= gift.max_uses) return res.status(400).json({ error: 'تم استخدام الكود بالكامل' });
    const already = await q('SELECT id FROM gift_redemptions WHERE code=$1 AND user_id=$2', [code, req.user.id]);
    if (already.length) return res.status(400).json({ error: 'استخدمت هذا الكود مسبقاً' });
    await q('UPDATE users SET cash = cash + $1, xp = xp + $2, gold = gold + $3 WHERE id = $4',
      [gift.cash, gift.xp, gift.gold, req.user.id]);
    await q('INSERT INTO gift_redemptions (code,user_id,redeemed_at) VALUES ($1,$2,$3)',
      [code, req.user.id, Date.now()]);
    await q('UPDATE gift_codes SET uses = uses + 1 WHERE code = $1', [code]);
    await logGlobal(req.user.id, req.user.username, 'redeem', 'كود: ' + code);
    res.json({ ok: true, cash: gift.cash, xp: gift.xp, gold: gift.gold });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/leaderboard', auth, async (req, res) => {
  try {
    const list = await q(`
      SELECT username, level, (cash + bank + gold*50) AS wealth, cash, gold
      FROM users WHERE is_banned = 0
      ORDER BY wealth DESC LIMIT 50
    `);
    const myRank = await q(`
      SELECT COUNT(*) + 1 AS rank FROM users
      WHERE is_banned = 0 AND (cash + bank + gold*50) > (
        SELECT cash + bank + gold*50 FROM users WHERE id = $1
      )
    `, [req.user.id]);
    res.json({ list, myRank: parseInt(myRank[0].rank), me: req.user.username });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

const TRANSFER_FEE = 0.05;

app.post('/api/transfer', auth, async (req, res) => {
  try {
    const { to, amount } = req.body;
    const amt = parseInt(amount);
    if (!to || !amt || amt < 10) return res.status(400).json({ error: 'الحد الأدنى 10$' });
    if (to.toLowerCase() === req.user.username.toLowerCase())
      return res.status(400).json({ error: 'لا يمكنك التحويل لنفسك' });
    const target = await q('SELECT * FROM users WHERE username = $1', [to]);
    if (!target.length) return res.status(404).json({ error: 'المستخدم غير موجود' });
    if (target[0].is_banned) return res.status(400).json({ error: 'المستخدم محظور' });
    const fee = Math.ceil(amt * TRANSFER_FEE);
    const total = amt + fee;
    if (req.user.cash < total)
      return res.status(400).json({ error: 'تحتاج ' + total + '$ (منها ' + fee + '$ عمولة)' });

    await q('UPDATE users SET cash = cash - $1 WHERE id = $2', [total, req.user.id]);
    await q('UPDATE users SET cash = cash + $1 WHERE id = $2', [amt, target[0].id]);
    await q('INSERT INTO transfers (from_id,from_username,to_id,to_username,amount,fee,at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [req.user.id, req.user.username, target[0].id, target[0].username, amt, fee, Date.now()]);
    await logGlobal(req.user.id, req.user.username, 'transfer', '→ ' + to + ': ' + amt + '$');
    res.json({ ok: true, sent: amt, fee });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/transfers/history', auth, async (req, res) => {
  try {
    const list = await q('SELECT * FROM transfers WHERE from_id = $1 OR to_id = $2 ORDER BY id DESC LIMIT 30',
      [req.user.id, req.user.id]);
    res.json(list);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/users', adminOnly, async (req, res) => {
  try {
    const list = await q('SELECT id,username,is_admin,is_banned,ban_reason,cash,bank,level,gold,created_at,last_seen FROM users ORDER BY id DESC');
    res.json(list);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/give', adminOnly, async (req, res) => {
  try {
    const { username, cash, xp, gold } = req.body;
    const target = await q('SELECT * FROM users WHERE username = $1', [username]);
    if (!target.length) return res.status(404).json({ error: 'مستخدم غير موجود' });
    await q('UPDATE users SET cash = cash + $1, xp = xp + $2, gold = gold + $3 WHERE id = $4',
      [cash||0, xp||0, gold||0, target[0].id]);
    await logGlobal(req.user.id, req.user.username, 'give', username + ': +' + (cash||0) + '$ +' + (xp||0) + 'xp +' + (gold||0) + 'جم');
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/set', adminOnly, async (req, res) => {
  try {
    const { username, field, value } = req.body;
    const allowed = ['cash','bank','level','gold','is_banned','ban_reason'];
    if (!allowed.includes(field)) return res.status(400).json({ error: 'حقل غير مسموح' });
    const target = await q('SELECT * FROM users WHERE username = $1', [username]);
    if (!target.length) return res.status(404).json({ error: 'مستخدم غير موجود' });
    await q('UPDATE users SET ' + field + ' = $1 WHERE id = $2', [value, target[0].id]);
    await logGlobal(req.user.id, req.user.username, 'set', username + '.' + field + ' = ' + value);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/ban', adminOnly, async (req, res) => {
  try {
    const { username, banned, reason } = req.body;
    const target = await q('SELECT * FROM users WHERE username = $1', [username]);
    if (!target.length) return res.status(404).json({ error: 'مستخدم غير موجود' });
    if (target[0].is_admin) return res.status(400).json({ error: 'لا يمكن حظر أدمن' });
    await q('UPDATE users SET is_banned=$1, ban_reason=$2 WHERE id=$3',
      [banned ? 1 : 0, reason || '', target[0].id]);
    await logGlobal(req.user.id, req.user.username, banned?'ban':'unban', username);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/user/:username', adminOnly, async (req, res) => {
  try {
    const target = await q('SELECT * FROM users WHERE username = $1', [req.params.username]);
    if (!target.length) return res.status(404).json({ error: 'مستخدم غير موجود' });
    if (target[0].is_admin) return res.status(400).json({ error: 'لا يمكن حذف أدمن' });
    await q('DELETE FROM users WHERE id = $1', [target[0].id]);
    await logGlobal(req.user.id, req.user.username, 'delete', req.params.username);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/gift/create', adminOnly, async (req, res) => {
  try {
    let { code, cash, xp, gold, max_uses, expires_in_hours } = req.body;
    if (!code) code = 'GIFT-' + Math.random().toString(36).substring(2,8).toUpperCase();
    const existing = await q('SELECT id FROM gift_codes WHERE code = $1', [code]);
    if (existing.length) return res.status(400).json({ error: 'الكود موجود' });
    const expires = expires_in_hours ? Date.now() + expires_in_hours*3600*1000 : 0;
    await q('INSERT INTO gift_codes (code,cash,xp,gold,max_uses,created_at,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [code, cash||0, xp||0, gold||0, max_uses||1, Date.now(), expires]);
    await logGlobal(req.user.id, req.user.username, 'gift_create', code);
    res.json({ ok: true, code });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/gift/list', adminOnly, async (req, res) => {
  try {
    const list = await q('SELECT * FROM gift_codes ORDER BY id DESC');
    res.json(list);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/gift/:code', adminOnly, async (req, res) => {
  try {
    await q('DELETE FROM gift_codes WHERE code = $1', [req.params.code]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/logs', adminOnly, async (req, res) => {
  try {
    const list = await q('SELECT * FROM global_logs ORDER BY id DESC LIMIT 200');
    res.json(list);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/transfers', adminOnly, async (req, res) => {
  try {
    const list = await q('SELECT * FROM transfers ORDER BY id DESC LIMIT 100');
    res.json(list);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;

initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => console.log('🚀 Server running on port ' + PORT));
}).catch(err => {
  console.error('❌ DB init failed:', err);
  process.exit(1);
});
