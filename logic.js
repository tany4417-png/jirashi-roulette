// ルーレットの計算部分（画面に依存しない）。ブラウザと node の両方から読める。
(function (root) {
  const TAU = Math.PI * 2;
  const mod = (a, m) => ((a % m) + m) % m;
  // 針の位置。真上から時計回りに測った角度。名前が正立して読める真上に置く
  const POINTER = 0;

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

  // 3乗の減速。終盤も境目をいくつか越え、最後の境目は止まる1〜2秒前に越える
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  // 針の下に来る扇の番号。扇 i は盤の真上から時計回りに [i*s, (i+1)*s)
  function indexAt(rot, n) {
    const s = TAU / n;
    return Math.min(n - 1, Math.floor(mod(POINTER - rot, TAU) / s));
  }

  // 当選者 w の扇の中で止まる回転角。turns 周ぶん余分に回す
  function targetRot(fromRot, w, n, turns, rnd) {
    rnd = rnd || Math.random;
    const s = TAU / n;
    // 止まる場所は扇の境目寄りにする（当選者は先に決まっているので確率は変わらない）。
    // 針は扇の番号の大きい側の境目から入り、小さい側の境目へ抜ける。
    // 7割は「最後に境目を越えて入る」、3割は「次の境目の手前で止まる」
    const f = rnd() < 0.7 ? 0.7 + 0.23 * rnd() : 0.07 + 0.23 * rnd();
    const A = (w + f) * s;
    return fromRot + mod(POINTER - A - fromRot, TAU) + TAU * turns;
  }

  root.RouletteLogic = { TAU, mod, POINTER, fairIndex, easeOut, indexAt, targetRot };
  if (typeof module !== 'undefined') module.exports = root.RouletteLogic;
})(typeof window !== 'undefined' ? window : globalThis);
