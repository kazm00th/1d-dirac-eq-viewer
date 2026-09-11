import { makeGrid, createSolver } from "./dirac.js";
import { measure, density, current, spectrum, branchWeights } from "./observables.js";
import { createRealRenderer, createMomentumRenderer } from "./render.js";
import { bindUI } from "./ui.js";

const N = 512;
const L = 40;
const DT = 0.002;
const MAX_STEPS_PER_FRAME = 400;
const MOMENTUM_KMAX = 8;   // 運動量パネルの k 表示範囲。波束の k₀ スライダ上限は 20 だが、
                          // 全域を映すと質量ギャップと群速度の飽和が潰れるので絞る。

const grid = makeGrid(N, L);
const solver = createSolver(grid);

let running = false;
let checkpoint = null;

const ui = bindUI({
  onStart, onStop, onReset, onSmooth, onProject, onNormalize,
  onPacketPreset, onFieldPreset, onDrawStart, onDrawMove, onDrawEnd,
});

const realRenderer = createRealRenderer(ui.els.plot);
const momentumRenderer = createMomentumRenderer(ui.els.kplot);

function snapshot() {
  return {
    re1: solver.state.re1.slice(), im1: solver.state.im1.slice(),
    re2: solver.state.re2.slice(), im2: solver.state.im2.slice(),
    V: solver.fields.V.slice(), S: solver.fields.S.slice(),
    t: solver.t, absorbed: solver.absorbed,
  };
}

function restore(snap) {
  solver.state.re1.set(snap.re1); solver.state.im1.set(snap.im1);
  solver.state.re2.set(snap.re2); solver.state.im2.set(snap.im2);
  solver.fields.V.set(snap.V); solver.fields.S.set(snap.S);
  solver.t = snap.t;
  solver.absorbed = snap.absorbed;
}

function onStart() {
  checkpoint = snapshot();
  running = true;
  ui.setRunning(true);
  lastTime = performance.now();
}

function onStop() {
  running = false;
  ui.setRunning(false);
}

function onReset() {
  if (checkpoint) restore(checkpoint);
  solver.t = 0;
  solver.absorbed = 0;
}

/** 描画対象が波動関数のいずれかなら "psi"、そうでなければ "V"/"S" を返す。 */
function smoothTargetOf(drawTarget) {
  return (drawTarget === "V" || drawTarget === "S") ? drawTarget : "psi";
}

function onSmooth() {
  solver.smooth(smoothTargetOf(ui.getState().drawTarget));
}

function onProject(sign) {
  const lost = solver.projectToBranch(sign);
  ui.setHint(
    `${sign > 0 ? "正" : "負"}分枝へ射影しました。` +
    `反対の分枝に乗っていた ${(lost * 100).toFixed(1)}% の重みが落ちました。` +
    `実数の関数を描いていても、射影後は一般に複素になります` +
    `（u±(k) は実ベクトルですが k の偶関数ではないため、実関数を保証する対称性が壊れます）。`
  );
}

function onNormalize() {
  solver.normalize();
}

function onPacketPreset(branch) {
  const s = ui.getState();
  solver.m = s.m;
  solver.setPacket(branch, s.x0, s.k0, s.sigma);
  solver.t = 0;
  solver.absorbed = 0;
}

function onFieldPreset(which, shape) {
  if (shape === "none") {
    solver.setField("V", "none", {});
    solver.setField("S", "none", {});
  } else if (shape === "well") {
    // スカラー井戸は 0 < |S| < 2m でないと束縛状態にならず質量ギャップが
    // 反転してしまう。既定の質量 m=1 スライダーに合わせて 1.5 に抑える。
    solver.setField(which, shape, { height: 1.5, width: 4 });
  } else {
    // 階段/障壁 V の Klein 透過には V₀ > E+m が要る。既定スライダー
    // (m=1, k0=2 → E+m ≈ 3.24) で確実に超えるよう 5 にする。
    solver.setField(which, shape, { height: 5, width: 4 });
  }
}

// --- ドラッグ描画 ---
// fx は 0〜1 の正規化した横位置。前回の点との間を線形補間して塗る。
let lastDraw = null;

function targetArray(name) {
  switch (name) {
    case "V": return solver.fields.V;
    case "S": return solver.fields.S;
    case "re1": return solver.state.re1;
    case "im1": return solver.state.im1;
    case "re2": return solver.state.re2;
    case "im2": return solver.state.im2;
    default: throw new Error(`未知の描画対象: ${name}`);
  }
}

function paintSegment(arr, fx0, y0, fx1, y1) {
  const i0 = Math.min(N - 1, Math.max(0, Math.round(fx0 * (N - 1))));
  const i1 = Math.min(N - 1, Math.max(0, Math.round(fx1 * (N - 1))));
  const lo = Math.min(i0, i1), hi = Math.max(i0, i1);
  for (let j = lo; j <= hi; j++) {
    const frac = (i1 === i0) ? 0 : (j - i0) / (i1 - i0);
    arr[j] = y0 + (y1 - y0) * frac;
  }
}

function onDrawStart(fx, y) {
  const arr = targetArray(ui.getState().drawTarget);
  paintSegment(arr, fx, y, fx, y);
  lastDraw = { fx, y };
}

function onDrawMove(fx, y) {
  if (!lastDraw) return;
  const arr = targetArray(ui.getState().drawTarget);
  paintSegment(arr, lastDraw.fx, lastDraw.y, fx, y);
  lastDraw = { fx, y };
}

function onDrawEnd() { lastDraw = null; }

// --- メインループ ---
let lastTime = performance.now();
let accumulator = 0;

function frame(now) {
  const s = ui.getState();
  solver.m = s.m;
  solver.absorbWidth = s.absorbWidth;

  const dtWall = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;

  if (running) {
    accumulator += dtWall * s.speed * 40;
    let count = 0;
    while (accumulator >= 1 && count < MAX_STEPS_PER_FRAME) {
      solver.step(DT);
      accumulator -= 1;
      count++;
    }
  }

  // spectrum() は FFT 4 回、branchWeights() は branchSpinors 512 回を要する。
  // 観測量と運動量パネルで別々に計算すると毎フレーム二重に走るため、一度だけ求めて共有する。
  const spec = spectrum(solver.state, grid);

  const o = measure(solver.state, solver.fields, solver.m, grid, spec);
  ui.setStats({ ...o, t: solver.t, absorbed: solver.absorbed });

  realRenderer.draw({
    grid, state: solver.state,
    density: density(solver.state), current: current(solver.state),
    fields: solver.fields, yscale: s.yscale,
    absorbWidth: solver.absorbWidth, show: s.show,
  });

  const w = branchWeights(spec, grid, solver.m);
  momentumRenderer.draw({
    grid, m: solver.m, wPlus: w.wPlus, wMinus: w.wMinus,
    // ナイキスト全域 (π/h ≈ 40) だと質量ギャップ 2m も dE/dk→±1 の飽和も
    // 縮んで見えない。物理が見える範囲に絞る（波束の k₀ 最大 20 の半分程度）が、
    // k₀ スライダーをそれ以上に振ったときは帯がパネル外に消えないよう追従させる。
    kMax: Math.max(MOMENTUM_KMAX, Math.abs(s.k0) * 1.4),
  });

  requestAnimationFrame(frame);
}

// --- 起動時の初期状態 ---
{
  const s = ui.getState();
  solver.m = s.m;
  solver.absorbWidth = s.absorbWidth;
  solver.setPacket("mix", s.x0, s.k0, s.sigma);
  ui.setRunning(false);
}
requestAnimationFrame(frame);
