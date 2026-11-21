// ルーレットの計算部分（画面に依存しない）。ブラウザと node の両方から読める。
(function (root) {
  const TAU = Math.PI * 2;
  const mod = (a, m) => ((a % m) + m) % m;

  // 当選者は暗号用乱数で均等に選ぶ（剰余の偏りを除くため棄却サンプリング）
  function fairIndex(n) {
    const limit = Math.floor(0x100000000 / n) * n;
    const buf = new Uint32Array(1);
    let x;
    do {
      root.crypto.getRandomValues(buf);
      x = buf[0];
    } while (x >= limit);
    return x % n;
  }

  const ease = {
    outQuart: (t) => 1 - Math.pow(1 - t, 4),
    outQuint: (t) => 1 - Math.pow(1 - t, 5),
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  };

  // hovers: 何回「止まりかけ」を入れるかの候補。毎回この中からランダムに選ぶ
  const MODES = {
    normal: { label: 'ふつう', turns: 5, dur: 4800, hovers: [0] },
    tease: { label: 'じらす', turns: 7, dur: 6200, hovers: [1, 1, 0] },
    super: { label: 'すごくじらす', turns: 9, dur: 7600, hovers: [1, 2, 2] },
  };

  // 針の下に来る扇の番号。扇 i は真上から時計回りに [i*s, (i+1)*s)
  function indexAt(rot, n) {
    const s = TAU / n;
    return Math.min(n - 1, Math.floor(mod(-rot, TAU) / s));
  }

  // 演出の手順を組む。A は「針の下に来る盤面上の角度」。
  // 盤は時計回りに回るので、針は扇の番号の大きいほうから小さいほうへ進む。
  // 見た目だけを決める処理で、当選者 w は先に決まっている。
  function buildPlan(w, n, modeKey, rnd) {
    rnd = rnd || Math.random;
    const r = (a, b) => a + (b - a) * rnd();
    const s = TAU / n;
    const cfg = MODES[modeKey] || MODES.tease;
    const k = cfg.hovers[Math.floor(rnd() * cfg.hovers.length)];
    const steps = [];
    if (k === 0) {
      // 抜けそうで抜けない／ぎりぎり入る、のどちらか
      const f = rnd() < 0.6 ? r(0.04, 0.12) : r(0.86, 0.95);
      steps.push({ A: (w + f) * s, turns: cfg.turns, dur: cfg.dur * 1.1, ease: 'outQuint' });
    } else {
      for (let j = k; j >= 1; j--) {
        const A = (w + j) * s + s * r(0.03, 0.09);
        if (j === k) {
          steps.push({ A, turns: cfg.turns, dur: cfg.dur, ease: 'outQuart', pause: r(650, 1100), status: '……？' });
        } else {
          steps.push({ A, turns: 0, dur: r(1000, 1300), ease: 'inOutSine', pause: r(700, 1100), status: 'まだ動く……？' });
        }
      }
      steps.push({ A: (w + 1) * s - s * r(0.12, 0.35), turns: 0, dur: r(1100, 1500), ease: 'inOutSine' });
    }
    return steps;
  }

  // 今の回転角から、その手順で止まる回転角
  function stepTarget(fromRot, step) {
    return fromRot + mod(-step.A - fromRot, TAU) + TAU * step.turns;
  }

  root.RouletteLogic = { TAU, mod, fairIndex, ease, MODES, indexAt, buildPlan, stepTarget };
  if (typeof module !== 'undefined') module.exports = root.RouletteLogic;
})(typeof window !== 'undefined' ? window : globalThis);
