// 分枝スピノルと観測量を計算する純関数群。
// このモジュールは状態を一切変更しない。状態を変更する操作は dirac.js に置く。

/**
 * 自由ハミルトニアン H₀(k) = k σ_z + m σ_x = [[k, m], [m, -k]] の固有ベクトル。
 *
 * H₀ は実対称行列なので固有ベクトルは実ベクトルになる。
 * 戻り値の 4 成分はすべて実数である。
 *
 * k < 0 かつ m → 0 では (E + k) → 0 で桁落ちするため、
 * k の符号で等価な 2 つの表式を切り替える。
 *
 * @param {number} k 波数
 * @param {number} m 質量（スカラー場を含む実効質量でもよい）
 * @returns {{E:number, up0:number, up1:number, um0:number, um1:number}}
 */
export function branchSpinors(k, m) {
  const E = Math.hypot(k, m);

  let a, b;
  if (k >= 0) {
    a = E + k;   // k ≥ 0 なら E + k ≥ E > 0 で桁落ちしない
    b = m;
  } else {
    a = m;
    b = E - k;   // k < 0 なら E - k ≥ E > 0 で桁落ちしない
  }

  const len = Math.hypot(a, b);
  if (len === 0) {
    // k = m = 0 のときだけ到達する。任意の直交基底でよい。
    return { E: 0, up0: 1, up1: 0, um0: 0, um1: 1 };
  }

  const up0 = a / len;
  const up1 = b / len;

  // 実 2 次元では直交補は 90 度回転で得られる。この式で符号規約を固定する。
  return { E, up0, up1, um0: -up1, um1: up0 };
}

import { fft } from "./fft.js";

/**
 * 状態を k 空間へ移す。Parseval 規格化 (h Σ|ψ|² = Σ|ψ̂|²) を適用する。
 *
 * fft は in-place で引数を破壊するため、必ずコピーを取ってから変換する。
 * 引数の state は変更しない。
 */
export function spectrum(state, grid) {
  const N = grid.N;
  const re1 = state.re1.slice(), im1 = state.im1.slice();
  const re2 = state.re2.slice(), im2 = state.im2.slice();

  fft(re1, im1);
  fft(re2, im2);

  // 生の順変換では Σ|X|² = N Σ|x|²。目標は Σ|ψ̂|² = h Σ|ψ|² なので √(h/N) 倍する。
  const scale = Math.sqrt(grid.h / N);
  for (let n = 0; n < N; n++) {
    re1[n] *= scale; im1[n] *= scale;
    re2[n] *= scale; im2[n] *= scale;
  }
  return { re1, im1, re2, im2 };
}

/** 確率密度 ρ = |ψ₁|² + |ψ₂|²。 */
export function density(state) {
  const N = state.re1.length;
  const out = new Float64Array(N);
  for (let j = 0; j < N; j++) {
    out[j] = state.re1[j] ** 2 + state.im1[j] ** 2
           + state.re2[j] ** 2 + state.im2[j] ** 2;
  }
  return out;
}

/** カレント j = c(|ψ₁|² - |ψ₂|²)。自然単位で c = 1。 */
export function current(state) {
  const N = state.re1.length;
  const out = new Float64Array(N);
  for (let j = 0; j < N; j++) {
    out[j] = (state.re1[j] ** 2 + state.im1[j] ** 2)
           - (state.re2[j] ** 2 + state.im2[j] ** 2);
  }
  return out;
}

/**
 * 各 k での分枝の重み w± = |u±(k)·ψ̂(k)|²。
 * u± は実ベクトルなので、実部・虚部それぞれに同じ係数を掛けて二乗和を取る。
 *
 * 注意: 外場が非ゼロのとき、これは保存量でも真の粒子/反粒子分解でもない。
 * UI では「自由基底での射影」と明示すること。
 */
export function branchWeights(spec, grid, m) {
  const N = grid.N;
  const wPlus = new Float64Array(N);
  const wMinus = new Float64Array(N);
  for (let n = 0; n < N; n++) {
    const { up0, up1, um0, um1 } = branchSpinors(grid.k[n], m);
    const pRe = up0 * spec.re1[n] + up1 * spec.re2[n];
    const pIm = up0 * spec.im1[n] + up1 * spec.im2[n];
    const mRe = um0 * spec.re1[n] + um1 * spec.re2[n];
    const mIm = um0 * spec.im1[n] + um1 * spec.im2[n];
    wPlus[n] = pRe * pRe + pIm * pIm;
    wMinus[n] = mRe * mRe + mIm * mIm;
  }
  return { wPlus, wMinus };
}

/**
 * 画面に出す観測量をまとめて計算する。state は変更しない。
 *
 * @param precomputedSpec 呼び出し側が既に spectrum() を計算済みなら渡す。
 *   spectrum() は FFT を 4 回走らせるため、運動量パネルの描画と併せて
 *   毎フレーム二重に呼ぶと無駄が大きい。
 */
export function measure(state, fields, m, grid, precomputedSpec) {
  const N = grid.N, h = grid.h;
  const { re1, im1, re2, im2 } = state;

  let norm = 0, xAcc = 0, vAcc = 0, massAcc = 0, potAcc = 0;
  for (let j = 0; j < N; j++) {
    const d1 = re1[j] ** 2 + im1[j] ** 2;
    const d2 = re2[j] ** 2 + im2[j] ** 2;
    const rho = d1 + d2;
    norm += rho;
    xAcc += grid.x[j] * rho;
    vAcc += d1 - d2;
    // Re(ψ₁* ψ₂) = re1·re2 + im1·im2
    massAcc += (m + fields.S[j]) * 2 * (re1[j] * re2[j] + im1[j] * im2[j]);
    potAcc += fields.V[j] * rho;
  }
  norm *= h; xAcc *= h; vAcc *= h; massAcc *= h; potAcc *= h;

  const spec = precomputedSpec || spectrum(state, grid);
  let kin = 0;
  for (let n = 0; n < N; n++) {
    const s1 = spec.re1[n] ** 2 + spec.im1[n] ** 2;
    const s2 = spec.re2[n] ** 2 + spec.im2[n] ** 2;
    kin += grid.k[n] * (s1 - s2);
  }

  const { wPlus, wMinus } = branchWeights(spec, grid, m);
  let wp = 0, wm = 0;
  for (let n = 0; n < N; n++) { wp += wPlus[n]; wm += wMinus[n]; }

  const safe = norm > 1e-300 ? norm : 1;
  return {
    norm,
    xMean: xAcc / safe,
    vMean: vAcc / safe,
    energy: (kin + massAcc + potAcc) / safe,
    wPlusTotal: wp,
    wMinusTotal: wm,
  };
}
