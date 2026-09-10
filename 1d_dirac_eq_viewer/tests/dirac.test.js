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
