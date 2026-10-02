// ============ GAME DATA ============
const JOBS = [
  { id:0, name:'عاطل', pay:0, extra:0, level:1 },
  { id:1, name:'عامل نظافة', pay:15, extra:40, level:1 },
  { id:2, name:'موظف كاشير', pay:35, extra:90, level:2 },
  { id:3, name:'سائق توصيل', pay:60, extra:150, level:3 },
  { id:4, name:'بائع', pay:90, extra:220, level:4 },
  { id:5, name:'محاسب', pay:140, extra:340, level:5 },
  { id:6, name:'مبرمج', pay:200, extra:480, level:7 },
  { id:7, name:'مهندس', pay:280, extra:650, level:9 },
  { id:8, name:'طبيب', pay:400, extra:900, level:11 },
  { id:9, name:'محامي', pay:550, extra:1200, level:13 },
  { id:10, name:'مدير شركة', pay:750, extra:1700, level:15 },
  { id:11, name:'رجل أعمال', pay:1000, extra:2400, level:18 },
  { id:12, name:'مستثمر', pay:1500, extra:3500, level:22 },
  { id:13, name:'ملياردير', pay:2500, extra:6000, level:27 }
];

const STOCKS = [
  { sym:'TECH', name:'شركة التقنية', price:100 },
  { sym:'GOLD', name:'مناجم الذهب', price:250 },
  { sym:'OIL',  name:'النفط', price:180 },
  { sym:'BANK', name:'البنك الوطني', price:320 },
  { sym:'AUTO', name:'السيارات', price:150 }
];

const BUSINESSES = [
  { id:'cafe', name:'☕ كافيه', price:5000, income:80 },
  { id:'market', name:'🛒 سوبر ماركت', price:15000, income:250 },
  { id:'factory', name:'🏭 مصنع', price:50000, income:900 }
];

const REALESTATE = [
  { id:'apt', name:'🏢 شقة', price:20000, rent:120 },
  { id:'shop', name:'🏪 محل', price:60000, rent:400 },
  { id:'tower', name:'🏙️ برج', price:200000, rent:1600 }
];

const MISSIONS = [
  { id:'work5', text:'اعمل 5 مرات', target:5, xp:50, money:200, check:()=>S.stats.works },
  { id:'firstStock', text:'اشترِ أول سهم', target:1, xp:30, money:100, check:()=>S.stats.stocksBought },
  { id:'firstDeposit', text:'أول وديعة بنكية', target:1, xp:40, money:150, check:()=>S.stats.deposits },
  { id:'work20', text:'اعمل 20 مرة', target:20, xp:150, money:600, check:()=>S.stats.works },
  { id:'playGame', text:'العب لعبة واحدة', target:1, xp:20, money:50, check:()=>S.stats.gamesPlayed },
  { id:'buyGold', text:'اشترِ ذهب', target:1, xp:30, money:100, check:()=>S.stats.goldBought },
  { id:'level5', text:'اصل للمستوى 5', target:5, xp:100, money:400, check:()=>S.level },
  { id:'millionaire', text:'اجمع صافي ثروة 10,000', target:10000, xp:300, money:2000, check:()=>getNetWorth() }
];

// ============ STATE ============
let S = {
  cash: 1000, bank: 0, xp: 0, level: 1, currentJobId: 0,
  gold: 0, goldPrice: 50, goldTrend: 1,
  stocks: {}, businesses: {}, realEstate: {},
  deposits: [], loans: [], logs: [], bankStatement: [],
  stats: { works:0, extraWorks:0, stocksBought:0, stocksSold:0, deposits:0, goldBought:0, goldSold:0, gamesPlayed:0, gamesWon:0, moneyEarned:0, moneyLost:0 },
  missions: {}, lastWork: 0, lastExtra: 0, lastTick: Date.now()
};

const WORK_CD = 3000;
const EXTRA_CD = 18000;

// ============ ONLINE ============
const TOKEN = localStorage.getItem('token');
const USERNAME = localStorage.getItem('username');
if (!TOKEN) location.href = '/login.html';

let SERVER_OFFSET = 0;
function now() { return Date.now() + SERVER_OFFSET; }

async function api(path, method='GET', body=null) {
  const opt = { method, headers: { 'Authorization': 'Bearer ' + TOKEN } };
  if (body) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  const r = await fetch('/api' + path, opt);
  if (r.status === 401 || r.status === 403) {
    const d = await r.json();
    alert(d.error || 'انتهت الجلسة');
    if (r.status === 401) { localStorage.clear(); location.href='/login.html'; }
    return {};
  }
  return r.json();
}

async function loadFromServer() {
  const d = await api('/state');
  if (!d || d.error) return;
  SERVER_OFFSET = d.serverTime - Date.now();
  S.cash = d.cash; S.bank = d.bank; S.xp = d.xp; S.level = d.level;
  S.currentJobId = d.currentJobId; S.gold = d.gold;
  S.stocks = d.stocks || {}; S.businesses = d.businesses || {};
  S.realEstate = d.realEstate || {}; S.deposits = d.deposits || [];
  S.loans = d.loans || [];
  Object.assign(S.stats, d.stats || {});
  S.missions = d.missions || {}; S.logs = d.logs || [];
  S.lastWork = d.lastWork || 0; S.lastExtra = d.lastExtra || 0;
  window.IS_ADMIN = d.isAdmin;
}

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await api('/save', 'POST', {
      cash: S.cash, bank: S.bank, xp: S.xp, level: S.level,
      currentJobId: S.currentJobId, gold: S.gold,
      stocks: S.stocks, businesses: S.businesses, realEstate: S.realEstate,
      deposits: S.deposits, loans: S.loans, stats: S.stats,
      missions: S.missions, logs: S.logs,
      lastWork: S.lastWork, lastExtra: S.lastExtra
    });
  }, 1200);
}

// ============ HELPERS ============
function fmt(n) { return '$' + Math.floor(n).toLocaleString('en-US'); }
function toast(msg, type='') {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(()=>t.classList.add('show'), 10);
  setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=>t.remove(), 300); }, 2400);
}
function addLog(text) {
  S.logs.unshift({ text, time: now() });
  if (S.logs.length > 60) S.logs.pop();
}
function addBankStatement(text) {
  S.bankStatement.unshift({ text, time: now() });
  if (S.bankStatement.length > 30) S.bankStatement.pop();
}
function xpNeeded(level) { return 100 + (level-1) * 60; }
function addXP(amount) {
  S.xp += amount;
  while (S.xp >= xpNeeded(S.level)) {
    S.xp -= xpNeeded(S.level);
    S.level++;
    toast('🎉 ترقيت للمستوى ' + S.level + '!', 'success');
    addLog('🎉 وصلت للمستوى ' + S.level);
  }
}
function getNetWorth() {
  let n = S.cash + S.bank + S.gold * S.goldPrice;
  for (const sym in S.stocks) {
    const st = STOCKS.find(s=>s.sym===sym);
    if (st) n += S.stocks[sym] * st.price;
  }
  for (const id in S.businesses) {
    const b = BUSINESSES.find(x=>x.id===id);
    if (b) n += b.price * S.businesses[id];
  }
  for (const id in S.realEstate) {
    const r = REALESTATE.find(x=>x.id===id);
    if (r) n += r.price * S.realEstate[id];
  }
  S.deposits.forEach(d => {
    const elapsed = now() - d.start;
    const ready = elapsed >= d.duration;
    n += ready ? Math.floor(d.amount * 1.05) : d.amount;
  });
  S.loans.forEach(l => n -= l.amount);
  return n;
}

// ============ RENDER ============
function render() {
  document.getElementById('cash').textContent = fmt(S.cash);
  document.getElementById('bank').textContent = fmt(S.bank);
  document.getElementById('netWorth').textContent = fmt(getNetWorth());
  document.getElementById('level').textContent = S.level;
  const need = xpNeeded(S.level);
  document.getElementById('xpText').textContent = S.xp + '/' + need;
  document.getElementById('xpBar').style.width = (S.xp/need*100) + '%';

  const job = JOBS[S.currentJobId];
  document.getElementById('jobText').textContent = job.name;
  document.getElementById('currentJobName').textContent = job.name;
  document.getElementById('currentJobPay').textContent = job.pay > 0
    ? `عادي: ${fmt(job.pay)} | إضافي: ${fmt(job.extra)}`
    : 'اذهب لتبويب الوظائف لاختيار وظيفة';

  document.getElementById('goldPrice').textContent = fmt(S.goldPrice);
  document.getElementById('goldTrend').textContent = S.goldTrend >= 0 ? '📈 صاعد' : '📉 هابط';
  document.getElementById('goldHeld').textContent = S.gold + ' جم';
  document.getElementById('goldValue').textContent = 'القيمة: ' + fmt(S.gold * S.goldPrice);

  renderJobs();
  renderStocks();
  renderPortfolio();
  renderDeposits();
  renderLoans();
  renderBankStatement();
  renderBusinesses();
  renderRealEstate();
  renderOwnedAssets();
  renderMissions();
  renderStats();
  renderLogs();
  scheduleSave();
}

function renderJobs() {
  const el = document.getElementById('jobsList');
  el.innerHTML = JOBS.slice(1).map(j => {
    const locked = S.level < j.level;
    const current = S.currentJobId === j.id;
    return `<div class="job-card ${locked?'locked':''} ${current?'current':''}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <div>
          <strong style="font-size:13px;">${j.name}</strong> ${current?'<span class="badge">حالية</span>':''}
          <small style="display:block;color:#8888aa;font-size:10px;">المستوى المطلوب: ${j.level}</small>
        </div>
        <div style="text-align:left;">
          <div style="color:#00ff88;font-size:12px;">${fmt(j.pay)}</div>
          <div style="color:#bb66ff;font-size:11px;">+ ${fmt(j.extra)}</div>
        </div>
      </div>
      <button class="full ${locked?'':'purple'}" ${locked||current?'disabled':''} onclick="changeJob(${j.id})">
        ${locked ? '🔒 مقفول' : current ? '✓ وظيفتك الحالية' : 'تعيين'}
      </button>
    </div>`;
  }).join('');
}

function renderStocks() {
  const el = document.getElementById('stocksList');
  el.innerHTML = STOCKS.map(s => {
    const held = S.stocks[s.sym] || 0;
    return `<div class="list-item">
      <div>
        <strong>${s.sym}</strong> - ${s.name}
        <small>لديك: ${held} سهم | القيمة: ${fmt(held * s.price)}</small>
      </div>
      <div style="text-align:left;">
        <div class="stat-value" style="font-size:13px;">${fmt(s.price)}</div>
        <div style="display:flex;gap:4px;margin-top:4px;">
          <button style="padding:4px 8px;font-size:10px;" onclick="buyStock('${s.sym}')">شراء</button>
          <button class="danger" style="padding:4px 8px;font-size:10px;" onclick="sellStock('${s.sym}')">بيع</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function renderPortfolio() {
  const el = document.getElementById('portfolioList');
  const entries = Object.entries(S.stocks).filter(([_,q])=>q>0);
  if (!entries.length) { el.innerHTML = '<div class="empty">لا تملك أسهم</div>'; return; }
  el.innerHTML = entries.map(([sym,qty]) => {
    const st = STOCKS.find(s=>s.sym===sym);
    return `<div class="list-item">
      <div><strong>${sym}</strong><small>${qty} سهم × ${fmt(st.price)}</small></div>
      <div class="stat-value green">${fmt(qty * st.price)}</div>
    </div>`;
  }).join('');
}

function renderDeposits() {
  const el = document.getElementById('depositsList');
  if (!S.deposits.length) { el.innerHTML = '<div class="empty">لا توجد ودائع</div>'; return; }
  el.innerHTML = S.deposits.map((d,i) => {
    const elapsed = now() - d.start;
    const pct = Math.min(100, elapsed/d.duration*100);
    const ready = elapsed >= d.duration;
    const maturity = Math.floor(d.amount * 1.05);
    return `<div class="list-item" style="flex-direction:column;align-items:stretch;">
      <div style="display:flex;justify-content:space-between;">
        <div><strong>${fmt(d.amount)}</strong><small>${ready?'✅ جاهز للسحب':'⏳ قيد الانتظار'}</small></div>
        <div class="stat-value green">${ready?fmt(maturity):fmt(d.amount)}</div>
      </div>
      <div class="progress-mini"><div style="width:${pct}%"></div></div>
      <button class="full ${ready?'gold':''}" style="margin-top:6px;padding:6px;font-size:11px;" ${ready?'':'disabled'} onclick="withdrawDeposit(${i})">
        ${ready?'سحب':'انتظر...'}
      </button>
    </div>`;
  }).join('');
}

function renderLoans() {
  const el = document.getElementById('loansList');
  if (!S.loans.length) { el.innerHTML = '<div class="empty">لا توجد قروض</div>'; return; }
  el.innerHTML = S.loans.map((l,i) => {
    const due = Math.floor(l.amount * 1.15);
    const late = now() > l.dueDate;
    const final = late ? Math.floor(due * 1.1) : due;
    return `<div class="list-item">
      <div><strong>${fmt(l.amount)}</strong><small>${late?'⚠️ متأخر!':'المستحق: '+fmt(due)}</small></div>
      <button class="danger" style="padding:6px 10px;font-size:11px;" onclick="payLoan(${i})">سدد ${fmt(final)}</button>
    </div>`;
  }).join('');
}

function renderBankStatement() {
  const el = document.getElementById('bankStatement');
  if (!S.bankStatement.length) { el.innerHTML = '<div class="empty">لا توجد عمليات</div>'; return; }
  el.innerHTML = S.bankStatement.slice(0,10).map(s => `<div class="log-item">${s.text}</div>`).join('');
}

function renderBusinesses() {
  const el = document.getElementById('businessList');
  el.innerHTML = BUSINESSES.map(b => {
    const owned = S.businesses[b.id] || 0;
    const canAfford = S.cash >= b.price;
    return `<div class="list-item">
      <div>
        <strong>${b.name}</strong>
        <small>دخل: ${fmt(b.income)}/دقيقة | تملك: ${owned}</small>
      </div>
      <button class="${canAfford?'gold':''}" style="padding:6px 10px;font-size:11px;" ${canAfford?'':'disabled'} onclick="buyBusiness('${b.id}')">
        ${fmt(b.price)}
      </button>
    </div>`;
  }).join('');
}

function renderRealEstate() {
  const el = document.getElementById('realEstateList');
  el.innerHTML = REALESTATE.map(r => {
    const owned = S.realEstate[r.id] || 0;
    const canAfford = S.cash >= r.price;
    return `<div class="list-item">
      <div>
        <strong>${r.name}</strong>
        <small>إيجار: ${fmt(r.rent)}/دقيقة | تملك: ${owned}</small>
      </div>
      <button class="${canAfford?'purple':''}" style="padding:6px 10px;font-size:11px;" ${canAfford?'':'disabled'} onclick="buyRealEstate('${r.id}')">
        ${fmt(r.price)}
      </button>
    </div>`;
  }).join('');
}

function renderOwnedAssets() {
  const el = document.getElementById('ownedAssets');
  let html = '';
  let totalIncome = 0;
  for (const id in S.businesses) {
    const b = BUSINESSES.find(x=>x.id===id);
    const qty = S.businesses[id];
    totalIncome += b.income * qty;
    html += `<div class="list-item"><div><strong>${b.name} ×${qty}</strong><small>${fmt(b.income*qty)}/دقيقة</small></div></div>`;
  }
  for (const id in S.realEstate) {
    const r = REALESTATE.find(x=>x.id===id);
    const qty = S.realEstate[id];
    totalIncome += r.rent * qty;
    html += `<div class="list-item"><div><strong>${r.name} ×${qty}</strong><small>${fmt(r.rent*qty)}/دقيقة</small></div></div>`;
  }
  if (!html) html = '<div class="empty">لا تملك أعمال أو عقارات</div>';
  else html = `<div class="list-item" style="border:1px solid #00ff88;"><div><strong>💰 إجمالي الدخل</strong></div><div class="stat-value green">${fmt(totalIncome)}/دقيقة</div></div>` + html;
  el.innerHTML = html;
}

function renderMissions() {
  const el = document.getElementById('missionsList');
  el.innerHTML = MISSIONS.map(m => {
    const done = S.missions[m.id];
    const progress = Math.min(m.target, m.check());
    const pct = progress/m.target*100;
    return `<div class="list-item" style="flex-direction:column;align-items:stretch;">
      <div style="display:flex;justify-content:space-between;">
        <div><strong>${m.text}</strong><small>${progress}/${m.target} | +${m.xp} XP +${fmt(m.money)}</small></div>
        <div>${done?'✅':'⏳'}</div>
      </div>
      <div class="progress-mini"><div style="width:${pct}%;background:${done?'#00ff88':'#bb66ff'}"></div></div>
    </div>`;
  }).join('');
}

function renderStats() {
  const el = document.getElementById('statsList');
  const st = S.stats;
  const totalIncome = Object.entries(S.businesses).reduce((s,[id,q])=>s+BUSINESSES.find(b=>b.id===id).income*q,0)
                    + Object.entries(S.realEstate).reduce((s,[id,q])=>s+REALESTATE.find(r=>r.id===id).rent*q,0);
  el.innerHTML = `
    <div class="list-item"><span>مرات العمل</span><strong>${st.works}</strong></div>
    <div class="list-item"><span>أعمال إضافية</span><strong>${st.extraWorks}</strong></div>
    <div class="list-item"><span>أسهم مشتراة</span><strong>${st.stocksBought}</strong></div>
    <div class="list-item"><span>أسهم مبيعة</span><strong>${st.stocksSold}</strong></div>
    <div class="list-item"><span>ودائع بنكية</span><strong>${st.deposits}</strong></div>
    <div class="list-item"><span>ذهب مشترى</span><strong>${st.goldBought} جم</strong></div>
    <div class="list-item"><span>ألعاب لعبتها</span><strong>${st.gamesPlayed}</strong></div>
    <div class="list-item"><span>ألعاب فزت بها</span><strong>${st.gamesWon}</strong></div>
    <div class="list-item"><span>إجمالي الدخل السلبي</span><strong class="stat-value green">${fmt(totalIncome)}/دقيقة</strong></div>
  `;
}

function renderLogs() {
  const el = document.getElementById('logList');
  if (!S.logs.length) { el.innerHTML = '<div class="empty">لا توجد عمليات</div>'; return; }
  el.innerHTML = S.logs.slice(0,25).map(l => {
    const d = new Date(l.time);
    const t = d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
    return `<div class="log-item"><span style="color:#6666aa;font-size:9px;">${t}</span> ${l.text}</div>`;
  }).join('');
}

// ============ ACTIONS ============
function changeJob(id) {
  const j = JOBS[id];
  if (S.level < j.level) { toast('🔒 تحتاج المستوى ' + j.level, 'error'); return; }
  S.currentJobId = id;
  toast('✅ تم تعيينك: ' + j.name, 'success');
  addLog('💼 وظيفة جديدة: ' + j.name);
  render();
}

document.getElementById('workBtn').onclick = () => {
  if (now() - S.lastWork < WORK_CD) { toast('⏳ انتظر', 'error'); return; }
  const job = JOBS[S.currentJobId];
  if (job.pay <= 0) { toast('⚠️ اختر وظيفة أولاً', 'error'); return; }
  S.lastWork = now();
  const earned = job.pay;
  S.cash += earned;
  S.stats.works++;
  S.stats.moneyEarned += earned;
  const xp = Math.floor(earned / 4);
  addXP(xp);
  toast('💵 +' + fmt(earned) + ' | +' + xp + ' XP', 'success');
  addLog('⚡ عمل عادي: +' + fmt(earned));
  checkMissions();
  render();
};

document.getElementById('workExtraBtn').onclick = () => {
  if (now() - S.lastExtra < EXTRA_CD) { toast('⏳ العمل الإضافي غير متاح', 'error'); return; }
  const job = JOBS[S.currentJobId];
  if (job.extra <= 0) { toast('⚠️ اختر وظيفة أولاً', 'error'); return; }
  S.lastExtra = now();
  const earned = job.extra;
  S.cash += earned;
  S.stats.extraWorks++;
  S.stats.moneyEarned += earned;
  const xp = Math.floor(earned / 3);
  addXP(xp);
  toast('🔥 +' + fmt(earned) + ' | +' + xp + ' XP', 'success');
  addLog('🔥 عمل إضافي: +' + fmt(earned));
  checkMissions();
  render();
};

document.getElementById('depositBtn').onclick = () => {
  const amount = parseInt(document.getElementById('depositAmount').value) || 0;
  if (amount < 50) { toast('الحد الأدنى 50$', 'error'); return; }
  if (amount > S.cash) { toast('مالك لا يكفي', 'error'); return; }
  S.cash -= amount;
  S.deposits.push({ amount, start: now(), duration: 10*60*1000 });
  S.stats.deposits++;
  addBankStatement('📥 إيداع: ' + fmt(amount));
  addLog('🏦 إيداع بنكي: ' + fmt(amount));
  toast('✅ تم الإيداع', 'success');
  checkMissions();
  render();
};

function withdrawDeposit(i) {
  const d = S.deposits[i];
  if (now() - d.start < d.duration) { toast('⏳ لم يحن الاستحقاق', 'error'); return; }
  const total = Math.floor(d.amount * 1.05);
  S.bank += total;
  S.deposits.splice(i, 1);
  addBankStatement('📤 سحب + فائدة: ' + fmt(total));
  addLog('🏦 سحب وديعة: +' + fmt(total));
  toast('💰 استلمت ' + fmt(total), 'success');
  render();
}

document.getElementById('loanBtn').onclick = () => {
  const amount = parseInt(document.getElementById('loanAmount').value) || 0;
  if (amount < 100) { toast('الحد الأدنى 100$', 'error'); return; }
  if (S.loans.length >= 3) { toast('لا يمكنك أخذ أكثر من 3 قروض', 'error'); return; }
  const max = 1000 + S.level * 500;
  if (amount > max) { toast('الحد الأقصى ' + fmt(max), 'error'); return; }
  S.cash += amount;
  S.loans.push({ amount, dueDate: now() + 5*60*1000 });
  addBankStatement('💳 قرض: +' + fmt(amount));
  addLog('💳 قرض: ' + fmt(amount));
  toast('✅ حصلت على ' + fmt(amount), 'success');
  render();
};

function payLoan(i) {
  const l = S.loans[i];
  const late = now() > l.dueDate;
  const due = Math.floor(l.amount * 1.15 * (late ? 1.1 : 1));
  if (S.cash < due) { toast('💸 لا تملك ' + fmt(due), 'error'); return; }
  S.cash -= due;
  S.loans.splice(i, 1);
  addBankStatement('✅ سداد قرض: -' + fmt(due));
  addLog('✅ سددت قرض: ' + fmt(due));
  toast('✅ تم السداد', 'success');
  render();
}

document.getElementById('buyGoldBtn').onclick = () => {
  const qty = parseInt(document.getElementById('goldBuyQty').value) || 0;
  if (qty < 1) { toast('أدخل عدد صحيح', 'error'); return; }
  const cost = qty * S.goldPrice;
  if (S.cash < cost) { toast('مالك لا يكفي', 'error'); return; }
  S.cash -= cost;
  S.gold += qty;
  S.stats.goldBought += qty;
  addLog('🪙 شراء ذهب: ' + qty + 'جم بـ ' + fmt(cost));
  toast('✅ اشتريت ' + qty + ' جم', 'success');
  checkMissions();
  render();
};

document.getElementById('sellGoldBtn').onclick = () => {
  if (S.gold <= 0) { toast('لا تملك ذهب', 'error'); return; }
  const revenue = S.gold * S.goldPrice;
  S.cash += revenue;
  S.stats.goldSold += S.gold;
  addLog('🪙 بيع ذهب: +' + fmt(revenue));
  toast('💰 بعت بـ ' + fmt(revenue), 'success');
  S.gold = 0;
  render();
};

function buyStock(sym) {
  const st = STOCKS.find(s=>s.sym===sym);
  if (S.cash < st.price) { toast('مالك لا يكفي', 'error'); return; }
  S.cash -= st.price;
  S.stocks[sym] = (S.stocks[sym] || 0) + 1;
  S.stats.stocksBought++;
  addLog('📈 شراء سهم ' + sym);
  toast('✅ اشتريت سهم ' + sym, 'success');
  checkMissions();
  render();
}

function sellStock(sym) {
  const held = S.stocks[sym] || 0;
  if (held <= 0) { toast('لا تملك أسهم', 'error'); return; }
  const st = STOCKS.find(s=>s.sym===sym);
  const revenue = st.price * held;
  S.cash += revenue;
  S.stats.stocksSold += held;
  S.stocks[sym] = 0;
  addLog('📉 بيع ' + held + ' سهم ' + sym + ': +' + fmt(revenue));
  toast('💰 بعت بـ ' + fmt(revenue), 'success');
  render();
}

function buyBusiness(id) {
  const b = BUSINESSES.find(x=>x.id===id);
  if (S.cash < b.price) { toast('مالك لا يكفي', 'error'); return; }
  S.cash -= b.price;
  S.businesses[id] = (S.businesses[id] || 0) + 1;
  addLog('🏢 اشتريت ' + b.name);
  toast('✅ امتلكت ' + b.name, 'success');
  render();
}

function buyRealEstate(id) {
  const r = REALESTATE.find(x=>x.id===id);
  if (S.cash < r.price) { toast('مالك لا يكفي', 'error'); return; }
  S.cash -= r.price;
  S.realEstate[id] = (S.realEstate[id] || 0) + 1;
  addLog('🏠 اشتريت ' + r.name);
  toast('✅ امتلكت ' + r.name, 'success');
  render();
}

// ============ GAMES ============
function getBet() {
  const bet = parseInt(document.getElementById('betAmount').value) || 0;
  if (bet < 10) { toast('الحد الأدنى 10$', 'error'); return 0; }
  if (bet > S.cash) { toast('مالك لا يكفي', 'error'); return 0; }
  return bet;
}
function setResult(text) { document.getElementById('gameResult').textContent = text; }
function win(amount) { S.cash += amount; S.stats.gamesWon++; S.stats.moneyEarned += amount; addLog('🎰 ربح: +' + fmt(amount)); toast('🎉 ربحت ' + fmt(amount), 'success'); }
function lose(amount) { S.stats.moneyLost += amount; addLog('🎰 خسارة: -' + fmt(amount)); }

function playSlots() {
  const bet = getBet(); if (!bet) return;
  S.cash -= bet; S.stats.gamesPlayed++;
  const emojis = ['🍒','🍋','💎','7️⃣','⭐','🍀'];
  const r = [0,1,2].map(()=>emojis[Math.floor(Math.random()*emojis.length)]);
  document.getElementById('gameResult').innerHTML = `<div class="slot-reels"><div class="reel">${r[0]}</div><div class="reel">${r[1]}</div><div class="reel">${r[2]}</div></div>`;
  if (r[0]===r[1] && r[1]===r[2]) {
    const mult = r[0]==='7️⃣' ? 20 : r[0]==='💎' ? 10 : 5;
    win(bet * mult);
    setResult(`🎉 ${r[0]} ${r[1]} ${r[2]} - فزت ${mult}x!`);
  } else if (r[0]===r[1] || r[1]===r[2] || r[0]===r[2]) {
    win(bet * 2); setResult('✅ زوج متطابق! ربحت 2x');
  } else { lose(bet); setResult(`❌ ${r[0]} ${r[1]} ${r[2]} - خسرت`); }
  checkMissions(); render();
}

function playPlane() {
  const bet = getBet(); if (!bet) return;
  S.cash -= bet; S.stats.gamesPlayed++;
  const mult = 1 + Math.random() * 5;
  const crash = Math.random() < 0.45;
  if (crash) { lose(bet); setResult(`✈️💥 سقطت عند ${mult.toFixed(2)}x`); toast('💥 خسرت', 'error'); }
  else { const w = Math.floor(bet * mult); win(w); setResult(`✈️ هبطت عند ${mult.toFixed(2)}x - ربحت ${fmt(w)}`); }
  checkMissions(); render();
}

function playShapes() {
  const bet = getBet(); if (!bet) return;
  S.cash -= bet; S.stats.gamesPlayed++;
  const shapes = ['🔴','🔵','🟢','🟡'];
  const target = shapes[Math.floor(Math.random()*shapes.length)];
  const picked = shapes[Math.floor(Math.random()*shapes.length)];
  if (target === picked) { win(bet * 4); setResult(`🎯 ${picked} === ${target} - ربحت 4x!`); }
  else { lose(bet); setResult(`❌ ${picked} ≠ ${target} - خسرت`); }
  checkMissions(); render();
}

function playWheel() {
  const bet = getBet(); if (!bet) return;
  S.cash -= bet; S.stats.gamesPlayed++;
  const mults = [0, 0.5, 1, 2, 3, 5, 10];
  const m = mults[Math.floor(Math.random()*mults.length)];
  if (m === 0) { lose(bet); setResult('🎡 0x - خسرت'); toast('💸 خسرت', 'error'); }
  else { const w = Math.floor(bet * m); win(w); setResult(`🎡 ${m}x - ربحت ${fmt(w)}`); }
  checkMissions(); render();
}

function playRPS() {
  const bet = getBet(); if (!bet) return;
  S.cash -= bet; S.stats.gamesPlayed++;
  const opts = ['✊','✋','✌️'];
  const player = opts[Math.floor(Math.random()*3)];
  const cpu = opts[Math.floor(Math.random()*3)];
  let res;
  if (player === cpu) { S.cash += bet; res = `🤝 تعادل (${player} vs ${cpu})`; }
  else if ((player==='✊'&&cpu==='✌️')||(player==='✋'&&cpu==='✊')||(player==='✌️'&&cpu==='✋')) { win(bet * 2); res = `🎉 فزت! (${player} vs ${cpu})`; }
  else { lose(bet); res = `❌ خسرت (${player} vs ${cpu})`; }
  setResult(res);
  checkMissions(); render();
}

// ============ MISSIONS ============
function checkMissions() {
  MISSIONS.forEach(m => {
    if (S.missions[m.id]) return;
    if (m.check() >= m.target) {
      S.missions[m.id] = true;
      addXP(m.xp);
      S.cash += m.money;
      toast('🎯 مهمة: ' + m.text, 'success');
      addLog('🎯 مهمة: ' + m.text);
    }
  });
}

// ============ TRANSFER ============
async function doTransfer() {
  const to = document.getElementById('transferee').value.trim();
  const amount = parseInt(document.getElementById('transferAmount').value);
  if (!to) { toast('❌ أدخل اسم المستخدم', 'error'); return; }
  if (!amount || amount < 10) { toast('❌ الحد الأدنى 10$', 'error'); return; }
  const fee = Math.ceil(amount * 0.05);
  if (!confirm(`سيتم خصم ${amount + fee}$ (منها ${fee}$ عمولة). متابعة؟`)) return;
  const r = await api('/transfer', 'POST', { to, amount });
  if (r.error) { toast('❌ ' + r.error, 'error'); return; }
  S.cash -= (r.sent + r.fee);
  toast(`✅ أرسلت ${r.sent}$ إلى ${to}`, 'success');
  addLog(`💸 تحويل إلى ${to}: -${r.sent + r.fee}$`);
  render();
  loadTransferHistory();
}

async function loadTransferHistory() {
  const list = await api('/transfers/history');
  if (!list || !Array.isArray(list)) return;
  const el = document.getElementById('transferHistory');
  if (!list.length) { el.innerHTML = '<div class="empty">لا توجد تحويلات</div>'; return; }
  el.innerHTML = list.map(t => {
    const isSender = t.from_username === USERNAME;
    const d = new Date(t.at);
    const time = d.getHours() + ':' + String(d.getMinutes()).padStart(2,'0');
    if (isSender) return `<div class="list-item" style="border-right:2px solid #ff4444;"><div><strong>📤 إلى ${t.to_username}</strong><small>${time}</small></div><div class="stat-value" style="color:#ff4444;">-$${t.amount + t.fee}</div></div>`;
    return `<div class="list-item" style="border-right:2px solid #00ff88;"><div><strong>📥 من ${t.from_username}</strong><small>${time}</small></div><div class="stat-value green">+$${t.amount}</div></div>`;
  }).join('');
}

// ============ LEADERBOARD ============
async function loadLeaderboard() {
  const data = await api('/leaderboard');
  if (!data || !data.list) return;
  document.getElementById('myRankBox').innerHTML = `
    <div style="padding:12px;background:linear-gradient(135deg,rgba(0,229,255,.15),rgba(187,102,255,.15));border:1px solid #00e5ff;border-radius:12px;text-align:center;">
      <div style="font-size:11px;color:#8888aa;">ترتيبك</div>
      <div style="font-size:24px;font-weight:bold;color:#ffd700;">#${data.myRank}</div>
      <div style="font-size:11px;color:#00e5ff;">${data.me}</div>
    </div>`;
  const medals = ['🥇','🥈','🥉'];
  document.getElementById('leaderboardList').innerHTML = data.list.map((u, i) => {
    const isMe = u.username === USERNAME;
    const rank = medals[i] || `#${i+1}`;
    return `<div class="list-item" style="${isMe ? 'border:1px solid #00e5ff;background:rgba(0,229,255,.1);' : ''}">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:18px;min-width:32px;">${rank}</span>
        <div><strong>${u.username}${isMe?' (أنت)':''}</strong><small>المستوى ${u.level} | 🪙 ${Math.floor(u.gold)}</small></div>
      </div>
      <div class="stat-value purple" style="font-size:12px;">$${Math.floor(u.wealth).toLocaleString()}</div>
    </div>`;
  }).join('');
}

// ============ TOP BAR ============
function addTopBar() {
  const header = document.querySelector('.header');
  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;gap:6px;margin-top:8px;';
  bar.innerHTML = `
    <button id="giftBtn" class="purple" style="flex:1;padding:8px;font-size:11px;">🎁 كود هدية</button>
    <button id="logoutBtn" class="danger" style="padding:8px 12px;font-size:11px;">🚪</button>
  `;
  header.appendChild(bar);
  document.getElementById('giftBtn').onclick = redeemCode;
  document.getElementById('logoutBtn').onclick = () => {
    if (confirm('تسجيل الخروج؟')) { localStorage.clear(); location.href='/login.html'; }
  };
  if (window.IS_ADMIN) {
    const admin = document.createElement('button');
    admin.textContent = '👑 لوحة الأدمن';
    admin.style.cssText = 'width:100%;margin-top:6px;padding:8px;font-size:11px;background:linear-gradient(135deg,#aa8800,#ffd700);color:#1a1a1a;';
    admin.onclick = () => location.href = '/admin.html';
    header.appendChild(admin);
  }
  const nameTag = document.createElement('div');
  nameTag.textContent = '👤 ' + USERNAME;
  nameTag.style.cssText = 'position:absolute;top:14px;left:14px;font-size:11px;color:#8888aa;';
  header.appendChild(nameTag);
}

async function redeemCode() {
  const code = prompt('🎁 أدخل كود الهدية:');
  if (!code) return;
  const r = await api('/redeem', 'POST', { code: code.trim().toUpperCase() });
  if (r.error) { toast('❌ ' + r.error, 'error'); return; }
  S.cash += r.cash; S.gold += r.gold; addXP(r.xp);
  toast(`🎁 +${r.cash}$ +${r.xp}XP +${r.gold}جم`, 'success');
  render();
}

// ============ NAV ============
document.querySelectorAll('.nav button[data-tab]').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'social') loadTransferHistory();
    if (btn.dataset.tab === 'board') loadLeaderboard();
  };
});

// ============ GAME LOOP ============
function gameTick() {
  const dt = (Date.now() - S.lastTick) / 1000;
  S.lastTick = Date.now();

  if (Math.random() < 0.03) S.goldTrend = Math.random() < 0.5 ? -1 : 1;
  const delta = S.goldTrend * (Math.random() * 0.8);
  S.goldPrice = Math.max(20, Math.min(200, S.goldPrice + delta));

  STOCKS.forEach(s => {
    if (Math.random() < 0.02) {
      const change = (Math.random() - 0.48) * s.price * 0.05;
      s.price = Math.max(10, s.price + change);
    }
  });

  let income = 0;
  for (const id in S.businesses) income += BUSINESSES.find(b=>b.id===id).income * S.businesses[id];
  for (const id in S.realEstate) income += REALESTATE.find(r=>r.id===id).rent * S.realEstate[id];
  if (income > 0) {
    const add = income / 60 * dt;
    S.cash += add;
    S.stats.moneyEarned += add;
  }

  const workElapsed = now() - S.lastWork;
  document.getElementById('workCd').style.width = Math.min(100, workElapsed / WORK_CD * 100) + '%';
  document.getElementById('workBtn').disabled = workElapsed < WORK_CD;

  const extraElapsed = now() - S.lastExtra;
  document.getElementById('extraCd').style.width = Math.min(100, extraElapsed / EXTRA_CD * 100) + '%';
  document.getElementById('workExtraBtn').disabled = extraElapsed < EXTRA_CD;

  render();
}

// ============ BOOT ============
(async () => {
  await loadFromServer();
  addTopBar();
  render();
  addLog('👋 أهلاً ' + USERNAME);
  toast('👋 أهلاً ' + USERNAME, 'success');
  setInterval(gameTick, 250);
  setInterval(scheduleSave, 15000);
})();
