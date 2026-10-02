require('dotenv').config();
const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const DB_PATH = process.env.DB_PATH || 'database.db';
const db = new Database(DB_PATH);
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-please';
const ADMIN_USER = 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
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
  last_work INTEGER DEFAULT 0,
  last_extra INTEGER DEFAULT 0,
  last_seen INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS gift_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  cash INTEGER DEFAULT 0,
  xp INTEGER DEFAULT 0,
  gold INTEGER DEFAULT 0,
  max_uses INTEGER DEFAULT 1,
  uses INTEGER DEFAULT 0,
  created_at INTEGER,
  expires_at INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS gift_redemptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT,
  user_id INTEGER,
  redeemed_at INTEGER,
  UNIQUE(code, user_id)
);

CREATE TABLE IF NOT EXISTS global_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  username TEXT,
  action TEXT,
  details TEXT,
  at INTEGER
);

CREATE TABLE IF NOT EXISTS transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id INTEGER,
  from_username TEXT,
  to_id INTEGER,
  to_username TEXT,
  amount INTEGER,
  fee INTEGER,
  at INTEGER
);
`);

const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get(ADMIN_USER);
if (!adminExists) {
  const hash = bcrypt.hashSync(ADMIN_PASS, 10);
  db.prepare(`INSERT INTO users (username,password,is_admin,created_at) VALUES (?,?,1,?)`)
    .run(ADMIN_USER, hash, Date.now());
  console.log('✅ Admin created: ' + ADMIN_USER);
}

function logGlobal(userId, username, action, details) {
  db.prepare('INSERT INTO global_logs (user_id,username,action,details,at) VALUES (?,?,?,?,?)')
    .run(userId, username, action, details || '', Date.now());
}

function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'غير مصرح' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.id);
    if (!user) return res.status(401).json({ error: 'حساب غير موجود' });
    if (user.is_banned) return res.status(403).json({ error: 'محظور: ' + (user.ban_reason || '') });
    req.user = user;
    next();
  } catch { res.status(401).json({ error: 'جلسة منتهية' }); }
}

function adminOnly(req, res, next) {
  auth(req, res, () => {
    if (!req.user.is_admin) return res.status(403).json({ error: 'أدمن فقط' });
    next();
  });
}

app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'أدخل كل البيانات' });
  if (username.length < 3 || username.length > 20) return res.status(400).json({ error: 'الاسم 3-20 حرف' });
  if (password.length < 4) return res.status(400).json({ error: 'كلمة السر قصيرة' });
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username))
    return res.status(400).json({ error: 'الاسم مستخدم' });
  const hash = bcrypt.hashSync(password, 10);
  const defaultStats = JSON.stringify({ works:0, extraWorks:0, stocksBought:0, stocksSold:0, deposits:0, goldBought:0, goldSold:0, gamesPlayed:0, gamesWon:0, moneyEarned:0, moneyLost:0 });
  const info = db.prepare(`INSERT INTO users (username,password,stats,created_at,last_seen) VALUES (?,?,?,?,?)`)
    .run(username, hash, defaultStats, Date.now(), Date.now());
  logGlobal(info.lastInsertRowid, username, 'register', 'حساب جديد');
  const token = jwt.sign({ id: info.lastInsertRowid }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, username });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(400).json({ error: 'بيانات خاطئة' });
  if (user.is_banned) return res.status(403).json({ error: 'محظور: ' + (user.ban_reason || '') });
  db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(Date.now(), user.id);
  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, username: user.username, isAdmin: !!user.is_admin });
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
    lastWork: u.last_work, lastExtra: u.last_extra,
    isAdmin: !!u.is_admin, serverTime: Date.now()
  });
});

app.post('/api/save', auth, (req, res) => {
  const s = req.body;
  const u = req.user;
  if (s.cash < 0 || s.level < 1) return res.status(400).json({ error: 'بيانات غير صحيحة' });
  db.prepare(`UPDATE users SET
    cash=?, bank=?, xp=?, level=?, current_job=?, gold=?,
    stocks=?, businesses=?, real_estate=?, deposits=?, loans=?,
    stats=?, missions=?, logs=?, last_work=?, last_extra=?, last_seen=?
    WHERE id=?`).run(
      s.cash, s.bank, s.xp, s.level, s.currentJobId, s.gold,
      JSON.stringify(s.stocks||{}), JSON.stringify(s.businesses||{}),
      JSON.stringify(s.realEstate||{}), JSON.stringify(s.deposits||[]),
      JSON.stringify(s.loans||[]), JSON.stringify(s.stats||{}),
      JSON.stringify(s.missions||{}), JSON.stringify((s.logs||[]).slice(0,60)),
      s.lastWork||0, s.lastExtra||0, Date.now(), u.id
    );
  res.json({ ok: true });
});

app.post('/api/redeem', auth, (req, res) => {
  const { code } = req.body;
  const gift = db.prepare('SELECT * FROM gift_codes WHERE code = ?').get(code);
  if (!gift) return res.status(400).json({ error: 'كود غير صحيح' });
  if (gift.expires_at && Date.now() > gift.expires_at) return res.status(400).json({ error: 'انتهت الصلاحية' });
  if (gift.uses >= gift.max_uses) return res.status(400).json({ error: 'تم استخدام الكود بالكامل' });
  const already = db.prepare('SELECT id FROM gift_redemptions WHERE code=? AND user_id=?').get(code, req.user.id);
  if (already) return res.status(400).json({ error: 'استخدمت هذا الكود مسبقاً' });
  db.prepare('UPDATE users SET cash = cash + ?, xp = xp + ?, gold = gold + ? WHERE id = ?')
    .run(gift.cash, gift.xp, gift.gold, req.user.id);
  db.prepare('INSERT INTO gift_redemptions (code,user_id,redeemed_at) VALUES (?,?,?)')
    .run(code, req.user.id, Date.now());
  db.prepare('UPDATE gift_codes SET uses = uses + 1 WHERE code = ?').run(code);
  logGlobal(req.user.id, req.user.username, 'redeem', `كود: ${code}`);
  res.json({ ok: true, cash: gift.cash, xp: gift.xp, gold: gift.gold });
});

app.get('/api/leaderboard', auth, (req, res) => {
  const list = db.prepare(`
    SELECT username, level, 
           (cash + bank + gold*50) AS wealth,
           cash, gold
    FROM users 
    WHERE is_banned = 0 
    ORDER BY wealth DESC 
    LIMIT 50
  `).all();
  const myRank = db.prepare(`
    SELECT COUNT(*) + 1 AS rank FROM users 
    WHERE is_banned = 0 AND (cash + bank + gold*50) > (
      SELECT cash + bank + gold*50 FROM users WHERE id = ?
    )
  `).get(req.user.id);
  res.json({ list, myRank: myRank.rank, me: req.user.username });
});

const TRANSFER_FEE = 0.05;

app.post('/api/transfer', auth, (req, res) => {
  const { to, amount } = req.body;
  const amt = parseInt(amount);
  if (!to || !amt || amt < 10) return res.status(400).json({ error: 'الحد الأدنى 10$' });
  if (to.toLowerCase() === req.user.username.toLowerCase())
    return res.status(400).json({ error: 'لا يمكنك التحويل لنفسك' });
  const target = db.prepare('SELECT * FROM users WHERE username = ?').get(to);
  if (!target) return res.status(404).json({ error: 'المستخدم غير موجود' });
  if (target.is_banned) return res.status(400).json({ error: 'المستخدم محظور' });
  const fee = Math.ceil(amt * TRANSFER_FEE);
  const total = amt + fee;
  if (req.user.cash < total)
    return res.status(400).json({ error: `تحتاج ${total}$ (منها ${fee}$ عمولة)` });
  const tx = db.transaction(() => {
    db.prepare('UPDATE users SET cash = cash - ? WHERE id = ?').run(total, req.user.id);
    db.prepare('UPDATE users SET cash = cash + ? WHERE id = ?').run(amt, target.id);
    db.prepare(`INSERT INTO transfers (from_id,from_username,to_id,to_username,amount,fee,at) VALUES (?,?,?,?,?,?,?)`)
      .run(req.user.id, req.user.username, target.id, target.username, amt, fee, Date.now());
  });
  tx();
  logGlobal(req.user.id, req.user.username, 'transfer', `→ ${to}: ${amt}$`);
  res.json({ ok: true, sent: amt, fee, newBalance: req.user.cash - total });
});

app.get('/api/transfers/history', auth, (req, res) => {
  const list = db.prepare(`SELECT * FROM transfers WHERE from_id = ? OR to_id = ? ORDER BY id DESC LIMIT 30`)
    .all(req.user.id, req.user.id);
  res.json(list);
});

app.get('/api/admin/users', adminOnly, (req, res) => {
  res.json(db.prepare(`SELECT id,username,is_admin,is_banned,ban_reason,cash,bank,level,gold,created_at,last_seen FROM users ORDER BY id DESC`).all());
});

app.post('/api/admin/give', adminOnly, (req, res) => {
  const { username, cash, xp, gold, reason } = req.body;
  const target = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!target) return res.status(404).json({ error: 'مستخدم غير موجود' });
  db.prepare('UPDATE users SET cash = cash + ?, xp = xp + ?, gold = gold + ? WHERE id = ?')
    .run(cash||0, xp||0, gold||0, target.id);
  logGlobal(req.user.id, req.user.username, 'give', `${username}: +${cash||0}$ +${xp||0}xp +${gold||0}جم`);
  res.json({ ok: true });
});

app.post('/api/admin/set', adminOnly, (req, res) => {
  const { username, field, value } = req.body;
  const allowed = ['cash','bank','level','gold','is_banned','ban_reason'];
  if (!allowed.includes(field)) return res.status(400).json({ error: 'حقل غير مسموح' });
  const target = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!target) return res.status(404).json({ error: 'مستخدم غير موجود' });
  db.prepare(`UPDATE users SET ${field} = ? WHERE id = ?`).run(value, target.id);
  logGlobal(req.user.id, req.user.username, 'set', `${username}.${field} = ${value}`);
  res.json({ ok: true });
});

app.post('/api/admin/ban', adminOnly, (req, res) => {
  const { username, banned, reason } = req.body;
  const target = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!target) return res.status(404).json({ error: 'مستخدم غير موجود' });
  if (target.is_admin) return res.status(400).json({ error: 'لا يمكن حظر أدمن' });
  db.prepare('UPDATE users SET is_banned=?, ban_reason=? WHERE id=?')
    .run(banned ? 1 : 0, reason || '', target.id);
  logGlobal(req.user.id, req.user.username, banned?'ban':'unban', username);
  res.json({ ok: true });
});

app.delete('/api/admin/user/:username', adminOnly, (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE username = ?').get(req.params.username);
  if (!target) return res.status(404).json({ error: 'مستخدم غير موجود' });
  if (target.is_admin) return res.status(400).json({ error: 'لا يمكن حذف أدمن' });
  db.prepare('DELETE FROM users WHERE id = ?').run(target.id);
  logGlobal(req.user.id, req.user.username, 'delete', req.params.username);
  res.json({ ok: true });
});

app.post('/api/admin/gift/create', adminOnly, (req, res) => {
  let { code, cash, xp, gold, max_uses, expires_in_hours } = req.body;
  if (!code) code = 'GIFT-' + Math.random().toString(36).substring(2,8).toUpperCase();
  if (db.prepare('SELECT id FROM gift_codes WHERE code = ?').get(code))
    return res.status(400).json({ error: 'الكود موجود' });
  const expires = expires_in_hours ? Date.now() + expires_in_hours*3600*1000 : 0;
  db.prepare('INSERT INTO gift_codes (code,cash,xp,gold,max_uses,created_at,expires_at) VALUES (?,?,?,?,?,?,?)')
    .run(code, cash||0, xp||0, gold||0, max_uses||1, Date.now(), expires);
  logGlobal(req.user.id, req.user.username, 'gift_create', code);
  res.json({ ok: true, code });
});

app.get('/api/admin/gift/list', adminOnly, (req, res) => {
  res.json(db.prepare('SELECT * FROM gift_codes ORDER BY id DESC').all());
});

app.delete('/api/admin/gift/:code', adminOnly, (req, res) => {
  db.prepare('DELETE FROM gift_codes WHERE code = ?').run(req.params.code);
  res.json({ ok: true });
});

app.get('/api/admin/logs', adminOnly, (req, res) => {
  res.json(db.prepare('SELECT * FROM global_logs ORDER BY id DESC LIMIT 200').all());
});

app.get('/api/admin/transfers', adminOnly, (req, res) => {
  res.json(db.prepare('SELECT * FROM transfers ORDER BY id DESC LIMIT 100').all());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));
