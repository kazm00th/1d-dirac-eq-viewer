import { test, assert, assertClose } from "./harness.js";
import { branchSpinors } from "../src/observables.js";

/** H₀(k) = [[k, m], [m, -k]] を実ベクトル (a, b) に作用させる。 */
function applyH0(k, m, a, b) {
  return { a: k * a + m * b, b: m * a - k * b };
}

/** テストで走査する (k, m) の組。m=0 と k<0 と k=0 を必ず含める。 */
const CASES = [];
for (const m of [0, 1e-12, 0.001, 1, 3]) {
  for (const k of [-40, -5, -1, -1e-9, 0, 1e-9, 1, 5, 40]) {
    CASES.push({ k, m });
  }
}

test("branchSpinors: 固有値方程式 H₀ u₊ = +E u₊ を満たす", () => {
  for (const { k, m } of CASES) {
    const { E, up0, up1 } = branchSpinors(k, m);
    const r = applyH0(k, m, up0, up1);
    assertClose(r.a, E * up0, 1e-12, `k=${k}, m=${m} 第1成分`);
    assertClose(r.b, E * up1, 1e-12, `k=${k}, m=${m} 第2成分`);
  }
});

test("branchSpinors: 固有値方程式 H₀ u₋ = -E u₋ を満たす", () => {
  for (const { k, m } of CASES) {
    const { E, um0, um1 } = branchSpinors(k, m);
    const r = applyH0(k, m, um0, um1);
    assertClose(r.a, -E * um0, 1e-12, `k=${k}, m=${m} 第1成分`);
    assertClose(r.b, -E * um1, 1e-12, `k=${k}, m=${m} 第2成分`);
  }
});

test("branchSpinors: u₊, u₋ は正規直交", () => {
  for (const { k, m } of CASES) {
    const { up0, up1, um0, um1 } = branchSpinors(k, m);
    assertClose(up0 * up0 + up1 * up1, 1, 1e-14, `|u₊|² k=${k}, m=${m}`);
    assertClose(um0 * um0 + um1 * um1, 1, 1e-14, `|u₋|² k=${k}, m=${m}`);
    assertClose(up0 * um0 + up1 * um1, 0, 1e-14, `直交性 k=${k}, m=${m}`);
  }
});

test("branchSpinors: 符号規約 u₋ = (-up1, up0)", () => {
  for (const { k, m } of CASES) {
    const { up0, up1, um0, um1 } = branchSpinors(k, m);
    assertClose(um0, -up1, 1e-14, `um0 k=${k}, m=${m}`);
    assertClose(um1, up0, 1e-14, `um1 k=${k}, m=${m}`);
  }
});

// 検証項目 10
test("branchSpinors: m=0 の全格子で NaN を出さない (桁落ち回避)", () => {
  const N = 512, L = 40;
  for (let n = 0; n < N; n++) {
    const k = (n < N / 2 ? n : n - N) * (2 * Math.PI / L);
    const s = branchSpinors(k, 0);
    for (const [name, v] of Object.entries(s)) {
      assert(Number.isFinite(v), `k=${k} で ${name} が有限値でない: ${v}`);
    }
  }
});

test("branchSpinors: m=0 極限で u₊ が進行方向の成分に落ちる", () => {
  // k > 0: 正エネルギーは右進行 → 第1成分のみ
  let s = branchSpinors(3, 0);
  assertClose(Math.abs(s.up0), 1, 1e-14, "k>0 の up0");
  assertClose(s.up1, 0, 1e-14, "k>0 の up1");
  // k < 0: 正エネルギーは左進行 → 第2成分のみ
  s = branchSpinors(-3, 0);
  assertClose(s.up0, 0, 1e-14, "k<0 の up0");
  assertClose(Math.abs(s.up1), 1, 1e-14, "k<0 の up1");
});

import { spectrum, density, current, branchWeights, measure } from "../src/observables.js";
import { makeGrid, createSolver } from "../src/dirac.js";

test("spectrum: 引数の state を変更しない", () => {
  const g = makeGrid(64, 40);
  const s = createSolver(g);
  for (let j = 0; j < g.N; j++) {
    s.state.re1[j] = Math.sin(g.x[j]);
    s.state.im2[j] = Math.cos(g.x[j]);
  }
  const before = {
    re1: s.state.re1.slice(), im1: s.state.im1.slice(),
    re2: s.state.re2.slice(), im2: s.state.im2.slice(),
  };
  spectrum(s.state, g);
  for (let j = 0; j < g.N; j++) {
    assertClose(s.state.re1[j], before.re1[j], 1e-15, `re1[${j}] が変更された`);
    assertClose(s.state.im1[j], before.im1[j], 1e-15, `im1[${j}] が変更された`);
    assertClose(s.state.re2[j], before.re2[j], 1e-15, `re2[${j}] が変更された`);
    assertClose(s.state.im2[j], before.im2[j], 1e-15, `im2[${j}] が変更された`);
  }
});

test("spectrum: Parseval 規格化が成り立つ", () => {
  const g = makeGrid(128, 40);
  const s = createSolver(g);
  for (let j = 0; j < g.N; j++) {
    s.state.re1[j] = Math.exp(-((g.x[j] - 20) ** 2) / 8);
    s.state.im2[j] = 0.3 * Math.sin(3 * g.x[j]);
  }
  let real = 0;
  for (let j = 0; j < g.N; j++) {
    real += s.state.re1[j] ** 2 + s.state.im1[j] ** 2
          + s.state.re2[j] ** 2 + s.state.im2[j] ** 2;
  }
  real *= g.h;

  const sp = spectrum(s.state, g);
  let spec = 0;
  for (let n = 0; n < g.N; n++) {
    spec += sp.re1[n] ** 2 + sp.im1[n] ** 2 + sp.re2[n] ** 2 + sp.im2[n] ** 2;
  }
  assertClose(spec, real, 1e-13, "Parseval");
});

test("current: |j| ≤ ρ が全格子で成り立つ", () => {
  const g = makeGrid(64, 40);
  const s = createSolver(g);
  let seed = 11;
  const r = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 - 0.5; };
  for (let j = 0; j < g.N; j++) {
    s.state.re1[j] = r(); s.state.im1[j] = r();
    s.state.re2[j] = r(); s.state.im2[j] = r();
  }
  const rho = density(s.state);
  const jj = current(s.state);
  for (let j = 0; j < g.N; j++) {
    assert(Math.abs(jj[j]) <= rho[j] + 1e-15, `index ${j}: |j|=${Math.abs(jj[j])} > ρ=${rho[j]}`);
  }
});

test("measure: 正分枝の平面波で ⟨H⟩ = +E, ⟨v⟩ = k/E になる", () => {
  const g = makeGrid(64, 40);
  const s = createSolver(g);
  s.m = 1;
  const kk = g.k[5];
  const { E, up0, up1 } = branchSpinors(kk, s.m);
  for (let j = 0; j < g.N; j++) {
    const ph = kk * g.x[j];
    const c = Math.cos(ph), sn = Math.sin(ph);
    s.state.re1[j] = up0 * c; s.state.im1[j] = up0 * sn;
    s.state.re2[j] = up1 * c; s.state.im2[j] = up1 * sn;
  }
  const o = measure(s.state, s.fields, s.m, g);
  assertClose(o.energy, E, 1e-12, "⟨H⟩");
  assertClose(o.vMean, kk / E, 1e-12, "⟨v⟩");
  assertClose(o.wPlusTotal / (o.wPlusTotal + o.wMinusTotal), 1, 1e-12, "正分枝の重み比");
});

test("measure: 負分枝の平面波で ⟨H⟩ = -E, ⟨v⟩ = -k/E になる", () => {
  const g = makeGrid(64, 40);
  const s = createSolver(g);
  s.m = 1;
  const kk = g.k[5];
  const { E, um0, um1 } = branchSpinors(kk, s.m);
  for (let j = 0; j < g.N; j++) {
    const ph = kk * g.x[j];
    const c = Math.cos(ph), sn = Math.sin(ph);
    s.state.re1[j] = um0 * c; s.state.im1[j] = um0 * sn;
    s.state.re2[j] = um1 * c; s.state.im2[j] = um1 * sn;
  }
  const o = measure(s.state, s.fields, s.m, g);
  assertClose(o.energy, -E, 1e-12, "⟨H⟩");
  assertClose(o.vMean, -kk / E, 1e-12, "⟨v⟩");
  assertClose(o.wMinusTotal / (o.wPlusTotal + o.wMinusTotal), 1, 1e-12, "負分枝の重み比");
});

test("measure: 外場ありでも ⟨H⟩ が時間発展で保存する", () => {
  const g = makeGrid(128, 40);
  const s = createSolver(g);
  s.m = 0.8;
  for (let j = 0; j < g.N; j++) {
    const d = g.x[j] - 15;
    s.state.re1[j] = Math.exp(-(d * d) / 4);
    s.fields.V[j] = 0.5 * Math.sin(2 * Math.PI * g.x[j] / g.L);
    s.fields.S[j] = 0.3 * Math.cos(2 * Math.PI * g.x[j] / g.L);
  }
  const e0 = measure(s.state, s.fields, s.m, g).energy;
  for (let i = 0; i < 2000; i++) s.step(0.002);
  const e1 = measure(s.state, s.fields, s.m, g).energy;
  assertClose(e1, e0, 1e-6, "⟨H⟩ の保存");
});
