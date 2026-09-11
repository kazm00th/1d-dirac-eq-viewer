import { test, assert, assertClose } from "./harness.js";
import { makeGrid, createSolver } from "../src/dirac.js";
import { measure, density, current, spectrum } from "../src/observables.js";

const DT = 0.002;

/**
 * ⟨v⟩ だけを実空間の和で求める軽量版。
 * measure() は FFT と分枝射影まで走るため、毎ステップ呼ぶと重すぎる。
 */
function meanVelocity(solver) {
  const rho = density(solver.state);
  const jj = current(solver.state);
  let n = 0, v = 0;
  for (let j = 0; j < solver.grid.N; j++) { n += rho[j]; v += jj[j]; }
  return n > 1e-300 ? v / n : 0;
}

/**
 * 運動量分布 |g(k)|² = exp[-σ²(k-k0)²] で重みづけた群速度平均。
 * 有限幅の波束の ⟨v⟩ = d⟨x⟩/dt はこの値であって、点値 k0/E(k0) ではない
 * （v_g(k)=k/E は k>0 で上に凸 → Jensen で点値より小さい。σ=2.0, k0=2, m=1 で約 0.7% 下）。
 */
function weightedGroupVelocity(grid, k0, sigma, m, sign) {
  let num = 0, den = 0;
  for (let n = 0; n < grid.N; n++) {
    const k = grid.k[n];
    const w = Math.exp(-(sigma * sigma) * (k - k0) * (k - k0));
    num += w * sign * k / Math.hypot(k, m);
    den += w;
  }
  return num / den;
}

// 検証項目 4
test("物理: 正分枝波束の群速度が運動量分布で重みづけた k/E 平均と一致する", () => {
  const g = makeGrid(512, 40);
  const s = createSolver(g);
  s.m = 1;
  const k0 = 2, sigma = 2.0;
  s.setPacket("+", 12, k0, sigma);

  const x0 = measure(s.state, s.fields, s.m, g).xMean;
  const steps = 1500;
  for (let i = 0; i < steps; i++) s.step(DT);
  const x1 = measure(s.state, s.fields, s.m, g).xMean;

  const measured = (x1 - x0) / (steps * DT);
  const expected = weightedGroupVelocity(g, k0, sigma, s.m, +1);   // ≈ 0.8877
  // 自由伝播では ⟨v⟩ は時間に依らず一定（Ehrenfest, 外力なし）なので、
  // 平均速度＝この重みつき平均に機械精度レベルで一致するはず。時間離散化と
  // ⟨x⟩ の数値差分ぶんの余裕をみて 2e-3。
  assertClose(measured, expected, 2e-3, `群速度 (測定 ${measured}, 理論 ${expected})`);
  // 点値 k0/E(k0) より小さいこと（有限幅 → Jensen）も確認する
  assert(measured < k0 / Math.hypot(k0, s.m),
    "有限幅の波束なら測定群速度 < k0/E(k0) のはず");
});

// 検証項目 5
test("物理: 大きな k でも ⟨v⟩ が光速を超えない", () => {
  const g = makeGrid(512, 40);
  const s = createSolver(g);
  s.m = 1;
  // k₀ はナイキスト限界 π/h ≈ 40.2 より十分小さく取る。
  // これを超える波束は格子上に表現できず、テストの前提が壊れる。
  s.setPacket("+", 20, 30, 3.0);
  for (let i = 0; i < 500; i++) {
    s.step(DT);
    const v = meanVelocity(s);
    assert(Math.abs(v) < 1, `ステップ ${i} で |⟨v⟩| = ${Math.abs(v)} が 1 以上になった`);
  }
  // 高 k では群速度が 1 に近づくはず（飽和の確認）
  assert(meanVelocity(s) > 0.99, `k₀=30, m=1 なのに ⟨v⟩ = ${meanVelocity(s)} と小さい`);
});

// 検証項目 6
test("物理: 50:50 混合の Zitterbewegung 周期が π/⟨E⟩ と一致する", () => {
  const g = makeGrid(512, 40);
  const s = createSolver(g);
  s.m = 1;
  const k0 = 1, sigma = 5.0;
  // σ を大きく取り k 空間で細く（ほぼ単色）にする。それでも有限幅なので
  // ZB 角振動数 2E(k) はモードごとに少し違い、時間とともに位相がずれて
  // 振幅が減衰する（デコヒーレンス時間 ~ 1/(2·δω)）。そのため
  //  (1) 観測窓は短くとり（コヒーレントなうちに数周期を見る）
  //  (2) ゼロ交差は線形補間して整数量子化誤差を消し
  //  (3) 期待周期は点値 π/E(k0) ではなく π/⟨E⟩（分布で重みづけた平均。
  //      E(k) は下に凸なので ⟨E⟩ > E(k0)）と比べる。
  s.setPacket("mix", 20, k0, sigma);

  // 分布で重みづけた ⟨E⟩
  let eNum = 0, eDen = 0;
  for (let n = 0; n < g.N; n++) {
    const k = g.k[n];
    const w = Math.exp(-(sigma * sigma) * (k - k0) * (k - k0));
    eNum += w * Math.hypot(k, s.m);
    eDen += w;
  }
  const Emean = eNum / eDen;
  const expectedPeriod = Math.PI / Emean;   // ≈ 2.22

  const T = 6;   // Emean のデコヒーレンス時間より十分短い窓
  const steps = Math.round(T / DT);
  const ts = [], vs = [];
  for (let i = 0; i < steps; i++) {
    s.step(DT);
    ts.push((i + 1) * DT);
    vs.push(meanVelocity(s));   // measure() は重いので使わない
  }

  // トレンド除去（mix の正味ドリフトは理論上 0 だが数値ぶんを引く）
  const mean = vs.reduce((a, b) => a + b, 0) / vs.length;

  // 上昇方向のゼロ交差時刻を線形補間で求める
  const crossTimes = [];
  for (let i = 1; i < vs.length; i++) {
    const a = vs[i - 1] - mean, b = vs[i] - mean;
    if (a < 0 && b >= 0) {
      const frac = a / (a - b);
      crossTimes.push(ts[i - 1] + frac * (ts[i] - ts[i - 1]));
    }
  }
  assert(crossTimes.length >= 3,
    `上昇ゼロ交差が ${crossTimes.length} 回しかなく周期を測れない`);

  // 連続する上昇交差の間隔がちょうど 1 周期
  let sum = 0;
  for (let i = 1; i < crossTimes.length; i++) sum += crossTimes[i] - crossTimes[i - 1];
  const measuredPeriod = sum / (crossTimes.length - 1);

  assertClose(measuredPeriod, expectedPeriod, 0.03,
    `ZB 周期 (測定 ${measuredPeriod}, 理論 ${expectedPeriod})`);
});

// 検証項目 7
test("物理: m=0 で ψ₁ が形を保ったまま光速で右へ進む", () => {
  const g = makeGrid(512, 40);
  const s = createSolver(g);
  s.m = 0;
  // m=0 では naive (ψ₁ のみ) がそのまま純粋な右進行になる
  s.setPacket("naive", 10, 0, 2.0);

  // 形の比較は実空間ではなく k 空間の振幅 |ψ̂₁(k)| で行う。
  // 平行移動は位相 e^(-ikcT) を掛けるだけで振幅を変えないため、
  // この比較は移動距離 T が格子刻み h の整数倍でなくても厳密に成立する。
  // （実空間で「shift セルずらして比較」すると T/h の端数のぶんだけ必ず食い違う。）
  const specBefore = spectrum(s.state, g);
  const ampBefore = new Float64Array(g.N);
  for (let n = 0; n < g.N; n++) {
    ampBefore[n] = Math.hypot(specBefore.re1[n], specBefore.im1[n]);
  }

  const T = 8;
  const steps = Math.round(T / DT);
  for (let i = 0; i < steps; i++) {
    s.step(DT);
    // 純粋な右進行なら j = ρ なので ⟨v⟩ は恒等的に 1 になる
    assertClose(meanVelocity(s), 1, 1e-12, `ステップ ${i} の ⟨v⟩`);
  }

  // ψ₂ は生成されないはず（m=0 なら左右は結合しない）
  let max2 = 0;
  for (let j = 0; j < g.N; j++) {
    max2 = Math.max(max2, Math.abs(s.state.re2[j]), Math.abs(s.state.im2[j]));
  }
  assert(max2 < 1e-12, `m=0 なのに ψ₂ が生成された (最大 ${max2})`);

  const specAfter = spectrum(s.state, g);
  let maxDiff = 0, maxAmp = 0;
  for (let n = 0; n < g.N; n++) {
    const a = Math.hypot(specAfter.re1[n], specAfter.im1[n]);
    maxDiff = Math.max(maxDiff, Math.abs(a - ampBefore[n]));
    maxAmp = Math.max(maxAmp, ampBefore[n]);
  }
  assert(maxDiff / maxAmp < 1e-12,
    `|ψ̂₁(k)| が保たれていない (相対差 ${maxDiff / maxAmp})`);
});
