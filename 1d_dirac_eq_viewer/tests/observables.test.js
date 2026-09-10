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
