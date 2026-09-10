// 状態と外場を保持し、それらを変更する操作をまとめたモジュール。
// 状態を変更しない計算は observables.js に置く。

import { fft, ifft } from "./fft.js";
import { branchSpinors, spectrum, branchWeights } from "./observables.js";

/**
 * 周期境界の一様格子を作る。
 * k は FFT の並び順（前半が正、後半が負）に格納する。
 */
export function makeGrid(N, L) {
  if (N <= 0 || (N & (N - 1)) !== 0) throw new Error(`N=${N} は 2 の冪でなければならない`);
  const h = L / N;
  const x = new Float64Array(N);
  const k = new Float64Array(N);
  const dk = 2 * Math.PI / L;
  for (let j = 0; j < N; j++) x[j] = j * h;
  for (let n = 0; n < N; n++) k[n] = (n < N / 2 ? n : n - N) * dk;
  return { N, L, h, x, k };
}

export function createSolver(grid) {
  const N = grid.N;

  const state = {
    re1: new Float64Array(N),
    im1: new Float64Array(N),
    re2: new Float64Array(N),
    im2: new Float64Array(N),
  };

  const fields = {
    V: new Float64Array(N),
    S: new Float64Array(N),
  };

  const solver = {
    grid,
    state,
    fields,
    m: 1,
    t: 0,
    step,
    setPacket,
    projectToBranch,
    normalize,
  };

  /**
   * ポテンシャル・質量ステップ（実空間、厳密）。
   *   θ = (m + S_j) dt
   *   a' = cos θ · a - i sin θ · b
   *   b' = cos θ · b - i sin θ · a
   *   さらに e^(-i V_j dt) を掛ける
   */
  function potentialStep(dt) {
    const { re1, im1, re2, im2 } = state;
    const { V, S } = fields;
    for (let j = 0; j < N; j++) {
      const th = (solver.m + S[j]) * dt;
      const c = Math.cos(th);
      const s = Math.sin(th);

      const ar = re1[j], ai = im1[j];
      const br = re2[j], bi = im2[j];

      // -i·s·b = s·bi - i·s·br
      const nar = c * ar + s * bi;
      const nai = c * ai - s * br;
      const nbr = c * br + s * ai;
      const nbi = c * bi - s * ar;

      // e^(-i V dt) = cos(V dt) - i sin(V dt)
      const vc = Math.cos(V[j] * dt);
      const vs = -Math.sin(V[j] * dt);

      re1[j] = nar * vc - nai * vs;
      im1[j] = nar * vs + nai * vc;
      re2[j] = nbr * vc - nbi * vs;
      im2[j] = nbr * vs + nbi * vc;
    }
  }

  /**
   * 運動ステップ（k 空間、厳密）。
   *   ψ̂₁ *= e^(-i k dt),  ψ̂₂ *= e^(+i k dt)
   */
  function kineticStep(dt) {
    const { re1, im1, re2, im2 } = state;
    const k = grid.k;

    fft(re1, im1);
    fft(re2, im2);

    for (let n = 0; n < N; n++) {
      const th = k[n] * dt;
      const c = Math.cos(th);
      const s = Math.sin(th);

      // ψ̂₁ *= (c - i s)
      let r = re1[n], i = im1[n];
      re1[n] = r * c + i * s;
      im1[n] = i * c - r * s;

      // ψ̂₂ *= (c + i s)
      r = re2[n]; i = im2[n];
      re2[n] = r * c - i * s;
      im2[n] = i * c + r * s;
    }

    ifft(re1, im1);
    ifft(re2, im2);
  }

  /** Strang 分割で 1 副ステップ進める。 */
  function step(dt) {
    potentialStep(dt / 2);
    kineticStep(dt);
    potentialStep(dt / 2);
    solver.t += dt;
  }

  /** ノルムを 1 にする。ノルムが 0 のときは何もしない。 */
  function normalize() {
    const { re1, im1, re2, im2 } = state;
    let sum = 0;
    for (let j = 0; j < N; j++) {
      sum += re1[j] ** 2 + im1[j] ** 2 + re2[j] ** 2 + im2[j] ** 2;
    }
    sum *= grid.h;
    if (!(sum > 1e-300)) return;
    const f = 1 / Math.sqrt(sum);
    for (let j = 0; j < N; j++) {
      re1[j] *= f; im1[j] *= f; re2[j] *= f; im2[j] *= f;
    }
  }

  /**
   * ガウス波束を作る。
   *
   * "+" / "-" / "mix" は k 空間で分枝スピノルを掛けて作る（分枝が厳密に決まる）。
   * "naive" だけは実空間で ψ₁ にガウスを置く（分枝が混ざるのが意図した挙動）。
   */
  function setPacket(branch, x0, k0, sigma) {
    const { re1, im1, re2, im2 } = state;

    if (branch === "naive") {
      for (let j = 0; j < N; j++) {
        // 周期境界なので最短距離を使う
        let d = grid.x[j] - x0;
        d -= grid.L * Math.round(d / grid.L);
        const g = Math.exp(-(d * d) / (2 * sigma * sigma));
        re1[j] = g; im1[j] = 0; re2[j] = 0; im2[j] = 0;
      }
      normalize();
      return;
    }

    // k 空間で組み立てる
    const kr1 = new Float64Array(N), ki1 = new Float64Array(N);
    const kr2 = new Float64Array(N), ki2 = new Float64Array(N);

    for (let n = 0; n < N; n++) {
      const k = grid.k[n];
      const dk = k - k0;
      const env = Math.exp(-(sigma * sigma * dk * dk) / 2);
      if (env === 0) continue;

      // e^(-i k x₀)
      const ph = -k * x0;
      const cr = Math.cos(ph) * env;
      const ci = Math.sin(ph) * env;

      const { up0, up1, um0, um1 } = branchSpinors(k, solver.m);
      let s0, s1;
      if (branch === "+") {
        s0 = up0; s1 = up1;
      } else if (branch === "-") {
        s0 = um0; s1 = um1;
      } else if (branch === "mix") {
        const r2 = Math.SQRT1_2;
        s0 = (up0 + um0) * r2; s1 = (up1 + um1) * r2;
      } else {
        throw new Error(`未知の branch: ${branch}`);
      }

      kr1[n] = cr * s0; ki1[n] = ci * s0;
      kr2[n] = cr * s1; ki2[n] = ci * s1;
    }

    ifft(kr1, ki1);
    ifft(kr2, ki2);

    re1.set(kr1); im1.set(ki1);
    re2.set(kr2); im2.set(ki2);
    normalize();
  }

  /**
   * 状態を指定した分枝へ射影する。各 k ごとに行うため厳密。
   * @param {number} sign +1 で正分枝、-1 で負分枝
   * @returns {number} 落ちた重みの割合（0〜1）
   */
  function projectToBranch(sign) {
    const spec = spectrum(state, grid);
    const w = branchWeights(spec, grid, solver.m);

    let kept = 0, dropped = 0;
    for (let n = 0; n < N; n++) {
      kept += sign > 0 ? w.wPlus[n] : w.wMinus[n];
      dropped += sign > 0 ? w.wMinus[n] : w.wPlus[n];
    }
    const total = kept + dropped;
    const lostFraction = total > 1e-300 ? dropped / total : 0;

    // 各 k で選んだ分枝の成分だけを残す
    const kr1 = new Float64Array(N), ki1 = new Float64Array(N);
    const kr2 = new Float64Array(N), ki2 = new Float64Array(N);
    for (let n = 0; n < N; n++) {
      const sp = branchSpinors(grid.k[n], solver.m);
      const s0 = sign > 0 ? sp.up0 : sp.um0;
      const s1 = sign > 0 ? sp.up1 : sp.um1;
      // 係数 c = u·ψ̂（u は実ベクトル）
      const cRe = s0 * spec.re1[n] + s1 * spec.re2[n];
      const cIm = s0 * spec.im1[n] + s1 * spec.im2[n];
      kr1[n] = cRe * s0; ki1[n] = cIm * s0;
      kr2[n] = cRe * s1; ki2[n] = cIm * s1;
    }

    ifft(kr1, ki1);
    ifft(kr2, ki2);

    state.re1.set(kr1); state.im1.set(ki1);
    state.re2.set(kr2); state.im2.set(ki2);
    normalize();

    return lostFraction;
  }

  return solver;
}
