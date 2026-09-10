import { test, assert, assertClose } from "./harness.js";
import { makeGrid, createSolver } from "../src/dirac.js";

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 - 0.5; };
}

function normOf(solver) {
  const { re1, im1, re2, im2 } = solver.state;
  let sum = 0;
  for (let j = 0; j < solver.grid.N; j++) {
    sum += re1[j] * re1[j] + im1[j] * im1[j] + re2[j] * re2[j] + im2[j] * im2[j];
  }
  return sum * solver.grid.h;
}

test("makeGrid: k 配列が FFT の並び順になっている", () => {
  const g = makeGrid(8, 2 * Math.PI);   // dk = 1
  const expected = [0, 1, 2, 3, -4, -3, -2, -1];
  for (let n = 0; n < 8; n++) {
    assertClose(g.k[n], expected[n], 1e-14, `k[${n}]`);
  }
});

test("makeGrid: x 配列が 0 から始まり h 刻み", () => {
  const g = makeGrid(8, 40);
  assertClose(g.h, 5, 1e-14, "h");
  assertClose(g.x[0], 0, 1e-14, "x[0]");
  assertClose(g.x[7], 35, 1e-14, "x[7]");
});

// 検証項目 2
test("step: 吸収なしでノルムが機械精度で保存する (10000 ステップ)", () => {
  const g = makeGrid(128, 40);
  const s = createSolver(g);
  s.m = 1.3;
  const r = rng(7);
  for (let j = 0; j < g.N; j++) {
    s.state.re1[j] = r(); s.state.im1[j] = r();
    s.state.re2[j] = r(); s.state.im2[j] = r();
    s.fields.V[j] = 0.7 * Math.sin(2 * Math.PI * g.x[j] / g.L);
    s.fields.S[j] = 0.4 * Math.cos(4 * Math.PI * g.x[j] / g.L);
  }
  const n0 = normOf(s);
  for (let i = 0; i < 10000; i++) s.step(0.002);
  const n1 = normOf(s);
  assert(Math.abs(n1 - n0) / n0 < 1e-12,
    `ノルムの相対変化 ${Math.abs(n1 - n0) / n0} が 1e-12 を超えた`);
});

// 検証項目 3
test("step: 自由伝播が閉形式の解と一致する (単一 k モード)", () => {
  const g = makeGrid(64, 40);
  const s = createSolver(g);
  s.m = 1;
  const nMode = 5;
  const kk = g.k[nMode];

  // 初期条件: 単一 k の平面波、スピノルは (1, 0)
  for (let j = 0; j < g.N; j++) {
    const ph = kk * g.x[j];
    s.state.re1[j] = Math.cos(ph);
    s.state.im1[j] = Math.sin(ph);
  }

  const dt = 1e-4;
  const steps = 500;
  const T = dt * steps;
  for (let i = 0; i < steps; i++) s.step(dt);

  // 閉形式: e^(-iH₀t) = cos(Et) I - i (sin(Et)/E) (k σ_z + m σ_x)
  // (a, b) = (1, 0) に作用させると
  //   a' = cos(Et) - i sin(Et)/E · k
  //   b' = -i sin(Et)/E · m
  const E = Math.hypot(kk, s.m);
  const ct = Math.cos(E * T), st = Math.sin(E * T) / E;
  const exA = { re: ct, im: -st * kk };
  const exB = { re: 0, im: -st * s.m };

  // x=0 の点で比較する（平面波なので位相 kx = 0）
  assertClose(s.state.re1[0], exA.re, 1e-6, "ψ₁ 実部");
  assertClose(s.state.im1[0], exA.im, 1e-6, "ψ₁ 虚部");
  assertClose(s.state.re2[0], exB.re, 1e-6, "ψ₂ 実部");
  assertClose(s.state.im2[0], exB.im, 1e-6, "ψ₂ 虚部");
});

// 検証項目 9
test("step: Strang 分割が 2 次収束する (Δt を半分にすると誤差が 1/4)", () => {
  const g = makeGrid(64, 40);
  const nMode = 5;

  function errorAt(dt) {
    const s = createSolver(g);
    s.m = 1;
    const kk = g.k[nMode];
    for (let j = 0; j < g.N; j++) {
      const ph = kk * g.x[j];
      s.state.re1[j] = Math.cos(ph);
      s.state.im1[j] = Math.sin(ph);
    }
    const T = 1.0;
    const steps = Math.round(T / dt);
    for (let i = 0; i < steps; i++) s.step(dt);

    const E = Math.hypot(kk, s.m);
    const ct = Math.cos(E * T), st = Math.sin(E * T) / E;
    return Math.max(
      Math.abs(s.state.re1[0] - ct),
      Math.abs(s.state.im1[0] - (-st * kk)),
      Math.abs(s.state.re2[0] - 0),
      Math.abs(s.state.im2[0] - (-st * s.m))
    );
  }

  const e1 = errorAt(0.01);
  const e2 = errorAt(0.005);
  const ratio = e1 / e2;
  assert(ratio > 3.5 && ratio < 4.5,
    `収束比 ${ratio} が 4 から外れている (e1=${e1}, e2=${e2})`);
});

import { spectrum, branchWeights, measure } from "../src/observables.js";

test("setPacket: 正分枝のみの波束は負分枝の重みを持たない", () => {
  const g = makeGrid(512, 40);
  const s = createSolver(g);
  s.m = 1;
  s.setPacket("+", 20, 2, 1.5);
  const w = branchWeights(spectrum(s.state, g), g, s.m);
  let wp = 0, wm = 0;
  for (let n = 0; n < g.N; n++) { wp += w.wPlus[n]; wm += w.wMinus[n]; }
  assert(wm / (wp + wm) < 1e-14, `負分枝の重み比 ${wm / (wp + wm)} が大きすぎる`);
});

test("setPacket: 負分枝のみの波束は運動量と逆向きの群速度を持つ", () => {
  const g = makeGrid(512, 40);
  const s = createSolver(g);
  s.m = 1;
  const k0 = 2, sigma = 1.5;
  s.setPacket("-", 20, k0, sigma);
  const o = measure(s.state, s.fields, s.m, g);

  // 有限幅の波束の ⟨v⟩ は点値 -k0/E(k0) ではなく、運動量分布
  //   |g(k)|² = exp[-σ²(k-k0)²]
  // で重みづけた群速度 -k/E(k) の平均になる。v_g(k)=k/E は k>0 で上に凸なので、
  // Jensen により |⟨v⟩| < |k0/E(k0)|（σ=1.5, k0=2, m=1 で約 1.4% 下）。
  // 点値と比べるとこの有限幅効果ぶん必ずずれるため、正しい期待値である
  // 「分布で重みづけた群速度平均」と比較する。これは solver が分枝構成と
  // measure() の積分を厳密に再現していれば機械精度で一致する。
  let num = 0, den = 0;
  for (let n = 0; n < g.N; n++) {
    const k = g.k[n];
    const w = Math.exp(-(sigma * sigma) * (k - k0) * (k - k0));
    num += w * (-k / Math.hypot(k, s.m));
    den += w;
  }
  const expected = num / den;   // ≈ -0.8806

  assertClose(o.vMean, expected, 1e-6, "⟨v⟩ が運動量分布で重みづけた群速度平均と一致しない");
  assert(o.vMean < 0, "負分枝なのに ⟨v⟩ が正になっている");
  assert(Math.abs(o.vMean) < k0 / Math.hypot(k0, s.m),
    "有限幅の波束なら |⟨v⟩| < |k0/E(k0)| のはず（Jensen）");
});

test("setPacket: naive は分枝が混ざる", () => {
  const g = makeGrid(512, 40);
  const s = createSolver(g);
  s.m = 1;
  s.setPacket("naive", 20, 2, 1.5);
  const w = branchWeights(spectrum(s.state, g), g, s.m);
  let wp = 0, wm = 0;
  for (let n = 0; n < g.N; n++) { wp += w.wPlus[n]; wm += w.wMinus[n]; }
  const frac = wm / (wp + wm);
  assert(frac > 1e-3, `naive なのに負分枝の重み比が ${frac} と小さすぎる`);
});

test("normalize: ノルムが 1 になる", () => {
  const g = makeGrid(128, 40);
  const s = createSolver(g);
  for (let j = 0; j < g.N; j++) s.state.re1[j] = 3.7 * Math.exp(-((g.x[j] - 10) ** 2) / 5);
  s.normalize();
  assertClose(measure(s.state, s.fields, s.m, g).norm, 1, 1e-13, "ノルム");
});

// 検証項目 11
test("projectToBranch: 射影は厳密（残留する反対分枝の重み比 < 1e-14）", () => {
  const g = makeGrid(512, 40);
  const s = createSolver(g);
  s.m = 0.7;
  // ランダムな凹凸を持つ状態（手描きの模擬）
  let seed = 23;
  const r = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 - 0.5; };
  for (let j = 0; j < g.N; j++) {
    s.state.re1[j] = r();
    s.state.im1[j] = r();
    s.state.re2[j] = r();
    s.state.im2[j] = r();
  }
  s.projectToBranch(+1);
  const w = branchWeights(spectrum(s.state, g), g, s.m);
  let wp = 0, wm = 0;
  for (let n = 0; n < g.N; n++) { wp += w.wPlus[n]; wm += w.wMinus[n]; }
  assert(wm / (wp + wm) < 1e-14, `残留した負分枝の重み比 ${wm / (wp + wm)}`);
});

test("projectToBranch: 落ちた重みの割合を返し、射影後は規格化されている", () => {
  const g = makeGrid(512, 40);
  const s = createSolver(g);
  s.m = 1;
  s.setPacket("mix", 20, 2, 1.5);   // 50:50 混合なので約半分が落ちるはず
  const lost = s.projectToBranch(+1);
  assert(lost > 0.4 && lost < 0.6, `落ちた重みの割合 ${lost} が 0.5 付近でない`);
  assertClose(measure(s.state, s.fields, s.m, g).norm, 1, 1e-13, "射影後のノルム");
});
