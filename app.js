(() => {
  const L = window.RouletteLogic;
  const { TAU, mod } = L;
  const $ = (id) => document.getElementById(id);
  const KEY = 'jirashi-roulette-v1';

  // ---------- 保存 ----------
  let state = { members: [], history: [] };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && Array.isArray(saved.members)) {
      state.members = saved.members;
      // 旧版は名前だけの配列で持っていた
      state.history = (saved.history || []).map((h) => (typeof h === 'string' ? { name: h, t: null } : h));
    }
  } catch (e) { /* 読めなくても初期状態で動かす */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} };
  const active = () => state.members.filter((m) => m.on);

  // ---------- 音（iPhoneのマナーモード中は鳴らない） ----------
  let actx = null, lastTick = 0;
  function audio() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
    }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  function beep(freq, len, vol, when) {
    const a = actx; if (!a) return;
    const t = a.currentTime + (when || 0);
    const o = a.createOscillator(); const g = a.createGain();
    o.type = 'triangle'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(a.destination);
    o.start(t); o.stop(t + len + 0.02);
  }
  function tick() {
    const now = performance.now();
    if (now - lastTick < 30) return;
    lastTick = now;
    beep(1600, 0.03, 0.2);
  }
  function ding() { beep(880, 0.25, 0.2); beep(1320, 0.4, 0.15, 0.1); }

  // ---------- 描画 ----------
  const canvas = $('wheel');
  const ctx = canvas.getContext('2d');
  let W = 0, dpr = 1, rot = 0, winnerIdx = -1, fonts = [];
  let colors = {};

  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    colors = { text: cs.getPropertyValue('--text').trim(), bg: cs.getPropertyValue('--bg').trim() };
  }
  const segColor = (i, n) => `hsl(${Math.round((i * 360) / n + 10)} 70% 74%)`;
  const geo = () => { const c = W / 2; return { c, R: c - W * 0.06 }; };
  const FONT = (fs) => `700 ${fs}px -apple-system, "Hiragino Sans", sans-serif`;

  function measureFonts() {
    const list = active(), n = list.length;
    const { R } = geo();
    if (!n) { fonts = []; return; }
    const s = TAU / n;
    // 名前は扇の幅の向きに書く。使える幅はその半径での弦の長さ
    const chord = (r) => Math.min(R * 0.95, 2 * r * Math.sin(s / 2)) * 0.82;
    const base = R * 0.15;
    const width = (t) => { ctx.font = FONT(100); return ctx.measureText(t).width / 100; };
    fonts = list.map((m) => {
      const name = m.name;
      const one = Math.min(base, chord(R * 0.72) / width(name));
      // 1行だと小さくなりすぎる長い名前は2行に分ける（外側が1行目）
      if (name.length >= 4) {
        const h = Math.ceil(name.length / 2);
        const a = name.slice(0, h), b = name.slice(h);
        const two = Math.min(base * 0.85, chord(R * 0.78) / width(a), chord(R * 0.6) / width(b));
        if (two > one * 1.25) return { lines: [a, b], fit: two, two: true };
      }
      return { lines: [name], fit: one, two: false };
    });
    // 文字の大きさは中央値にそろえる。それでも入らない長い名前だけ小さくする
    const fits = fonts.map((f) => f.fit).sort((x, y) => x - y);
    const common = fits[Math.floor((fits.length - 1) / 2)];
    fonts.forEach((f) => {
      f.fs = Math.max(9, Math.min(common, f.fit));
      f.r = f.two ? [R * 0.8, R * 0.8 - f.fs * 1.1] : [R * 0.72];
    });
  }

  function resize() {
    W = Math.round(canvas.getBoundingClientRect().width);
    dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = W * dpr; canvas.height = W * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    measureFonts(); draw();
  }

  function draw() {
    const list = active(), n = list.length;
    const { c, R } = geo();
    ctx.clearRect(0, 0, W, W);

    if (n === 0) {
      ctx.fillStyle = colors.bg; ctx.strokeStyle = colors.text; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(c, c, R, 0, TAU); ctx.globalAlpha = 0.3; ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillStyle = colors.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = FONT(Math.round(R * 0.09));
      ctx.fillText('下のメンバーを', c, c - R * 0.08);
      ctx.fillText('参加にしてください', c, c + R * 0.08);
      return;
    }

    const s = TAU / n;
    for (let i = 0; i < n; i++) {
      const a0 = i * s + rot - Math.PI / 2;
      ctx.beginPath(); ctx.moveTo(c, c); ctx.arc(c, c, R, a0, a0 + s); ctx.closePath();
      ctx.fillStyle = segColor(i, n); ctx.fill();
      if (winnerIdx >= 0 && i !== winnerIdx) {
        ctx.fillStyle = colors.bg; ctx.globalAlpha = 0.55; ctx.fill(); ctx.globalAlpha = 1;
      }
      if (n > 1) {
        ctx.strokeStyle = colors.bg; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(c, c); ctx.lineTo(c + R * Math.cos(a0), c + R * Math.sin(a0)); ctx.stroke();
      }
    }

    // 名前。文字の下側を中心に向け、扇の幅の向きに書く
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.fillStyle = '#1f1f1f';
    for (let i = 0; i < n; i++) {
      const f = fonts[i]; if (!f) continue;
      const mid = (i + 0.5) * s + rot - Math.PI / 2;
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(mid + Math.PI / 2); // 文字の上が外側を向く
      ctx.font = FONT(f.fs);
      if (winnerIdx >= 0 && i !== winnerIdx) ctx.globalAlpha = 0.45;
      f.lines.forEach((t, k) => ctx.fillText(t, 0, -f.r[k]));
      ctx.restore();
    }

    // 中心と針（真上）
    ctx.fillStyle = colors.bg;
    ctx.beginPath(); ctx.arc(c, c, R * 0.07, 0, TAU); ctx.fill();
    ctx.fillStyle = colors.text;
    const tipY = c - R * 0.93, baseY = 1, hw = W * 0.035;
    ctx.beginPath(); ctx.moveTo(c, tipY); ctx.lineTo(c - hw, baseY); ctx.lineTo(c + hw, baseY); ctx.closePath(); ctx.fill();
  }

  // ---------- 回す ----------
  let spinning = false;
  function spin() {
    const list = active(), n = list.length;
    if (spinning) return;
    if (n < 2) { showMsg('参加している人を2人以上にしてください'); return; }
    audio(); // タップの直後に音を有効にする（iPhoneの制約）
    spinning = true; lock(true);
    winnerIdx = -1; $('result').textContent = '';
    const w = L.fairIndex(n);
    const from = mod(rot, TAU);
    const to = L.targetRot(from, w, n, 5);
    const dur = 9000, t0 = performance.now();
    let lastIdx = L.indexAt(from, n);
    function step(now) {
      const p = Math.min(1, (now - t0) / dur);
      rot = from + (to - from) * L.easeOut(p);
      const idx = L.indexAt(rot, n);
      if (idx !== lastIdx) { lastIdx = idx; tick(); }
      draw();
      if (p < 1) { requestAnimationFrame(step); return; }
      finish(list, L.indexAt(rot, n));
    }
    requestAnimationFrame(step);
  }

  function finish(list, idx) {
    winnerIdx = idx; draw(); ding();
    const name = list[idx].name;
    $('result').textContent = name;
    state.history.unshift({ name, t: Date.now() });
    state.history = state.history.slice(0, 10);
    save(); renderHistory();
    spinning = false; lock(false);
  }

  function lock(on) {
    $('spinBtn').disabled = on;
    $('members').style.pointerEvents = on ? 'none' : '';
    $('members').style.opacity = on ? '.5' : '';
  }

  // ---------- 最近の結果 ----------
  function renderHistory() {
    const ol = $('history');
    ol.innerHTML = '';
    if (!state.history.length) {
      const li = document.createElement('li');
      li.innerHTML = '<span class="nm" style="color:var(--muted);font-weight:400;font-size:14px">まだありません</span>';
      ol.appendChild(li);
    }
    state.history.forEach((h, i) => {
      const li = document.createElement('li');
      const no = document.createElement('span'); no.className = 'no'; no.textContent = i + 1;
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = h.name;
      const tm = document.createElement('span'); tm.className = 'tm';
      if (h.t) { const d = new Date(h.t); tm.textContent = d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); }
      li.append(no, nm, tm);
      ol.appendChild(li);
    });
    $('resetBtn').disabled = !state.history.length;
  }
  $('resetBtn').onclick = () => {
    if (!confirm('最近の結果を消しますか？')) return;
    state.history = []; save(); renderHistory();
    $('result').textContent = ''; winnerIdx = -1; draw();
  };

  // ---------- メンバー ----------
  let editing = false, msgTimer = 0;
  function showMsg(t) {
    $('msg').textContent = t;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => ($('msg').textContent = ''), 3000);
  }

  function renderMembers() {
    const grid = $('grid');
    grid.innerHTML = '';
    if (!state.members.length) {
      const e = document.createElement('div');
      e.className = 'empty'; e.textContent = 'まだ誰も登録されていません';
      grid.appendChild(e);
    }
    for (const m of state.members) {
      const b = document.createElement('div');
      b.className = 'chip' + (m.on ? ' on' : '');
      b.dataset.id = m.id; b.setAttribute('role', 'button');
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
      ? '×で登録から消します。'
      : 'タップで参加と休みを切り替えます。緑が参加中です。';
    const n = active().length;
    $('count').textContent = `参加 ${n}人 / 登録 ${state.members.length}人`;
    $('odds').textContent = n >= 2 ? `ひとりあたり 1/${n}（${(100 / n).toFixed(1)}%）` : '';
    // 顔ぶれが変わったら前回の当たり表示は外す
    winnerIdx = -1; $('result').textContent = '';
    measureFonts(); draw();
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

  // ---------- 起動 ----------
  $('spinBtn').onclick = spin;
  window.addEventListener('resize', resize);
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  if (mq.addEventListener) mq.addEventListener('change', () => { readColors(); draw(); });

  readColors();
  resize();
  renderMembers(); renderHistory();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
