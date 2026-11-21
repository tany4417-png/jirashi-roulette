(() => {
  const L = window.RouletteLogic;
  const { TAU, mod } = L;
  const $ = (id) => document.getElementById(id);
  const KEY = 'jirashi-roulette-v1';

  // ---------- 保存 ----------
  let state = { members: [], mode: 'tease', sound: true, history: [] };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && Array.isArray(saved.members)) state = Object.assign(state, saved);
  } catch (e) { /* 読めなくても初期状態で動かす */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} };
  const active = () => state.members.filter((m) => m.on);

  // ---------- 音 ----------
  let actx = null;
  let lastTick = 0;
  function audio() {
    if (!state.sound) return null;
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
    }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  function beep(freq, len, type, vol, when) {
    const a = audio(); if (!a) return;
    const t = a.currentTime + (when || 0);
    const o = a.createOscillator(); const g = a.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(a.destination);
    o.start(t); o.stop(t + len + 0.02);
  }
  function tick() {
    const now = performance.now();
    if (now - lastTick < 28) return;
    lastTick = now;
    beep(1700, 0.035, 'triangle', 0.25);
  }
  function fanfare() {
    [523, 659, 784, 1047].forEach((f, i) => beep(f, i === 3 ? 0.5 : 0.16, 'square', 0.12, i * 0.12));
  }

  // ---------- 描画 ----------
  const canvas = $('wheel');
  const ctx = canvas.getContext('2d');
  let W = 0, dpr = 1, cache = null;
  let rot = 0, kick = 0, lightMode = 'idle', spinning = false, lastIdx = -1;
  let dirty = true, lastBulbKey = '';

  function colorAt(i, n) {
    const h = Math.round((i * 360) / n + 8);
    const l = i % 2 === 0 ? 66 : 56;
    return `hsl(${h} 78% ${l}%)`;
  }

  function geometry() {
    const c = W / 2;
    const Ro = c - W * 0.035; // 針が跳ねても上で切れないよう余白を取る
    const rim = W * 0.065;
    return { c, Ro, R: Ro - rim };
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = Math.round(rect.width);
    dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = W * dpr; canvas.height = W * dpr;
    buildCache();
  }

  function buildCache() {
    const { c, R } = geometry();
    const list = active();
    const n = list.length;
    cache = document.createElement('canvas');
    cache.width = W * dpr; cache.height = W * dpr;
    const g = cache.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (n === 0) {
      g.fillStyle = '#3a3470';
      g.beginPath(); g.arc(c, c, R, 0, TAU); g.fill();
      g.fillStyle = '#cfc8f5'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `700 ${Math.round(R * 0.11)}px -apple-system, "Hiragino Sans", sans-serif`;
      g.fillText('下でメンバーを', c, c - R * 0.36);
      g.fillText('参加にしてください', c, c - R * 0.2);
    } else {
      const s = TAU / n;
      for (let i = 0; i < n; i++) {
        const a0 = -Math.PI / 2 + i * s;
        g.fillStyle = colorAt(i, n);
        g.beginPath(); g.moveTo(c, c); g.arc(c, c, R, a0, a0 + s); g.closePath(); g.fill();
        if (n > 1) {
          g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 2;
          g.beginPath(); g.moveTo(c, c); g.lineTo(c + R * Math.cos(a0), c + R * Math.sin(a0)); g.stroke();
        }
        // 名前
        g.save();
        g.translate(c, c); g.rotate(a0 + s / 2);
        g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillStyle = '#1d1533';
        let fs = Math.min(R * 0.15, R * 0.62 * s * 0.72);
        const maxW = R * 0.6;
        const name = list[i].name;
        do {
          g.font = `800 ${fs}px -apple-system, "Hiragino Sans", sans-serif`;
          if (g.measureText(name).width <= maxW) break;
          fs -= 1;
        } while (fs > 9);
        g.fillText(name, R * 0.9, 0, maxW);
        g.restore();
      }
    }
    // 内側の影
    const sh = g.createRadialGradient(c, c, R * 0.7, c, c, R);
    sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.22)');
    g.fillStyle = sh; g.beginPath(); g.arc(c, c, R, 0, TAU); g.fill();
    dirty = true;
  }

  function bulbOn(i, t) {
    if (lightMode === 'spin') return (i + Math.floor(t / 70)) % 3 === 0;
    if (lightMode === 'hover') return Math.floor(t / 140) % 2 === 0;
    if (lightMode === 'win') return (i + Math.floor(t / 110)) % 2 === 0;
    return (i + Math.floor(t / 800)) % 2 === 0;
  }

  const BULBS = 24;
  function draw(t) {
    const bulbKey = lightMode + ':' + Array.from({ length: 3 }, (_, i) => bulbOn(i, t)).join('');
    if (!dirty && !spinning && kick < 0.01 && bulbKey === lastBulbKey) return;
    lastBulbKey = bulbKey; dirty = false;

    const { c, Ro, R } = geometry();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, W);

    // 外枠
    const rimG = ctx.createLinearGradient(0, 0, 0, W);
    rimG.addColorStop(0, '#ffd977'); rimG.addColorStop(0.5, '#d89a2b'); rimG.addColorStop(1, '#8c5a10');
    ctx.fillStyle = rimG; ctx.beginPath(); ctx.arc(c, c, Ro, 0, TAU); ctx.fill();
    ctx.fillStyle = '#5a3a08'; ctx.beginPath(); ctx.arc(c, c, R + 3, 0, TAU); ctx.fill();

    // 電球
    const br = (Ro - R) * 0.26;
    const bR = (Ro + R) / 2 + 1;
    for (let i = 0; i < BULBS; i++) {
      const a = (i / BULBS) * TAU;
      const x = c + bR * Math.cos(a), y = c + bR * Math.sin(a);
      const on = bulbOn(i, t);
      if (on) {
        ctx.fillStyle = 'rgba(255,240,180,.35)';
        ctx.beginPath(); ctx.arc(x, y, br * 2, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = on ? '#fffbe8' : '#7a5212';
      ctx.beginPath(); ctx.arc(x, y, br, 0, TAU); ctx.fill();
    }

    // 盤
    ctx.save(); ctx.translate(c, c); ctx.rotate(rot);
    ctx.drawImage(cache, -c, -c, W, W);
    ctx.restore();

    // 中心
    const hub = ctx.createRadialGradient(c - R * 0.04, c - R * 0.04, 2, c, c, R * 0.16);
    hub.addColorStop(0, '#fff3c4'); hub.addColorStop(1, '#c98b1e');
    ctx.fillStyle = hub; ctx.beginPath(); ctx.arc(c, c, R * 0.14, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#7a4f0c'; ctx.lineWidth = 2; ctx.stroke();

    // 針（目盛りを越えるたびに少し跳ねる）
    const pw = R * 0.13, ph = R * 0.24, top = W * 0.03;
    ctx.save();
    ctx.translate(c, top + ph * 0.25);
    ctx.rotate(-kick * 0.38);
    ctx.beginPath();
    ctx.moveTo(-pw, -ph * 0.25); ctx.lineTo(pw, -ph * 0.25); ctx.lineTo(0, ph * 0.95); ctx.closePath();
    ctx.fillStyle = '#ff5d73'; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.restore();
    kick *= 0.8;
  }

  function loop(t) {
    draw(t);
    requestAnimationFrame(loop);
  }

  // ---------- 回す ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function animate(from, to, dur, easeName) {
    const fn = L.ease[easeName];
    const n = active().length;
    return new Promise((resolve) => {
      const t0 = performance.now();
      function step(now) {
        const p = Math.min(1, (now - t0) / dur);
        rot = from + (to - from) * fn(p);
        const idx = L.indexAt(rot, n);
        if (idx !== lastIdx) { lastIdx = idx; kick = 1; tick(); }
        if (p < 1) requestAnimationFrame(step); else resolve();
      }
      requestAnimationFrame(step);
    });
  }

  function setStatus(t) { $('status').textContent = t; }

  async function spin() {
    const list = active();
    if (spinning) return;
    if (list.length < 2) { showMsg('参加している人を2人以上にしてください'); return; }
    audio(); // タップの直後に音を有効にする（iPhoneの制約）
    spinning = true; lockUI(true);
    const n = list.length;
    const w = L.fairIndex(n);
    const plan = L.buildPlan(w, n, state.mode);
    lastIdx = L.indexAt(rot, n);
    rot = mod(rot, TAU);
    for (const st of plan) {
      lightMode = 'spin'; setStatus('まわっています');
      await animate(rot, L.stepTarget(rot, st), st.dur, st.ease);
      if (st.pause) { lightMode = 'hover'; setStatus(st.status); await sleep(st.pause); }
    }
    const got = L.indexAt(rot, n);
    const winner = list[got];
    lightMode = 'win'; setStatus('決定！');
    fanfare();
    state.history.unshift(winner.name);
    state.history = state.history.slice(0, 10);
    save(); renderHistory();
    await sleep(450);
    showResult(winner);
    spinning = false; lockUI(false);
  }

  function lockUI(on) {
    $('spinBtn').disabled = on;
    $('spinBtn').textContent = on ? '回転中' : 'まわす';
    $('members').style.pointerEvents = on ? 'none' : '';
    $('members').style.opacity = on ? '.55' : '';
    document.querySelectorAll('#modes button').forEach((b) => (b.disabled = on));
  }

  // ---------- 結果 ----------
  let currentWinner = null;
  function showResult(m) {
    currentWinner = m;
    $('winnerName').textContent = m.name;
    const ov = $('overlay');
    ov.querySelectorAll('.confetti').forEach((e) => e.remove());
    const colors = ['#ff5d73', '#f1c04f', '#7ee0b2', '#7aa8ff', '#c78bff', '#fff'];
    for (let i = 0; i < 46; i++) {
      const d = document.createElement('div');
      d.className = 'confetti';
      d.style.left = Math.random() * 100 + 'vw';
      d.style.background = colors[i % colors.length];
      d.style.setProperty('--dx', (Math.random() * 120 - 60) + 'px');
      d.style.setProperty('--rot', (Math.random() * 900 - 450) + 'deg');
      d.style.animationDuration = 1.6 + Math.random() * 1.6 + 's';
      d.style.animationDelay = Math.random() * 0.4 + 's';
      ov.appendChild(d);
    }
    ov.classList.add('show');
  }
  function closeResult() {
    $('overlay').classList.remove('show');
    lightMode = 'idle'; setStatus(''); dirty = true;
  }
  $('closeBtn').onclick = closeResult;
  $('againBtn').onclick = () => { closeResult(); spin(); };
  $('removeWinnerBtn').onclick = () => {
    if (currentWinner) {
      const m = state.members.find((x) => x.id === currentWinner.id);
      if (m) m.on = false;
      save(); renderMembers();
    }
    closeResult();
    if (active().length >= 2) spin();
    else showMsg('参加している人が1人以下になりました');
  };

  // ---------- メンバー ----------
  let editing = false;
  let msgTimer = 0;
  function showMsg(t) {
    $('msg').textContent = t;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => ($('msg').textContent = ''), 3000);
  }

  function renderMembers() {
    const grid = $('grid');
    grid.innerHTML = '';
    if (state.members.length === 0) {
      const e = document.createElement('div');
      e.className = 'empty'; e.textContent = 'まだ誰も登録されていません';
      grid.appendChild(e);
    }
    for (const m of state.members) {
      const b = document.createElement('div');
      b.className = 'chip' + (m.on ? ' on' : '');
      b.dataset.id = m.id;
      b.setAttribute('role', 'button');
      const dot = document.createElement('span'); dot.className = 'dot';
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = m.name;
      const del = document.createElement('button'); del.className = 'del'; del.type = 'button';
      del.textContent = '×'; del.dataset.del = m.id; del.setAttribute('aria-label', m.name + 'を消す');
      b.append(dot, nm, del);
      grid.appendChild(b);
    }
    $('members').classList.toggle('editing', editing);
    $('editBtn').textContent = editing ? '消し終わった' : '登録を消す';
    $('hint').textContent = editing
      ? '×で登録から消します。休みにするだけなら「消し終わった」を押して名前をタップしてください。'
      : 'タップで参加と休みを切り替えます。緑が参加中です。';
    const n = active().length;
    $('count').textContent = `参加 ${n}人 / 登録 ${state.members.length}人`;
    $('odds').textContent = n >= 2 ? `ひとりあたり 1/${n}（${(100 / n).toFixed(1)}%）` : '';
    buildCache();
  }

  $('grid').addEventListener('click', (e) => {
    const delId = e.target.dataset && e.target.dataset.del;
    if (delId) {
      const m = state.members.find((x) => x.id === delId);
      if (m && confirm(`「${m.name}」を登録から消しますか？`)) {
        state.members = state.members.filter((x) => x.id !== delId);
        save(); renderMembers();
      }
      return;
    }
    const chip = e.target.closest('.chip');
    if (!chip || editing) return;
    const m = state.members.find((x) => x.id === chip.dataset.id);
    if (m) { m.on = !m.on; save(); renderMembers(); }
  });

  $('addForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('nameInput');
    const name = input.value.trim();
    if (!name) return;
    if (state.members.some((m) => m.name === name)) { showMsg(`「${name}」はもう登録されています`); return; }
    state.members.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, on: true });
    input.value = '';
    save(); renderMembers();
  });

  $('allOn').onclick = () => { state.members.forEach((m) => (m.on = true)); save(); renderMembers(); };
  $('allOff').onclick = () => { state.members.forEach((m) => (m.on = false)); save(); renderMembers(); };
  $('editBtn').onclick = () => { editing = !editing; renderMembers(); };

  // ---------- その他 ----------
  function renderModes() {
    document.querySelectorAll('#modes button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)));
  }
  $('modes').addEventListener('click', (e) => {
    const m = e.target.dataset && e.target.dataset.mode;
    if (m) { state.mode = m; save(); renderModes(); }
  });

  function renderSound() { $('soundBtn').textContent = state.sound ? '音 ON' : '音 OFF'; }
  $('soundBtn').onclick = () => { state.sound = !state.sound; save(); renderSound(); };

  function renderHistory() {
    const h = $('history');
    h.innerHTML = '';
    if (!state.history.length) return;
    h.append('これまで：' + state.history.join(' ← '));
    const clr = document.createElement('button');
    clr.type = 'button'; clr.textContent = '消す';
    clr.onclick = () => { state.history = []; save(); renderHistory(); };
    h.appendChild(clr);
  }

  $('spinBtn').onclick = spin;
  window.addEventListener('resize', () => { resize(); dirty = true; });

  resize();
  renderMembers(); renderModes(); renderSound(); renderHistory();
  requestAnimationFrame(loop);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
