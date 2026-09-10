// 状態と外場を保持し、それらを変更する操作をまとめたモジュール。
// 状態を変更しない計算は observables.js に置く。

import { fft, ifft } from "./fft.js";

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

  return solver;
}
