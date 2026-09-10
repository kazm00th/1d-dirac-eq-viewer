import { test, assert } from "./harness.js";
import { makeGrid, createSolver } from "../src/dirac.js";
import { measure } from "../src/observables.js";

/**
 * 段差に正分枝波束を当て、波束が両端の吸収層に完全に吸われるまで回して
 * 透過 T = absorbedRight、反射 R = absorbedLeft を返す。
 *
 * 「段差より右の確率」を途中時刻で測る方法は、反射波の裾やエバネッセント skin
 * を透過と誤って拾ってしまい曖昧になる。完全に吸わせてから左右の吸収量を読めば
 * T + R ≈ 1 が厳密に成り立ち、T が透過確率そのものになる。
 *
 * パラメータ: m=0.5, k0=2 ⇒ E = √(4.25) ≈ 2.062。
 *   V 段差 height=4: V₀ = 4 > E + m ≈ 2.56 → Klein 透過が残る。
 *   S 段差 height=4: 実効質量 0.5 + 4 = 4.5 > E → 全反射（エバネッセント）。
 *   k0 を 2 に上げて群速度（≈ 0.97）を稼ぎ、内部が空になるまでのステップ数を抑える。
 */
function transmission(which, height) {
  const g = makeGrid(512, 40);
  const s = createSolver(g);
  s.m = 0.5;
  s.absorbWidth = 5;
  s.setPacket("+", 12, 2, 2.0);   // 左裾 x0-3σ = 6 > 吸収層端 x=5、クリップされない
  s.setField(which, "step", { height });

  // 内部がほぼ空になるまで（最大 32000 ステップ = t64）回す。500 ステップごとに確認。
  // 注: cos² 吸収層は端で ~1.7% back-reflect し、その分は 2 周目（~t60）で吸われる。
  //     t40 では内部にまだ ~1.5% 残るので t64 まで見る必要がある。
  let norm = 1;
  for (let i = 0; i < 32000; i++) {
    s.step(0.002);
    if (i % 500 === 499) {
      norm = measure(s.state, s.fields, s.m, g).norm;
      if (norm < 1e-4) break;
    }
  }
  norm = measure(s.state, s.fields, s.m, g).norm;
  assert(norm < 2e-3, `内部に ${norm} 残っており透過を確定できない（ステップ数不足）`);
  return { T: s.absorbedRight, R: s.absorbedLeft };
}

// 検証項目 8
test("Klein: V 段差 (V₀ > E + m) では有意な透過が残る", () => {
  const { T, R } = transmission("V", 4);
  assert(T > 0.1, `透過 T=${T} が小さすぎる（Klein パラドックスが出ていない）`);
  assert(Math.abs(T + R - 1) < 0.02, `T+R=${T + R} が 1 から外れている（吸収の取りこぼし）`);
});

test("Klein: 同じ高さの S 段差では透過がほぼ消える", () => {
  const { T, R } = transmission("S", 4);
  assert(T < 5e-3, `透過 T=${T} が大きすぎる（スカラー段差は全反射のはず）`);
  assert(R > 0.99, `反射 R=${R} が小さすぎる`);
});

test("Klein: V 段差と S 段差の透過率の比が 50 倍以上ある", () => {
  const tV = transmission("V", 4).T;
  const tS = transmission("S", 4).T;
  assert(tV / tS > 50, `比が ${tV / tS} しかない（静電とスカラーの対比が出ていない）`);
});
