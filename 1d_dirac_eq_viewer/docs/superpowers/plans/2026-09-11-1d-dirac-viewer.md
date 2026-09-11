# 1+1次元ディラック方程式 リアルタイムビューア 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 1+1次元ディラック方程式の時間発展をブラウザ上でリアルタイムに可視化・操作できるツールを作る。

**Architecture:** Weyl 表現（`α=σ_z`, `β=σ_x`）で状態を 2 成分スピノルとして持ち、Strang 分割で時間発展させる。運動ステップは FFT で `k` 空間に移して成分ごとの位相回転（厳密）、ポテンシャル・質量ステップは実空間で 2×2 行列の閉形式指数（厳密）。誤差源は分割のみで大域的に `O(Δt²)`。描画は Canvas 2D で実空間と運動量空間の 2 枚。

**Tech Stack:** 素の JavaScript（ES モジュール）、Canvas 2D、依存ライブラリなし、ビルド工程なし。ローカルサーバ経由で起動する。

**Spec:** `docs/superpowers/specs/2026-09-11-1d-dirac-viewer-design.md`

## Global Constraints

- 単位系は `ħ = c = 1`。長さの単位は `m=1` のときの**換算**コンプトン波長 `ƛ_C`。UI 文言では必ず「換算コンプトン波長」と書き、「コンプトン波長」とだけ書いてはならない（`λ_C = 2π ƛ_C` と 2π 違うため）
- 表現は Weyl 表現に固定: `α = σ_z`, `β = σ_x`
- 既定の格子: `N = 512`（2 の冪に固定）、`L = 40`、`h = L/N`、`Δt = 0.002`
- `k` 配列は FFT の並び順（`n < N/2` なら `n`、それ以外は `n - N`）に `2π/L` を掛けたもの
- 分枝スピノル `u₊(k)`, `u₋(k)` は**実ベクトル**。複素として扱ってはならない
- `u₋` の符号は `u₊ = (a, b)` に対し `u₋ = (-b, a)` で固定する
- Parseval 規格化: `h Σ_j |ψ_j|² = Σ_n |ψ̂_n|²`。生の FFT 係数に `√(h/N)` を掛けて得る
- 外部ライブラリ・npm・ビルド工程を導入してはならない
- 表示文言・コメント・ドキュメントは日本語で書く
- コミットは Conventional Commits 形式。各コミットの末尾に `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` を付ける
- 作業ディレクトリは `D:\claude_code\dirac_eq\1d_dirac_eq_viewer`。git リポジトリのルートは `D:\claude_code\dirac_eq`

## ファイル構成

| ファイル | 責務 |
|---|---|
| `src/fft.js` | 複素配列の in-place radix-2 FFT。他に何も知らない |
| `src/observables.js` | 分枝スピノルと観測量を計算する**純関数群**。状態を変更しない |
| `src/dirac.js` | 状態と外場を保持し、**状態を変更する**操作すべて（ステップ・射影・平滑化・規格化） |
| `src/render.js` | 数値を受け取って Canvas に描く。物理を知らない |
| `src/ui.js` | DOM イベントをコールバックに変換する |
| `src/main.js` | 上記を配線し `requestAnimationFrame` ループを回す |
| `index.html` | UI マークアップとスタイル |
| `tests.html` | 検証スイートの入口 |
| `tests/harness.js` | assert ヘルパーと結果レポータ |
| `tests/*.test.js` | 各検証項目 |
| `README.md` | 起動方法と操作の説明 |

依存の向き: `main → {ui, render, dirac, observables}`、`dirac → {fft, observables}`、`observables → fft`。逆向きの依存を作ってはならない。

---

### Task 1: テストハーネスと FFT

**Files:**
- Create: `tests/harness.js`
- Create: `tests.html`
- Create: `src/fft.js`
- Create: `tests/fft.test.js`

**Interfaces:**
- Consumes: なし（最初のタスク）
- Produces:
  - `harness.js`: `test(name, fn)`, `assert(cond, msg)`, `assertClose(actual, expected, relTol, msg)`, `runAll(rootEl)`
  - `fft.js`: `fft(re, im)` — 長さ `n`（2 の冪）の `Float64Array` 2 本を in-place で順変換（規格化なし）。`ifft(re, im)` — in-place で逆変換（`1/n` を含む）

- [ ] **Step 1: テストハーネスを書く**

`tests/harness.js`:

```js
// 依存ライブラリなしの最小テストハーネス。
// test() で登録し、runAll() で実行して DOM に結果を出す。

const registered = [];

export function test(name, fn) {
  registered.push({ name, fn });
}

export function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

/** 相対誤差で比較する。expected が 0 に近い場合は絶対誤差に落ちる。 */
export function assertClose(actual, expected, relTol, msg) {
  const diff = Math.abs(actual - expected);
  const scale = Math.max(1, Math.abs(actual), Math.abs(expected));
  if (!(diff / scale <= relTol)) {
    throw new Error(
      `${msg || "assertClose"}: ${actual} vs ${expected} (相対誤差 ${diff / scale} > ${relTol})`
    );
  }
}

export function runAll(rootEl) {
  let passed = 0;
  let failed = 0;
  const lines = [];
  for (const { name, fn } of registered) {
    try {
      fn();
      passed++;
      lines.push(`<div class="ok">PASS  ${name}</div>`);
    } catch (e) {
      failed++;
      lines.push(`<div class="ng">FAIL  ${name}<br><span class="msg">${e.message}</span></div>`);
    }
  }
  rootEl.innerHTML =
    `<h2>${passed} 件成功 / ${failed} 件失敗</h2>` + lines.join("");
}
```

- [ ] **Step 2: tests.html を書く**

`tests.html`:

```html
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>1+1次元ディラック方程式ビューア 検証スイート</title>
<style>
  body { font-family: monospace; padding: 20px; background: #f5f4f0; color: #2c2c2a; }
  .ok { color: #0f6e56; }
  .ng { color: #a5231a; margin: 6px 0; }
  .msg { color: #5f5e5a; margin-left: 6em; }
</style>
</head>
<body>
<div id="out">実行中…</div>
<script type="module">
  import { runAll } from "./tests/harness.js";
  import "./tests/fft.test.js";
  runAll(document.getElementById("out"));
</script>
</body>
</html>
```

- [ ] **Step 3: 失敗するテストを書く**

`tests/fft.test.js`:

```js
import { test, assert, assertClose } from "./harness.js";
import { fft, ifft } from "../src/fft.js";

/** 素朴な DFT。FFT の参照実装として使う（O(n²) だが n=8 なので問題ない）。 */
function naiveDft(re, im) {
  const n = re.length;
  const outRe = new Float64Array(n);
  const outIm = new Float64Array(n);
  for (let kk = 0; kk < n; kk++) {
    let sr = 0, si = 0;
    for (let j = 0; j < n; j++) {
      const ang = -2 * Math.PI * kk * j / n;
      const c = Math.cos(ang), s = Math.sin(ang);
      sr += re[j] * c - im[j] * s;
      si += re[j] * s + im[j] * c;
    }
    outRe[kk] = sr;
    outIm[kk] = si;
  }
  return { re: outRe, im: outIm };
}

/** 決定論的な擬似乱数。テストを再現可能にする。 */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296 - 0.5;
  };
}

test("fft: n=8 で素朴な DFT と一致する", () => {
  const r = rng(1);
  const re = new Float64Array(8), im = new Float64Array(8);
  for (let i = 0; i < 8; i++) { re[i] = r(); im[i] = r(); }
  const ref = naiveDft(re, im);
  fft(re, im);
  for (let i = 0; i < 8; i++) {
    assertClose(re[i], ref.re[i], 1e-14, `実部 index ${i}`);
    assertClose(im[i], ref.im[i], 1e-14, `虚部 index ${i}`);
  }
});

test("fft: 往復して元に戻る (n=512, 相対誤差 < 1e-14)", () => {
  const n = 512;
  const r = rng(2);
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) { re[i] = r(); im[i] = r(); }
  const re0 = re.slice(), im0 = im.slice();
  fft(re, im);
  ifft(re, im);
  let maxDiff = 0, maxVal = 0;
  for (let i = 0; i < n; i++) {
    maxDiff = Math.max(maxDiff, Math.abs(re[i] - re0[i]), Math.abs(im[i] - im0[i]));
    maxVal = Math.max(maxVal, Math.abs(re0[i]), Math.abs(im0[i]));
  }
  assert(maxDiff / maxVal < 1e-14, `往復誤差 ${maxDiff / maxVal} が大きすぎる`);
});

test("fft: デルタ関数の変換は平坦なスペクトルになる", () => {
  const n = 64;
  const re = new Float64Array(n), im = new Float64Array(n);
  re[0] = 1;
  fft(re, im);
  for (let i = 0; i < n; i++) {
    assertClose(re[i], 1, 1e-14, `実部 index ${i}`);
    assertClose(im[i], 0, 1e-14, `虚部 index ${i}`);
  }
});

test("fft: Parseval の等式 (生の係数では Σ|X|² = n Σ|x|²)", () => {
  const n = 128;
  const r = rng(3);
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) { re[i] = r(); im[i] = r(); }
  let sumX = 0;
  for (let i = 0; i < n; i++) sumX += re[i] * re[i] + im[i] * im[i];
  fft(re, im);
  let sumK = 0;
  for (let i = 0; i < n; i++) sumK += re[i] * re[i] + im[i] * im[i];
  assertClose(sumK, n * sumX, 1e-13, "Parseval");
});
```

- [ ] **Step 4: テストが失敗することを確認する**

```bash
conda activate myenv311
cd /d D:\claude_code\dirac_eq\1d_dirac_eq_viewer
python -m http.server 8123
```

ブラウザで `http://localhost:8123/tests.html` を開く。

Expected: 「0 件成功 / 4 件失敗」またはモジュール読み込みエラー（`src/fft.js` がまだ存在しないため）。

- [ ] **Step 5: FFT を実装する**

`src/fft.js`:

```js
// in-place radix-2 Cooley-Tukey FFT。
// ツイドル因子は漸化式ではなく事前計算した表から引く。
// 漸化式は段数とともに誤差が蓄積し、n=512 で相対誤差が 1e-14 を超えることがあるため。

const tableCache = new Map();

/** 長さ n の変換に必要な cos/sin 表（n/2 要素）を返す。 */
function tables(n) {
  let t = tableCache.get(n);
  if (!t) {
    const half = n >> 1;
    const cos = new Float64Array(half);
    const sin = new Float64Array(half);
    for (let i = 0; i < half; i++) {
      const ang = -2 * Math.PI * i / n;
      cos[i] = Math.cos(ang);
      sin[i] = Math.sin(ang);
    }
    t = { cos, sin };
    tableCache.set(n, t);
  }
  return t;
}

function transform(re, im, inverse) {
  const n = re.length;
  if (n !== im.length) throw new Error("re と im の長さが違う");
  if (n === 0 || (n & (n - 1)) !== 0) throw new Error(`長さ ${n} は 2 の冪ではない`);
  if (n === 1) return;

  // ビット反転置換
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let tmp = re[i]; re[i] = re[j]; re[j] = tmp;
      tmp = im[i]; im[i] = im[j]; im[j] = tmp;
    }
  }

  const { cos, sin } = tables(n);

  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const step = n / len;          // この段でのツイドル表の刻み幅
    for (let i = 0; i < n; i += len) {
      for (let j = 0, tw = 0; j < half; j++, tw += step) {
        const cr = cos[tw];
        const ci = inverse ? -sin[tw] : sin[tw];
        const a = i + j;
        const b = a + half;
        const vr = re[b] * cr - im[b] * ci;
        const vi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - vr;
        im[b] = im[a] - vi;
        re[a] += vr;
        im[a] += vi;
      }
    }
  }

  if (inverse) {
    for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }
}

/** 順変換（規格化なし）。re, im を in-place で書き換える。 */
export function fft(re, im) { transform(re, im, false); }

/** 逆変換（1/n を含む）。re, im を in-place で書き換える。 */
export function ifft(re, im) { transform(re, im, true); }
```

- [ ] **Step 6: テストが通ることを確認する**

`http://localhost:8123/tests.html` を再読み込みする。

Expected: 「4 件成功 / 0 件失敗」

- [ ] **Step 7: コミット**

```bash
cd /d D:\claude_code\dirac_eq
git add 1d_dirac_eq_viewer/tests.html 1d_dirac_eq_viewer/tests/harness.js 1d_dirac_eq_viewer/tests/fft.test.js 1d_dirac_eq_viewer/src/fft.js
git commit -m "feat: add radix-2 FFT and dependency-free test harness

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: 分枝スピノル

**Files:**
- Create: `src/observables.js`
- Create: `tests/observables.test.js`
- Modify: `tests.html`（`observables.test.js` の import を追加）

**Interfaces:**
- Consumes: なし（`fft.js` はこのタスクでは使わない）
- Produces:
  - `observables.js`: `branchSpinors(k, m)` → `{ E, up0, up1, um0, um1 }`。すべて実数。`(up0, up1)` は固有値 `+E` の規格化済み実固有ベクトル、`(um0, um1) = (-up1, up0)` は固有値 `-E` のもの

**背景（実装者向け）:**

自由ハミルトニアンは `H₀(k) = k σ_z + m σ_x = [[k, m], [m, -k]]` という**実対称行列**である。
したがって固有ベクトルは実ベクトルになる。複素数として扱ってはならない。

固有値は `±E`, `E = √(k² + m²)`。固有ベクトルは 2 つの等価な表式を持つ:

```
u₊(k) ∝ (E + k, m)      … k ≥ 0 で使う
u₊(k) ∝ (m, E - k)      … k < 0 で使う
```

`k < 0` かつ `m → 0` では `E + k → 0` となり、第 1 の表式は規格化因子が `0/0` に落ちて
NaN を生む。`m` スライダーの下端が 0 である以上この経路は必ず通るため、
`k` の符号で表式を切り替える分岐が**必須**である。

- [ ] **Step 1: 失敗するテストを書く**

`tests/observables.test.js`:

```js
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
```

`tests.html` の script ブロックに 1 行足す:

```js
  import "./tests/observables.test.js";
```

- [ ] **Step 2: テストが失敗することを確認する**

`http://localhost:8123/tests.html` を再読み込みする。

Expected: `branchSpinors` が export されていないためモジュール読み込みエラー、または 6 件失敗。

- [ ] **Step 3: 実装する**

`src/observables.js`:

```js
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
```

- [ ] **Step 4: テストが通ることを確認する**

`http://localhost:8123/tests.html` を再読み込みする。

Expected: 「10 件成功 / 0 件失敗」（Task 1 の 4 件 + 本タスクの 6 件）

- [ ] **Step 5: コミット**

```bash
cd /d D:\claude_code\dirac_eq
git add 1d_dirac_eq_viewer/src/observables.js 1d_dirac_eq_viewer/tests/observables.test.js 1d_dirac_eq_viewer/tests.html
git commit -m "feat: add branch spinors with catastrophic cancellation guard

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: 格子・状態・Strang ステップ

**Files:**
- Create: `src/dirac.js`
- Create: `tests/dirac.test.js`
- Modify: `tests.html`

**Interfaces:**
- Consumes: `fft.js` の `fft`, `ifft`
- Produces:
  - `dirac.js`: `makeGrid(N, L)` → `{ N, L, h, x: Float64Array, k: Float64Array }`
  - `dirac.js`: `createSolver(grid)` → solver オブジェクト。以下のプロパティを持つ
    - `solver.grid`
    - `solver.state`: `{ re1, im1, re2, im2 }`（各 `Float64Array(N)`）
    - `solver.fields`: `{ V: Float64Array(N), S: Float64Array(N) }`
    - `solver.m`: number（可変）
    - `solver.t`: number
    - `solver.step(dt)`: 1 副ステップ進める

**背景（実装者向け）:**

Strang 分割の 1 副ステップは次の順で行う。

```
1. 実空間で V/S を Δt/2 進める
2. FFT
3. k 空間で位相回転  ψ̂₁ *= e^(-i k Δt),  ψ̂₂ *= e^(+i k Δt)
4. 逆 FFT
5. 実空間で V/S を Δt/2 進める
```

ステップ 1・5 の厳密形は次の通り。`ψ₁ = a`, `ψ₂ = b` として

```
θ = (m + S_j) · dt
a' = cos θ · a - i sin θ · b
b' = cos θ · b - i sin θ · a
さらに全体に e^(-i V_j · dt) を掛ける
```

`-i sin θ · b` の実部・虚部への展開に注意する。`b = br + i·bi` なら
`-i s b = s·bi - i·s·br` なので、実部に `+s·bi`、虚部に `-s·br` が入る。

ステップ 3 の符号は `ψ₁ ~ e^(ikx)` に対し `i ∂ψ̂₁/∂t = -i(ik)ψ̂₁ = k ψ̂₁` から
`ψ̂₁(t+Δt) = e^(-ikΔt) ψ̂₁(t)`。`ψ₂` は逆符号。

このタスクでは吸収層をまだ実装しない（Task 8 で追加する）。

- [ ] **Step 1: 失敗するテストを書く**

`tests/dirac.test.js`:

```js
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
```

`tests.html` に `import "./tests/dirac.test.js";` を追加する。

- [ ] **Step 2: テストが失敗することを確認する**

Expected: `src/dirac.js` が存在せずモジュール読み込みエラー。

- [ ] **Step 3: 実装する**

`src/dirac.js`:

```js
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
```

- [ ] **Step 4: テストが通ることを確認する**

Expected: 「15 件成功 / 0 件失敗」（4 + 6 + 5）

- [ ] **Step 5: コミット**

```bash
cd /d D:\claude_code\dirac_eq
git add 1d_dirac_eq_viewer/src/dirac.js 1d_dirac_eq_viewer/tests/dirac.test.js 1d_dirac_eq_viewer/tests.html
git commit -m "feat: add grid, state and Strang split-step time evolution

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: 観測量

**Files:**
- Modify: `src/observables.js`（追記）
- Modify: `tests/observables.test.js`（追記）

**Interfaces:**
- Consumes: `fft.js` の `fft`、`observables.js` の `branchSpinors`、`dirac.js` の `makeGrid`, `createSolver`（テストのみ）
- Produces:
  - `observables.js`: `spectrum(state, grid)` → `{ re1, im1, re2, im2 }`（Parseval 規格化済みの**新しい** `Float64Array`。引数の state は変更しない）
  - `observables.js`: `density(state)` → `Float64Array`
  - `observables.js`: `current(state)` → `Float64Array`
  - `observables.js`: `branchWeights(spec, grid, m)` → `{ wPlus: Float64Array, wMinus: Float64Array }`（`spec` は `spectrum()` の戻り値）
  - `observables.js`: `measure(state, fields, m, grid, precomputedSpec)` → `{ norm, xMean, vMean, energy, wPlusTotal, wMinusTotal }`。`precomputedSpec` は省略可。省略時は内部で `spectrum()` を呼ぶ

**背景（実装者向け）:**

`fft` は in-place で引数を破壊する。観測量の計算で状態を壊してはならないため、
`spectrum()` は必ずコピーを取ってから変換すること。これは踏みやすいバグなので
「state を変更しない」ことをテストで直接確認する。

Parseval 規格化は生の FFT 係数に `√(h/N)` を掛けて得る。生の順変換では
`Σ_n |X_n|² = N Σ_j |x_j|²` なので、`|ψ̂_n|² = (h/N)|X_n|²` とすれば
`Σ_n |ψ̂_n|² = h Σ_j |ψ_j|²` になる。

観測量の式（設計書 §3.6, §5.4）:

```
ρ_j = re1²+im1²+re2²+im2²
j_j = (re1²+im1²) - (re2²+im2²)          （c = 1）
ノルム   = h Σ_j ρ_j
⟨x⟩     = h Σ_j x_j ρ_j / ノルム
⟨v⟩     = h Σ_j j_j / ノルム
T       = Σ_n k_n ( |ψ̂₁|² - |ψ̂₂|² )      （Parseval 規格化済み係数で）
M       = h Σ_j (m + S_j) · 2 (re1·re2 + im1·im2)
U       = h Σ_j V_j ρ_j
⟨H⟩     = (T + M + U) / ノルム
```

分枝の重みは各 `k` で `w± = |u±(k) · ψ̂(k)|²`。`u±` は実ベクトルなので
`u·ψ̂ = u0·ψ̂₁ + u1·ψ̂₂` を実部・虚部それぞれについて計算し、二乗和を取る。

- [ ] **Step 1: 失敗するテストを書く**

`tests/observables.test.js` の末尾に追記:

```js
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
```

- [ ] **Step 2: テストが失敗することを確認する**

Expected: `spectrum` などが export されておらずエラー。

- [ ] **Step 3: 実装する**

`src/observables.js` の末尾に追記:

```js
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
```

- [ ] **Step 4: テストが通ることを確認する**

Expected: 「21 件成功 / 0 件失敗」

- [ ] **Step 5: コミット**

```bash
cd /d D:\claude_code\dirac_eq
git add 1d_dirac_eq_viewer/src/observables.js 1d_dirac_eq_viewer/tests/observables.test.js
git commit -m "feat: add observables (density, current, energy, branch weights)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: 初期条件・分枝射影・規格化

**Files:**
- Modify: `src/dirac.js`（`createSolver` に追記）
- Modify: `tests/dirac.test.js`（追記）

**Interfaces:**
- Consumes: `observables.js` の `branchSpinors`, `spectrum`, `branchWeights`
- Produces:
  - `solver.setPacket(branch, x0, k0, sigma)` — `branch` は `"+"` / `"-"` / `"mix"` / `"naive"`
  - `solver.projectToBranch(sign)` — `sign` は `+1` / `-1`。戻り値は落ちた重みの割合（0〜1）
  - `solver.normalize()` — `∫ρdx = 1` にする

**背景（実装者向け）:**

初期条件は `k` 空間で作る。

```
ψ̂(k) = exp[-(σ²/2)(k - k₀)²] · e^(-i k x₀) · u_s(k)
```

実空間でガウスを置いてから固定スピノル `u_s(k₀)` を一様に掛けてはならない。
波束は `k` に幅を持つのに対し `u_s(k)` は `k` に依存するため、
`O(σ_k·|du_s/dk|)` の分枝混合が残り、「正分枝のみ」のはずが微小な Zitterbewegung を出す。

`"naive"` だけは例外で、実空間でガウスを `ψ₁` に置き `ψ₂ = 0` とする。
これは「分枝を考えずに片方の成分だけ置く」という素朴な操作の実演であり、
分枝が混ざるのが**意図した挙動**である。

`k` 空間で作った後は `ifft` で実空間へ戻す。`spectrum()` の `√(h/N)` とは逆向きの
スケールが要るが、最後に `normalize()` を呼ぶので係数は気にしなくてよい。

射影は各 `k` ごとに行うため**厳密**である。

- [ ] **Step 1: 失敗するテストを書く**

`tests/dirac.test.js` の末尾に追記:

```js
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
```

- [ ] **Step 2: テストが失敗することを確認する**

Expected: `setPacket` が未定義でエラー。

- [ ] **Step 3: 実装する**

`src/dirac.js` の import 行を差し替える:

```js
import { fft, ifft } from "./fft.js";
import { branchSpinors, spectrum, branchWeights } from "./observables.js";
```

`createSolver` の中、`return solver;` の直前に以下を追加し、`solver` オブジェクトの
プロパティにも `setPacket`, `projectToBranch`, `normalize` を足す:

```js
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
```

`solver` オブジェクトのリテラルに追加:

```js
    setPacket,
    projectToBranch,
    normalize,
```

- [ ] **Step 4: テストが通ることを確認する**

Expected: 「27 件成功 / 0 件失敗」

- [ ] **Step 5: コミット**

```bash
cd /d D:\claude_code\dirac_eq
git add 1d_dirac_eq_viewer/src/dirac.js 1d_dirac_eq_viewer/tests/dirac.test.js
git commit -m "feat: add k-space packet construction and exact branch projection

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: 物理検証スイート

**Files:**
- Create: `tests/physics.test.js`
- Modify: `tests.html`

**Interfaces:**
- Consumes: `dirac.js` の `makeGrid`, `createSolver`、`observables.js` の `measure`
- Produces: なし（テストのみ）

このタスクは設計書 §9 の検証項目 4・5・6・7 を実装する。実装コードは書かない。
すでに実装済みの機能が物理的に正しい答えを出すことを確認するゲートである。

- [ ] **Step 1: テストを書く**

`tests/physics.test.js`:

```js
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
test("物理: 50:50 混合の Zitterbewegung 周期が 2⟨E⟩ の逆数と一致する", () => {
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
```

`tests.html` に `import "./tests/physics.test.js";` を追加する。

- [ ] **Step 2: テストを実行する**

Expected: 「31 件成功 / 0 件失敗」

**もし失敗したら**、テストの閾値を緩めてはならない。Task 3〜5 の実装に誤りがある。
特に次を疑うこと:

- 群速度が符号ごと逆 → `kineticStep` の位相の符号（`ψ̂₁` は `e^(-ikΔt)`）
- 群速度が 2 倍/半分 → `k` 配列の `2π/L` の掛け忘れ
- ZB 周期が半分 → 符号反転の回数と周期の関係（1 周期に 2 回反転する）
- `m=0` で `ψ₂` が出る → `potentialStep` の `sin θ` が `θ=0` で 0 になっていない

- [ ] **Step 3: コミット**

```bash
cd /d D:\claude_code\dirac_eq
git add 1d_dirac_eq_viewer/tests/physics.test.js 1d_dirac_eq_viewer/tests.html
git commit -m "test: verify group velocity, light-speed bound, Zitterbewegung and massless split

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: 平滑化

**Files:**
- Modify: `src/dirac.js`
- Modify: `tests/dirac.test.js`

**Interfaces:**
- Consumes: `fft.js` の `fft`, `ifft`
- Produces: `solver.smooth(target)` — `target` は `"V"` / `"S"` / `"psi"`。1 回の呼び出しで `σ_s = 2h` のガウシアンを 1 パス適用する

**背景（実装者向け）:**

`k` 空間でガウシアン核を掛ける。

```
f ← IFFT( FFT(f) · exp(-σ_s² k² / 2) ),   σ_s = 2h
```

核は `k=0` でちょうど 1 なので、総和（直流成分）が厳密に保存される。これが検証項目 12。

`target` が `"psi"` のときはスピノル全体（`ψ₁`, `ψ₂` の実部・虚部すべて）に掛ける。
成分ごとに別の幅を掛けると分枝構造が歪むため、必ず同じ核を全成分に適用する。

`V`, `S` は実配列なので、虚部としてゼロ配列を渡して変換し、戻ってきた実部だけを使う。

- [ ] **Step 1: 失敗するテストを書く**

`tests/dirac.test.js` の末尾に追記:

```js
// 検証項目 12
test("smooth: 平滑化しても総和（直流成分）が保存する", () => {
  const g = makeGrid(128, 40);
  const s = createSolver(g);
  // 階段状のギザギザを V に入れる
  for (let j = 0; j < g.N; j++) s.fields.V[j] = (j % 7 < 3) ? 1.5 : -0.5;
  let before = 0;
  for (let j = 0; j < g.N; j++) before += s.fields.V[j];
  s.smooth("V");
  let after = 0;
  for (let j = 0; j < g.N; j++) after += s.fields.V[j];
  assertClose(after, before, 1e-12, "総和");
});

test("smooth: 高周波成分が減る", () => {
  const g = makeGrid(128, 40);
  const s = createSolver(g);
  for (let j = 0; j < g.N; j++) s.fields.V[j] = (j % 2 === 0) ? 1 : -1;  // Nyquist 振動
  const before = Math.max(...s.fields.V);
  s.smooth("V");
  const after = Math.max(...s.fields.V.map(Math.abs));
  assert(after < before * 0.5, `高周波が十分減っていない (${before} → ${after})`);
});

test("smooth: target='S' は V に影響しない", () => {
  const g = makeGrid(128, 40);
  const s = createSolver(g);
  for (let j = 0; j < g.N; j++) {
    s.fields.V[j] = (j % 2 === 0) ? 1 : -1;
    s.fields.S[j] = (j % 2 === 0) ? 1 : -1;
  }
  const vBefore = s.fields.V.slice();
  s.smooth("S");
  for (let j = 0; j < g.N; j++) {
    assertClose(s.fields.V[j], vBefore[j], 1e-15, `V[${j}] が変更された`);
  }
});

test("smooth: target='psi' はノルムを増やさない", () => {
  const g = makeGrid(128, 40);
  const s = createSolver(g);
  let seed = 31;
  const r = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 - 0.5; };
  for (let j = 0; j < g.N; j++) {
    s.state.re1[j] = r(); s.state.im1[j] = r();
    s.state.re2[j] = r(); s.state.im2[j] = r();
  }
  const n0 = measure(s.state, s.fields, s.m, g).norm;
  s.smooth("psi");
  const n1 = measure(s.state, s.fields, s.m, g).norm;
  assert(n1 <= n0 * (1 + 1e-12), `ノルムが増えた (${n0} → ${n1})`);
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Expected: `smooth` が未定義でエラー。

- [ ] **Step 3: 実装する**

`src/dirac.js` の `createSolver` 内に追加:

```js
  /** k 空間ガウシアン核。σ_s = 2h。k=0 で値 1 なので直流成分は保存される。 */
  const smoothKernel = (() => {
    const sig = 2 * grid.h;
    const kern = new Float64Array(N);
    for (let n = 0; n < N; n++) {
      const k = grid.k[n];
      kern[n] = Math.exp(-(sig * sig * k * k) / 2);
    }
    return kern;
  })();

  /** 実配列 1 本に核を掛ける（虚部はゼロとして扱う）。 */
  function convolveReal(arr) {
    const re = arr.slice();
    const im = new Float64Array(N);
    fft(re, im);
    for (let n = 0; n < N; n++) { re[n] *= smoothKernel[n]; im[n] *= smoothKernel[n]; }
    ifft(re, im);
    arr.set(re);
  }

  /** 複素配列 1 組に核を掛ける。 */
  function convolveComplex(reArr, imArr) {
    const re = reArr.slice(), im = imArr.slice();
    fft(re, im);
    for (let n = 0; n < N; n++) { re[n] *= smoothKernel[n]; im[n] *= smoothKernel[n]; }
    ifft(re, im);
    reArr.set(re); imArr.set(im);
  }

  /**
   * 選択中の対象を 1 パス平滑化する。
   * @param {"V"|"S"|"psi"} target
   */
  function smooth(target) {
    if (target === "V") {
      convolveReal(fields.V);
    } else if (target === "S") {
      convolveReal(fields.S);
    } else if (target === "psi") {
      // 成分ごとに別の幅を掛けると分枝構造が歪むため、同じ核を全成分に適用する
      convolveComplex(state.re1, state.im1);
      convolveComplex(state.re2, state.im2);
    } else {
      throw new Error(`未知の target: ${target}`);
    }
  }
```

`solver` オブジェクトのリテラルに `smooth,` を追加する。

- [ ] **Step 4: テストが通ることを確認する**

Expected: 「35 件成功 / 0 件失敗」

- [ ] **Step 5: コミット**

```bash
cd /d D:\claude_code\dirac_eq
git add 1d_dirac_eq_viewer/src/dirac.js 1d_dirac_eq_viewer/tests/dirac.test.js
git commit -m "feat: add k-space Gaussian smoothing for fields and wavefunction

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: 外場プリセットと吸収層

**Files:**
- Modify: `src/dirac.js`
- Modify: `tests/dirac.test.js`
- Create: `tests/klein.test.js`
- Modify: `tests.html`

**Interfaces:**
- Consumes: 既存の solver
- Produces:
  - `solver.absorbWidth`（number、既定 0）
  - `solver.absorbed`（number、累積吸収量の合計）、`solver.absorbedLeft` / `solver.absorbedRight`（左半分 `x < L/2` / 右半分でそれぞれ消えた分の累積。既定 0）
  - `solver.setField(which, shape, params)` — `which` は `"V"` / `"S"`、`shape` は `"none"` / `"step"` / `"barrier"` / `"well"`
  - `solver.step(dt)` が吸収マスクを適用するよう変更される

**背景（実装者向け）:**

吸収マスクは両端に幅 `W` の `cos²` テーパー。

```
端からの距離 d が W 未満の格子点で  M = cos²( (π/2)·(W - d)/W )
それ以外は M = 1
```

`d` は左端 `x` と右端 `L - x` の小さい方。`W = 0` のときはマスクを一切適用しない
（そのとき時間発展は完全にユニタリになり、検証項目 2 が成り立つ）。

吸収した確率量は、マスク適用前後のノルムの差を足していく。**左半分（`x < L/2`）で
消えた分は `solver.absorbedLeft`、右半分は `solver.absorbedRight`、合計は `solver.absorbed`**。
左右を分けておくと、波束を段差に当てて両端の吸収層に完全に吸わせたあと、
`absorbedRight` がそのまま透過確率、`absorbedLeft` が反射確率になる（`T + R ≈ 1`）。
既存の `absorbed` は合計なので、`absorbed` だけを見る吸収層テストは変更不要。

外場の形状（`L = 40` を前提に、中央 `x = 20` を境界とする）:

| shape | V/S の値 |
|---|---|
| `none` | 全域 0 |
| `step` | `x ≥ 20` で `height`、それ以外 0 |
| `barrier` | `20 ≤ x < 20 + width` で `height`、それ以外 0 |
| `well` | `20 - width/2 ≤ x < 20 + width/2` で `-height`、それ以外 0 |

- [ ] **Step 1: 失敗するテストを書く**

`tests/dirac.test.js` に追記:

```js
test("吸収層: W=0 ではマスクが適用されずノルムが保存する", () => {
  const g = makeGrid(128, 40);
  const s = createSolver(g);
  s.m = 1;
  s.setPacket("+", 20, 2, 1.5);
  s.absorbWidth = 0;
  const n0 = measure(s.state, s.fields, s.m, g).norm;
  for (let i = 0; i < 1000; i++) s.step(0.002);
  assertClose(measure(s.state, s.fields, s.m, g).norm, n0, 1e-12, "ノルム");
  assertClose(s.absorbed, 0, 1e-15, "吸収量");
});

test("吸収層: W>0 で端に達した波が吸収され absorbed に積算される", () => {
  const g = makeGrid(512, 40);
  const s = createSolver(g);
  s.m = 1;
  s.setPacket("+", 30, 5, 1.5);   // 右端へ向かう
  s.absorbWidth = 6;
  for (let i = 0; i < 6000; i++) s.step(0.002);
  const n1 = measure(s.state, s.fields, s.m, g).norm;
  assert(n1 < 0.5, `ノルムが ${n1} までしか減っていない（吸収されていない）`);
  assertClose(s.absorbed + n1, 1, 1e-6, "吸収量とノルムの和");
});

test("setField: step 形状が正しく設定される", () => {
  const g = makeGrid(128, 40);
  const s = createSolver(g);
  s.setField("V", "step", { height: 3 });
  assertClose(s.fields.V[0], 0, 1e-15, "左端");
  assertClose(s.fields.V[g.N - 1], 3, 1e-15, "右端");
  assertClose(s.fields.S[g.N - 1], 0, 1e-15, "S は触らない");
});
```

`tests/klein.test.js`（検証項目 8）:

```js
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
 * k0 を 2 に上げて群速度（≈ 0.97）を稼ぎ、内部が空になるまでのステップ数を抑える。
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
```

`tests.html` に `import "./tests/klein.test.js";` を追加する。

- [ ] **Step 2: テストが失敗することを確認する**

Expected: `setField` が未定義でエラー。

- [ ] **Step 3: 実装する**

`src/dirac.js` の `createSolver` 内に追加:

```js
  let maskCache = null;
  let maskCacheWidth = -1;

  /** 幅 W の cos² テーパーによる吸収マスク。W=0 なら null を返す。 */
  function getMask(W) {
    if (W <= 0) return null;
    if (maskCacheWidth === W) return maskCache;
    const mask = new Float64Array(N);
    for (let j = 0; j < N; j++) {
      const d = Math.min(grid.x[j], grid.L - grid.x[j]);
      if (d >= W) {
        mask[j] = 1;
      } else {
        const c = Math.cos((Math.PI / 2) * (W - d) / W);
        mask[j] = c * c;
      }
    }
    maskCache = mask;
    maskCacheWidth = W;
    return mask;
  }

  /**
   * 吸収マスクを適用し、減ったノルムを積算する。
   * 左半分（x < L/2）で消えた分は solver.absorbedLeft、右半分は solver.absorbedRight、
   * 合計は solver.absorbed に入れる。左右を分けておくと、波束が両端の吸収層に
   * 完全に吸われたあと「右へ抜けた確率＝透過」「左へ戻った確率＝反射」を
   * 曖昧さなく読める（Klein の検証で使う）。
   */
  function applyAbsorber() {
    const mask = getMask(solver.absorbWidth);
    if (!mask) return;
    const { re1, im1, re2, im2 } = state;
    const mid = grid.L / 2;
    let lostL = 0, lostR = 0;
    for (let j = 0; j < N; j++) {
      const before = re1[j] ** 2 + im1[j] ** 2 + re2[j] ** 2 + im2[j] ** 2;
      const g = mask[j];
      re1[j] *= g; im1[j] *= g; re2[j] *= g; im2[j] *= g;
      const after = re1[j] ** 2 + im1[j] ** 2 + re2[j] ** 2 + im2[j] ** 2;
      if (grid.x[j] < mid) lostL += before - after;
      else lostR += before - after;
    }
    solver.absorbedLeft += lostL * grid.h;
    solver.absorbedRight += lostR * grid.h;
    solver.absorbed += (lostL + lostR) * grid.h;
  }

  /**
   * 外場を形状プリセットで設定する。指定した側だけを書き換える。
   * @param {"V"|"S"} which
   * @param {"none"|"step"|"barrier"|"well"} shape
   * @param {{height?:number, width?:number}} params
   */
  function setField(which, shape, params) {
    const arr = which === "V" ? fields.V : which === "S" ? fields.S : null;
    if (!arr) throw new Error(`未知の場: ${which}`);
    const height = params && params.height !== undefined ? params.height : 3;
    const width = params && params.width !== undefined ? params.width : 4;
    const xc = grid.L / 2;

    for (let j = 0; j < N; j++) {
      const x = grid.x[j];
      let v = 0;
      if (shape === "none") {
        v = 0;
      } else if (shape === "step") {
        v = x >= xc ? height : 0;
      } else if (shape === "barrier") {
        v = (x >= xc && x < xc + width) ? height : 0;
      } else if (shape === "well") {
        v = (x >= xc - width / 2 && x < xc + width / 2) ? -height : 0;
      } else {
        throw new Error(`未知の形状: ${shape}`);
      }
      arr[j] = v;
    }
  }
```

`step` を差し替える:

```js
  function step(dt) {
    potentialStep(dt / 2);
    kineticStep(dt);
    potentialStep(dt / 2);
    applyAbsorber();
    solver.t += dt;
  }
```

`solver` オブジェクトのリテラルに追加:

```js
    absorbWidth: 0,
    absorbed: 0,
    absorbedLeft: 0,
    absorbedRight: 0,
    setField,
```

- [ ] **Step 4: テストが通ることを確認する**

Expected: 「41 件成功 / 0 件失敗」（35 + `dirac.test.js` に 3 + `klein.test.js` に 3）

Klein のテストは重い（各 transmission() が最大 32000 ステップ × N=512、`transmission()` を計 4 回呼ぶ）。
スイート全体で 2〜4 分かかることがある。ステップ数を減らして速くしてはならない
（内部が空になる前に測ると `T + R ≈ 1` が壊れる。cos² 吸収層の back-reflection が
2 周目で吸われる t60 付近まで見ないと内部に ~1.5% 残る）。S 段差は早く空になるので早期 break で短く済む。

- [ ] **Step 5: コミット**

```bash
cd /d D:\claude_code\dirac_eq
git add 1d_dirac_eq_viewer/src/dirac.js 1d_dirac_eq_viewer/tests/dirac.test.js 1d_dirac_eq_viewer/tests/klein.test.js 1d_dirac_eq_viewer/tests.html
git commit -m "feat: add field presets and absorbing mask, verify Klein vs scalar contrast

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: 実空間キャンバスの描画

**Files:**
- Create: `src/render.js`

**Interfaces:**
- Consumes: なし（純粋に数値を受け取って描く。物理を知らない）
- Produces:
  - `render.js`: `createRealRenderer(canvas)` → `{ draw(opts) }`
  - `draw(opts)` の `opts`: `{ grid, state, density, current, fields, yscale, absorbWidth, show }`
  - `show`: `{ rho, comp, reim, current, fields }`（すべて boolean）

**色の規約**（`index.html` の CSS 変数と対応させる。Task 11 で定義する）:

| 量 | CSS 変数 |
|---|---|
| `ρ` | `--rho` |
| `\|ψ₁\|` | `--psi1` |
| `\|ψ₂\|` | `--psi2` |
| `Re ψ₁` / `Im ψ₁` | `--psi1` / `--psi1-alt` |
| `Re ψ₂` / `Im ψ₂` | `--psi2` / `--psi2-alt` |
| `j` | `--current` |
| `V` | `--pot-v` |
| `S` | `--pot-s` |

- [ ] **Step 1: 実装する**

`src/render.js`:

```js
// Canvas 2D への描画。物理を知らず、渡された数値をそのまま描く。

const MARGIN = { left: 40, right: 14, top: 14, bottom: 26 };

function cssVar(name) {
  return getComputedStyle(document.body).getPropertyValue(name).trim();
}

export function createRealRenderer(canvas) {
  const ctx = canvas.getContext("2d");

  function draw(opts) {
    const { grid, state, density, current, fields, yscale, absorbWidth, show } = opts;
    const CW = canvas.width, CH = canvas.height;
    const plotW = CW - MARGIN.left - MARGIN.right;
    const plotH = CH - MARGIN.top - MARGIN.bottom;

    const xToPx = (x) => MARGIN.left + (x / grid.L) * plotW;
    const yToPx = (y) => MARGIN.top + plotH / 2 - (y / yscale) * (plotH / 2);

    ctx.clearRect(0, 0, CW, CH);

    // 吸収層の領域を淡く塗る（端で消えるのが物理でないことを示すため）
    if (absorbWidth > 0) {
      ctx.fillStyle = cssVar("--absorb-bg");
      const w = (absorbWidth / grid.L) * plotW;
      ctx.fillRect(MARGIN.left, MARGIN.top, w, plotH);
      ctx.fillRect(MARGIN.left + plotW - w, MARGIN.top, w, plotH);
    }

    // 軸
    ctx.strokeStyle = cssVar("--border");
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(MARGIN.left, yToPx(0));
    ctx.lineTo(CW - MARGIN.right, yToPx(0));
    ctx.moveTo(MARGIN.left, MARGIN.top);
    ctx.lineTo(MARGIN.left, CH - MARGIN.bottom);
    ctx.stroke();

    ctx.fillStyle = cssVar("--text-muted");
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    for (let i = 0; i <= 4; i++) {
      const x = (grid.L * i) / 4;
      ctx.fillText(x.toFixed(0), xToPx(x), CH - 8);
    }
    ctx.textAlign = "right";
    ctx.fillText(yscale.toFixed(2), MARGIN.left - 4, yToPx(yscale) + 4);
    ctx.fillText((-yscale).toFixed(2), MARGIN.left - 4, yToPx(-yscale) + 4);

    function curve(values, color, dash) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      if (dash) ctx.setLineDash(dash);
      ctx.beginPath();
      for (let j = 0; j < grid.N; j++) {
        const px = xToPx(grid.x[j]), py = yToPx(values[j]);
        if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.restore();
    }

    if (show.fields) {
      curve(fields.V, cssVar("--pot-v"), [3, 3]);
      curve(fields.S, cssVar("--pot-s"), [7, 4]);
    }
    if (show.rho) curve(density, cssVar("--rho"));
    if (show.comp) {
      const a1 = new Float64Array(grid.N), a2 = new Float64Array(grid.N);
      for (let j = 0; j < grid.N; j++) {
        a1[j] = Math.hypot(state.re1[j], state.im1[j]);
        a2[j] = Math.hypot(state.re2[j], state.im2[j]);
      }
      curve(a1, cssVar("--psi1"));
      curve(a2, cssVar("--psi2"));
    }
    if (show.reim) {
      curve(state.re1, cssVar("--psi1"));
      curve(state.im1, cssVar("--psi1-alt"), [4, 3]);
      curve(state.re2, cssVar("--psi2"));
      curve(state.im2, cssVar("--psi2-alt"), [4, 3]);
    }
    if (show.current) curve(current, cssVar("--current"));
  }

  return { draw };
}
```

- [ ] **Step 2: 目視で確認する**

一時的な確認用ページを作って描画を見る。`scratch-render.html`（コミットしない）:

```html
<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8">
<style>body{--border:#ccc;--text-muted:#666;--rho:#0f6e56;--psi1:#185fa5;--psi2:#993c1d;
--psi1-alt:#85b7eb;--psi2-alt:#f0997b;--current:#3c3489;--pot-v:#5f5e5a;--pot-s:#8a6d1f;
--absorb-bg:#00000010;}</style></head><body>
<canvas id="c" width="880" height="340" style="background:#fff"></canvas>
<script type="module">
import { makeGrid, createSolver } from "./src/dirac.js";
import { createRealRenderer } from "./src/render.js";
import { density, current } from "./src/observables.js";
const g = makeGrid(512, 40);
const s = createSolver(g);
s.m = 1; s.absorbWidth = 5;
s.setPacket("mix", 15, 3, 2);
s.setField("V", "step", { height: 0.5 });
const r = createRealRenderer(document.getElementById("c"));
r.draw({ grid: g, state: s.state, density: density(s.state), current: current(s.state),
  fields: s.fields, yscale: 0.5, absorbWidth: s.absorbWidth,
  show: { rho: true, comp: true, reim: false, current: true, fields: true } });
</script></body></html>
```

`http://localhost:8123/scratch-render.html` を開く。

Expected: 波束の密度・成分・カレントの曲線と、`x=20` の段差、両端の淡い吸収層の帯が見える。
確認したらこのファイルを削除する。

- [ ] **Step 3: コミット**

```bash
cd /d D:\claude_code\dirac_eq
rm -f 1d_dirac_eq_viewer/scratch-render.html
git add 1d_dirac_eq_viewer/src/render.js
git commit -m "feat: add real-space canvas renderer

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: 運動量キャンバスの描画

**Files:**
- Modify: `src/render.js`

**Interfaces:**
- Consumes: なし
- Produces: `render.js`: `createMomentumRenderer(canvas)` → `{ draw(opts) }`
  - `opts`: `{ grid, m, wPlus, wMinus, kMax }`

**描くもの**（設計書 §5.3）:

1. 分散関係の 2 本の分枝 `E = ±√(k² + m²)`（実線）
2. 光速の漸近線 `E = ±k`（点線）
3. 各分枝の曲線上に重み `w±(k)` を線幅として乗せる

線幅は `1 + 8·(w/wMax)` とする（`wMax` は両分枝を通じた最大値）。
`wMax = 0` のときは重みを描かず曲線だけ描く。

- [ ] **Step 1: 実装する**

`src/render.js` の末尾に追記:

```js
export function createMomentumRenderer(canvas) {
  const ctx = canvas.getContext("2d");

  function draw(opts) {
    const { grid, m, wPlus, wMinus, kMax } = opts;
    const CW = canvas.width, CH = canvas.height;
    const plotW = CW - MARGIN.left - MARGIN.right;
    const plotH = CH - MARGIN.top - MARGIN.bottom;

    const eMax = Math.hypot(kMax, m) * 1.1;
    const kToPx = (k) => MARGIN.left + ((k + kMax) / (2 * kMax)) * plotW;
    const eToPx = (E) => MARGIN.top + plotH / 2 - (E / eMax) * (plotH / 2);

    ctx.clearRect(0, 0, CW, CH);

    // 軸
    ctx.strokeStyle = cssVar("--border");
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(MARGIN.left, eToPx(0));
    ctx.lineTo(CW - MARGIN.right, eToPx(0));
    ctx.moveTo(kToPx(0), MARGIN.top);
    ctx.lineTo(kToPx(0), CH - MARGIN.bottom);
    ctx.stroke();

    ctx.fillStyle = cssVar("--text-muted");
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`k = ${(-kMax).toFixed(0)}`, kToPx(-kMax) + 22, CH - 8);
    ctx.fillText(`k = ${kMax.toFixed(0)}`, kToPx(kMax) - 22, CH - 8);
    ctx.textAlign = "right";
    ctx.fillText(`E = ${eMax.toFixed(1)}`, MARGIN.left - 4, eToPx(eMax) + 10);

    // 光速の漸近線 E = ±k（点線）
    ctx.save();
    ctx.strokeStyle = cssVar("--text-muted");
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(kToPx(-kMax), eToPx(-kMax));
    ctx.lineTo(kToPx(kMax), eToPx(kMax));
    ctx.moveTo(kToPx(-kMax), eToPx(kMax));
    ctx.lineTo(kToPx(kMax), eToPx(-kMax));
    ctx.stroke();
    ctx.restore();

    // 分散関係の曲線（k 昇順に並べ直して描く。grid.k は FFT 順なので）
    const order = Array.from({ length: grid.N }, (_, n) => n)
      .sort((a, b) => grid.k[a] - grid.k[b]);

    let wMax = 0;
    for (let n = 0; n < grid.N; n++) {
      wMax = Math.max(wMax, wPlus[n], wMinus[n]);
    }

    for (const sign of [+1, -1]) {
      const w = sign > 0 ? wPlus : wMinus;
      const color = cssVar(sign > 0 ? "--branch-plus" : "--branch-minus");

      // 細い基準線（重みが 0 でも分散関係は見えるようにする）
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < order.length; i++) {
        const k = grid.k[order[i]];
        const px = kToPx(k), py = eToPx(sign * Math.hypot(k, m));
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      // 重みを線幅として区間ごとに描く
      if (wMax > 0) {
        for (let i = 0; i + 1 < order.length; i++) {
          const n0 = order[i], n1 = order[i + 1];
          const ww = (w[n0] + w[n1]) / 2 / wMax;
          if (ww < 1e-4) continue;
          ctx.strokeStyle = color;
          ctx.lineWidth = 1 + 8 * ww;
          ctx.beginPath();
          ctx.moveTo(kToPx(grid.k[n0]), eToPx(sign * Math.hypot(grid.k[n0], m)));
          ctx.lineTo(kToPx(grid.k[n1]), eToPx(sign * Math.hypot(grid.k[n1], m)));
          ctx.stroke();
        }
      }
    }

    // 質量ギャップの表示
    ctx.fillStyle = cssVar("--text-muted");
    ctx.textAlign = "left";
    ctx.fillText(`質量ギャップ 2m = ${(2 * m).toFixed(2)}`, MARGIN.left + 6, MARGIN.top + 12);
  }

  return { draw };
}
```

- [ ] **Step 2: 目視で確認する**

`scratch-momentum.html`（コミットしない）:

```html
<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8">
<style>body{--border:#ccc;--text-muted:#666;--branch-plus:#185fa5;--branch-minus:#993c1d;}</style>
</head><body>
<canvas id="c" width="880" height="300" style="background:#fff"></canvas><br>
<label>m <input id="m" type="range" min="0" max="3" step="0.1" value="1"></label>
<script type="module">
import { makeGrid, createSolver } from "./src/dirac.js";
import { createMomentumRenderer } from "./src/render.js";
import { spectrum, branchWeights } from "./src/observables.js";
const g = makeGrid(512, 40);
const r = createMomentumRenderer(document.getElementById("c"));
function go() {
  const s = createSolver(g);
  s.m = parseFloat(document.getElementById("m").value);
  s.setPacket("mix", 20, 4, 2);
  const w = branchWeights(spectrum(s.state, g), g, s.m);
  r.draw({ grid: g, m: s.m, wPlus: w.wPlus, wMinus: w.wMinus, kMax: 20 });
}
document.getElementById("m").addEventListener("input", go);
go();
</script></body></html>
```

Expected: 2 本の双曲線と光速の漸近線が見え、`k = ±4` 付近に太い帯が乗る。
`m` スライダーを 0 に落とすと 2 本が漸近線に重なって直線になる。確認したら削除する。

- [ ] **Step 3: コミット**

```bash
cd /d D:\claude_code\dirac_eq
rm -f 1d_dirac_eq_viewer/scratch-momentum.html
git add 1d_dirac_eq_viewer/src/render.js
git commit -m "feat: add momentum-space renderer with dispersion curves and branch weights

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: UI マークアップと DOM 配線

**Files:**
- Create: `index.html`
- Create: `src/ui.js`

**Interfaces:**
- Consumes: なし
- Produces:
  - `ui.js`: `bindUI(handlers)` → `{ els, getState(), setRunning(bool), setStats(obj), setHint(text) }`
  - `handlers`: `{ onStart, onStop, onReset, onSmooth, onProject(sign), onNormalize, onPacketPreset(branch), onFieldPreset(which, shape), onDrawStart(x,y), onDrawMove(x,y), onDrawEnd }`
  - `getState()` → `{ m, speed, yscale, absorbWidth, x0, k0, sigma, drawTarget, show }`

`drawTarget` は `"V"` / `"S"` / `"re1"` / `"im1"` / `"re2"` / `"im2"` のいずれか。

- [ ] **Step 1: index.html を書く**

`index.html`:

```html
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>1+1次元ディラック方程式 リアルタイム可視化</title>
<style>
  :root {
    --bg: #f5f4f0; --surface: #ffffff; --surface-2: #f1efe8;
    --border: #d3d1c7; --text: #2c2c2a; --text-muted: #5f5e5a;
    --rho: #0f6e56; --psi1: #185fa5; --psi2: #993c1d;
    --psi1-alt: #6fa3d8; --psi2-alt: #cc8060;
    --current: #3c3489; --pot-v: #5f5e5a; --pot-s: #8a6d1f;
    --branch-plus: #185fa5; --branch-minus: #993c1d;
    --absorb-bg: rgba(0,0,0,0.06);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #1c1c1a; --surface: #262624; --surface-2: #2c2c2a;
      --border: #444441; --text: #ece9e2; --text-muted: #b4b2a9;
      --rho: #5dcaa5; --psi1: #85b7eb; --psi2: #f0997b;
      --psi1-alt: #4d7fae; --psi2-alt: #b06f52;
      --current: #afa9ec; --pot-v: #b4b2a9; --pot-s: #d8bb60;
      --branch-plus: #85b7eb; --branch-minus: #f0997b;
      --absorb-bg: rgba(255,255,255,0.07);
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 20px; background: var(--bg); color: var(--text);
    font-family: "Segoe UI", "Hiragino Sans", "Yu Gothic", sans-serif; }
  h1 { font-size: 18px; font-weight: 500; margin: 0 0 4px; }
  p.sub { font-size: 13px; color: var(--text-muted); margin: 0 0 16px; }
  .panel { max-width: 940px; margin: 0 auto; display: flex; flex-direction: column; gap: 12px; }
  .row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
  .checks { display: flex; gap: 6px; flex-wrap: wrap; }
  .chk { display: flex; align-items: center; gap: 5px; font-size: 13px;
    border: 0.5px solid var(--border); border-radius: 6px; padding: 5px 10px;
    background: var(--surface); user-select: none; }
  .stats { display: flex; gap: 6px; flex-wrap: wrap; }
  .stat { background: var(--surface-2); border-radius: 6px; padding: 5px 10px;
    text-align: right; min-width: 84px; }
  .stat .label { font-size: 10px; color: var(--text-muted); }
  .stat .value { font-size: 13px; font-weight: 600; }
  .plotwrap { display: flex; gap: 8px; background: var(--surface);
    border: 0.5px solid var(--border); border-radius: 8px; padding: 10px; }
  .yslider-col { display: flex; flex-direction: column; align-items: center; gap: 4px; padding-top: 4px; }
  .yslider-col label { font-size: 11px; color: var(--text-muted); writing-mode: vertical-rl; }
  .yslider-col input[type=range] { writing-mode: vertical-lr; direction: rtl; width: 18px; height: 220px; }
  canvas { width: 100%; background: var(--surface-2); border-radius: 6px; touch-action: none; }
  #plot { height: 320px; cursor: crosshair; }
  #kplot { height: 260px; }
  .sliders { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; }
  .slider-block .row2 { display: flex; justify-content: space-between; font-size: 12px;
    color: var(--text-muted); margin-bottom: 2px; }
  .slider-block input[type=range] { width: 100%; }
  .buttons { display: flex; gap: 8px; flex-wrap: wrap; }
  button { flex: 1; min-width: 110px; padding: 8px 10px; font-size: 13px;
    border: 0.5px solid var(--border); border-radius: 6px;
    background: var(--surface); color: var(--text); cursor: pointer; }
  button:hover:not(:disabled) { background: var(--surface-2); }
  button:disabled { opacity: 0.45; cursor: default; }
  .hint { font-size: 12px; color: var(--text-muted); margin: -4px 0 0; }
  .group-label { font-size: 11px; color: var(--text-muted); margin-right: 4px; align-self: center; }
</style>
</head>
<body>
<div class="panel">
  <div>
    <h1>1+1次元ディラック方程式 リアルタイム可視化</h1>
    <p class="sub">
      i ∂ψ/∂t = [ -i α ∂/∂x + β(m + S(x)) + V(x) ] ψ ，
      Weyl 表現 α=σ_z, β=σ_x ，ħ=c=1 ，長さの単位は換算コンプトン波長 ƛ_C（λ_C = 2π ƛ_C）
    </p>
  </div>

  <div class="row">
    <div class="checks">
      <span class="group-label">表示</span>
      <label class="chk"><input type="checkbox" id="showRho" checked><span style="color:var(--rho)">ρ</span></label>
      <label class="chk"><input type="checkbox" id="showComp">|ψ₁|,|ψ₂|</label>
      <label class="chk"><input type="checkbox" id="showReim">Re,Im</label>
      <label class="chk"><input type="checkbox" id="showCurrent"><span style="color:var(--current)">j</span></label>
      <label class="chk"><input type="checkbox" id="showFields" checked>V, S</label>
    </div>
    <div class="stats">
      <div class="stat"><div class="label">t</div><div class="value" id="statT">0.00</div></div>
      <div class="stat"><div class="label">ノルム</div><div class="value" id="statNorm">0.0000</div></div>
      <div class="stat"><div class="label">吸収済み</div><div class="value" id="statAbs">0.0000</div></div>
      <div class="stat"><div class="label">⟨x⟩</div><div class="value" id="statX">0.00</div></div>
      <div class="stat"><div class="label">⟨v⟩ (|v|≤1)</div><div class="value" id="statV">0.000</div></div>
      <div class="stat"><div class="label">⟨H⟩</div><div class="value" id="statE">0.000</div></div>
      <div class="stat"><div class="label">w₊ : w₋ ※自由基底</div><div class="value" id="statW">— : —</div></div>
    </div>
  </div>

  <div class="plotwrap">
    <div class="yslider-col">
      <label>Y軸範囲</label>
      <input type="range" id="yscale" min="0.05" max="4" step="0.05" value="0.6">
    </div>
    <canvas id="plot" width="880" height="320"></canvas>
  </div>
  <p class="hint" id="hint">停止中: グラフをドラッグすると「描画対象」で選んだ量を直接描けます。</p>

  <div class="plotwrap">
    <canvas id="kplot" width="880" height="260"></canvas>
  </div>
  <p class="hint">
    運動量空間: 実線が分散関係 E = ±√(k²+m²)、点線が光速の漸近線 E = ±k、線の太さが各分枝の重み。
    重みは<strong>自由基底での射影</strong>であり、V や S が非ゼロのときは保存量でも粒子／反粒子分解でもありません。
  </p>

  <div class="sliders">
    <div class="slider-block">
      <div class="row2"><span>質量 m（実行中も変更可）</span><span id="mOut">1.00</span></div>
      <input type="range" id="m" min="0" max="3" step="0.01" value="1">
    </div>
    <div class="slider-block">
      <div class="row2"><span>時間発展の速度</span><span id="speedOut">8</span></div>
      <input type="range" id="speed" min="1" max="20" step="1" value="8">
    </div>
    <div class="slider-block">
      <div class="row2"><span>吸収層の幅 W（0 で吸収オフ）</span><span id="absOut">5.0</span></div>
      <input type="range" id="absorb" min="0" max="10" step="0.5" value="5">
    </div>
    <div class="slider-block">
      <div class="row2"><span>波束の中心 x₀</span><span id="x0Out">10.0</span></div>
      <input type="range" id="x0" min="0" max="40" step="0.5" value="10">
    </div>
    <div class="slider-block">
      <div class="row2"><span>波束の運動量 k₀</span><span id="k0Out">2.0</span></div>
      <input type="range" id="k0" min="-20" max="20" step="0.5" value="2">
    </div>
    <div class="slider-block">
      <div class="row2"><span>波束の幅 σ</span><span id="sigOut">2.0</span></div>
      <input type="range" id="sigma" min="0.3" max="5" step="0.1" value="2">
    </div>
  </div>

  <div class="buttons">
    <button id="btnStart">▶ 開始</button>
    <button id="btnStop" disabled>■ 停止</button>
    <button id="btnReset">↺ リセット</button>
  </div>

  <div class="row">
    <div class="checks">
      <span class="group-label">描画対象</span>
      <label class="chk"><input type="radio" name="dt" value="V" checked>V(x)</label>
      <label class="chk"><input type="radio" name="dt" value="S">S(x)</label>
      <label class="chk"><input type="radio" name="dt" value="re1">Re ψ₁</label>
      <label class="chk"><input type="radio" name="dt" value="im1">Im ψ₁</label>
      <label class="chk"><input type="radio" name="dt" value="re2">Re ψ₂</label>
      <label class="chk"><input type="radio" name="dt" value="im2">Im ψ₂</label>
    </div>
  </div>

  <div class="buttons">
    <button id="btnSmooth">平滑化</button>
    <button id="btnProjPlus">正分枝へ射影</button>
    <button id="btnProjMinus">負分枝へ射影</button>
    <button id="btnNormalize">規格化</button>
  </div>

  <div class="buttons">
    <button id="btnPkPlus">初期状態: 正分枝のみ</button>
    <button id="btnPkMinus">初期状態: 負分枝のみ</button>
    <button id="btnPkMix">初期状態: 50:50 混合</button>
    <button id="btnPkNaive">初期状態: 素朴な固定スピノル</button>
  </div>

  <div class="buttons">
    <button id="btnFldNone">外場: なし</button>
    <button id="btnFldVStep">外場: 階段 V</button>
    <button id="btnFldVBar">外場: 障壁 V</button>
    <button id="btnFldSStep">外場: 階段 S</button>
    <button id="btnFldSWell">外場: スカラー井戸 S</button>
  </div>
</div>

<script type="module" src="./src/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: ui.js を書く**

`src/ui.js`:

```js
// DOM イベントを意味のある操作に変換する層。物理も描画も知らない。
// 座標マッピングに使うプロットのマージンは render.js が唯一の定義元
// （REAL_MARGIN）。ここで再定義せず import して、レンダラと必ず一致させる。
import { REAL_MARGIN } from "./render.js";

export function bindUI(handlers) {
  const $ = (id) => document.getElementById(id);

  const els = {
    plot: $("plot"), kplot: $("kplot"), hint: $("hint"),
    btnStart: $("btnStart"), btnStop: $("btnStop"),
    editButtons: [
      $("btnSmooth"), $("btnProjPlus"), $("btnProjMinus"), $("btnNormalize"),
      $("btnPkPlus"), $("btnPkMinus"), $("btnPkMix"), $("btnPkNaive"),
      $("btnFldNone"), $("btnFldVStep"), $("btnFldVBar"), $("btnFldSStep"), $("btnFldSWell"),
    ],
  };

  // --- スライダー: 値の表示を同期する ---
  const sliders = [
    ["m", "mOut", 2], ["speed", "speedOut", 0], ["absorb", "absOut", 1],
    ["x0", "x0Out", 1], ["k0", "k0Out", 1], ["sigma", "sigOut", 1],
  ];
  for (const [id, outId, digits] of sliders) {
    const el = $(id), out = $(outId);
    const sync = () => { out.textContent = parseFloat(el.value).toFixed(digits); };
    el.addEventListener("input", sync);
    sync();
  }

  function getState() {
    return {
      m: parseFloat($("m").value),
      speed: parseFloat($("speed").value),
      yscale: parseFloat($("yscale").value),
      absorbWidth: parseFloat($("absorb").value),
      x0: parseFloat($("x0").value),
      k0: parseFloat($("k0").value),
      sigma: parseFloat($("sigma").value),
      drawTarget: document.querySelector('input[name="dt"]:checked').value,
      show: {
        rho: $("showRho").checked,
        comp: $("showComp").checked,
        reim: $("showReim").checked,
        current: $("showCurrent").checked,
        fields: $("showFields").checked,
      },
    };
  }

  function setRunning(running) {
    els.btnStart.disabled = running;
    els.btnStop.disabled = !running;
    for (const b of els.editButtons) b.disabled = running;
    els.hint.textContent = running
      ? "実行中: 編集はできません。質量 m スライダーは変更できます。"
      : "停止中: グラフをドラッグすると「描画対象」で選んだ量を直接描けます。";
  }

  function setHint(text) { els.hint.textContent = text; }

  function setStats(o) {
    $("statT").textContent = o.t.toFixed(2);
    $("statNorm").textContent = o.norm.toFixed(4);
    $("statAbs").textContent = o.absorbed.toFixed(4);
    $("statX").textContent = o.xMean.toFixed(2);
    $("statV").textContent = o.vMean.toFixed(3);
    $("statE").textContent = o.energy.toFixed(3);
    const tot = o.wPlusTotal + o.wMinusTotal;
    $("statW").textContent = tot > 1e-300
      ? `${(o.wPlusTotal / tot * 100).toFixed(1)}% : ${(o.wMinusTotal / tot * 100).toFixed(1)}%`
      : "— : —";
  }

  // --- ボタン ---
  els.btnStart.addEventListener("click", handlers.onStart);
  els.btnStop.addEventListener("click", handlers.onStop);
  $("btnReset").addEventListener("click", handlers.onReset);
  $("btnSmooth").addEventListener("click", handlers.onSmooth);
  $("btnProjPlus").addEventListener("click", () => handlers.onProject(+1));
  $("btnProjMinus").addEventListener("click", () => handlers.onProject(-1));
  $("btnNormalize").addEventListener("click", handlers.onNormalize);

  $("btnPkPlus").addEventListener("click", () => handlers.onPacketPreset("+"));
  $("btnPkMinus").addEventListener("click", () => handlers.onPacketPreset("-"));
  $("btnPkMix").addEventListener("click", () => handlers.onPacketPreset("mix"));
  $("btnPkNaive").addEventListener("click", () => handlers.onPacketPreset("naive"));

  $("btnFldNone").addEventListener("click", () => handlers.onFieldPreset("V", "none"));
  $("btnFldVStep").addEventListener("click", () => handlers.onFieldPreset("V", "step"));
  $("btnFldVBar").addEventListener("click", () => handlers.onFieldPreset("V", "barrier"));
  $("btnFldSStep").addEventListener("click", () => handlers.onFieldPreset("S", "step"));
  $("btnFldSWell").addEventListener("click", () => handlers.onFieldPreset("S", "well"));

  // --- キャンバスのドラッグ描画 ---
  // 座標系はレンダラ (createRealRenderer) と同じ REAL_MARGIN を使う。
  function canvasPoint(evt) {
    const rect = els.plot.getBoundingClientRect();
    const cx = (evt.clientX - rect.left) * (els.plot.width / rect.width);
    const cy = (evt.clientY - rect.top) * (els.plot.height / rect.height);
    const plotW = els.plot.width - REAL_MARGIN.left - REAL_MARGIN.right;
    const plotH = els.plot.height - REAL_MARGIN.top - REAL_MARGIN.bottom;
    const fx = Math.min(1, Math.max(0, (cx - REAL_MARGIN.left) / plotW));
    const yscale = parseFloat($("yscale").value);
    const y = -((cy - REAL_MARGIN.top - plotH / 2) / (plotH / 2)) * yscale;
    return { fx, y };
  }

  let dragging = false;
  els.plot.addEventListener("mousedown", (e) => {
    if (els.btnStart.disabled) return;   // 実行中は描画不可
    dragging = true;
    const p = canvasPoint(e);
    handlers.onDrawStart(p.fx, p.y);
  });
  els.plot.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const p = canvasPoint(e);
    handlers.onDrawMove(p.fx, p.y);
  });
  window.addEventListener("mouseup", () => {
    if (dragging) { dragging = false; handlers.onDrawEnd(); }
  });

  // マウスホイールで Y 軸範囲を調整する
  els.plot.addEventListener("wheel", (e) => {
    e.preventDefault();
    const el = $("yscale");
    const step = parseFloat(el.step);
    const next = parseFloat(el.value) - Math.sign(e.deltaY) * step * 2;
    el.value = Math.min(parseFloat(el.max), Math.max(parseFloat(el.min), next));
  }, { passive: false });

  return { els, getState, setRunning, setStats, setHint };
}
```

- [ ] **Step 3: コミット**

```bash
cd /d D:\claude_code\dirac_eq
git add 1d_dirac_eq_viewer/index.html 1d_dirac_eq_viewer/src/ui.js
git commit -m "feat: add UI markup and DOM wiring layer

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: 組み立て・メインループ・README

**Files:**
- Create: `src/main.js`
- Create: `README.md`

**Interfaces:**
- Consumes: すべてのモジュール
- Produces: 動作するアプリケーション

**メインループの要件**（設計書 §6.1）:

フレームレートに依存せず物理時間の進み方を一定にするため、`performance.now()` の経過時間で
副ステップ数を積算する。1 フレームあたりの副ステップ数に上限（400）を設け、
タブが非アクティブだった場合の暴走を防ぐ。1 フレームの実時間は 0.1 秒で頭打ちにする。

- [ ] **Step 1: main.js を書く**

`src/main.js`:

```js
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
  } else {
    solver.setField(which, shape, { height: 3, width: 4 });
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
    // 縮んで見えない。物理が見える範囲に絞る（波束の k₀ 最大 20 の半分程度）。
    kMax: MOMENTUM_KMAX,
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
```

- [ ] **Step 2: ブラウザで動作を確認する**

`http://localhost:8123/index.html` を開き、次を目視で確認する。

1. 起動直後に波束が表示され、運動量パネルに 2 本の分散曲線と重みの帯が出る
2. 「開始」で波束が動き、ノルムが 1.0000 のまま（吸収層に届くまで）
3. 質量 `m` スライダーを実行中に動かすと、運動量パネルのギャップが開閉する
4. `m = 0` にすると 2 本の分枝が漸近線に重なり直線になる
5. 「停止」してから「描画対象: V(x)」でグラフをドラッグすると `V` が描ける
6. 「平滑化」を押すとギザギザが鈍る
7. 「描画対象: Re ψ₁」にして描き、「正分枝へ射影」を押すとヒント行に落ちた重みが出る
8. 「外場: 階段 V」→「初期状態: 正分枝のみ」→「開始」で Klein 透過が見える
9. 「外場: 階段 S」で同じことをすると反射する

- [ ] **Step 3: README を書く**

`README.md`:

```markdown
# 1+1次元ディラック方程式 リアルタイムビューア

ブラウザ上で 1+1次元ディラック方程式の時間発展を可視化・操作するツール。

## 起動

ES モジュールを使っているため `file://` では動かない（CORS で拒否される）。
ローカルサーバ経由で開く。

    conda activate myenv311
    cd D:\claude_code\dirac_eq\1d_dirac_eq_viewer
    python -m http.server 8123

ブラウザで `http://localhost:8123/index.html` を開く。
検証スイートは `http://localhost:8123/tests.html`。

## 対象方程式

    i ∂ψ/∂t = [ -i c α ∂/∂x + β(mc² + S(x)) + V(x) ] ψ,   ψ = (ψ₁, ψ₂)ᵀ

Weyl 表現 `α = σ_z`, `β = σ_x` を使う。この表現では運動項が成分について対角になり、
外場と質量がゼロなら `ψ₁` が右進行、`ψ₂` が左進行に完全分離する。
確率密度とカレントは

    ρ = |ψ₁|² + |ψ₂|²
    j = c(|ψ₁|² - |ψ₂|²)

となり、`|j| ≤ cρ` が式の形から直接読める。

単位系は `ħ = c = 1`。長さの単位は `m = 1` のときの**換算**コンプトン波長 `ƛ_C = ħ/(mc)`。
コンプトン波長 `λ_C = h/(mc) = 2π ƛ_C` とは 2π 違うことに注意。

## 数値解法

Strang 分割。運動ステップは FFT で `k` 空間に移して成分ごとの位相回転（厳密）、
ポテンシャル・質量ステップは実空間で 2×2 行列の閉形式指数（厳密）。
誤差源は分割のみで大域的に `O(Δt²)`。CFL 制限はない。

吸収層を切る（W = 0）と時間発展は厳密にユニタリになり、ノルムが機械精度で保存する。

## 見どころ

| やること | 見えるもの |
|---|---|
| 「初期状態: 正分枝のみ」で開始 | 波束が素直に進む。Zitterbewegung は出ない |
| 「初期状態: 負分枝のみ」で開始 | 運動量と**逆向き**に進む |
| 「初期状態: 50:50 混合」で開始 | Zitterbewegung（振動数 2E）が出る |
| 「初期状態: 素朴な固定スピノル」で開始 | 分枝を考えずに片方の成分に置いただけで、勝手に分枝が混ざり振動する |
| 質量 m を上げる | Zitterbewegung が速くなり振幅が縮む。運動量パネルのギャップ 2m が開く |
| 質量 m を 0 にする | 2 本の分枝が光速の漸近線に重なる。左右が完全分離し Zitterbewegung が消える |
| k₀ を大きくする | 分散曲線の傾きが 1 に飽和する。⟨v⟩ は決して 1 を超えない |
| 「外場: 階段 V」 | Klein パラドックス。V₀ > E + m で壁の中を減衰せず透過する |
| 「外場: 階段 S」 | 同じ高さでも透過しない。実効質量が増えて全反射する |

## 操作

- **停止中のドラッグ**: 「描画対象」で選んだ量（`V` / `S` / `ψ` の 4 成分）を直接描く
- **平滑化**: 選択中の対象に `k` 空間ガウシアン（`σ_s = 2h`）を 1 パス掛ける。連打で幅は `√n` 倍
- **正/負分枝へ射影**: 各 `k` で厳密に射影する。落ちた重みの割合をヒント行に表示する
- **マウスホイール**: Y 軸範囲の調整
- **質量 m スライダー**: 実行中も変更できる

## 注意事項

**分枝の重みは「自由基底での射影」である。** 外場 `V`, `S` が非ゼロのとき、これは保存量でも
真の粒子／反粒子分解でもない。Klein 障壁の中で「負エネルギー成分が増えた」ように見えても、
基底の取り方の産物である可能性がある。

**実数の関数を描いても射影後は複素になる。** `u±(k)` は実ベクトルだが `k` の偶関数ではないため、
実関数を実たらしめている Hermite 対称性 `ψ̂(-k) = ψ̂(k)*` が射影で壊れる。

**端で波が消えるのは物理ではなく吸収層である。** 該当領域はキャンバス上で淡く塗ってある。
吸収した確率量は「吸収済み」タイルに積算される。W = 0 で無効化できる。

## 設計・検証

- 設計書: `docs/superpowers/specs/2026-09-11-1d-dirac-viewer-design.md`
- 実装計画: `docs/superpowers/plans/2026-09-11-1d-dirac-viewer.md`
- 検証スイート: `tests.html`（12 項目）
```

- [ ] **Step 4: 検証スイートが全部通ることを最終確認する**

`http://localhost:8123/tests.html`

Expected: 「41 件成功 / 0 件失敗」

- [ ] **Step 5: コミット**

```bash
cd /d D:\claude_code\dirac_eq
git add 1d_dirac_eq_viewer/src/main.js 1d_dirac_eq_viewer/README.md
git commit -m "feat: wire up main loop and add README

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## 検証項目と実装タスクの対応

| 検証項目（設計書 §9） | 実装するタスク |
|---|---|
| 1. FFT の往復 | Task 1 |
| 2. ユニタリ性 | Task 3 |
| 3. 自由分散関係 | Task 3 |
| 4. 群速度 | Task 6 |
| 5. 光速の上限 | Task 6 |
| 6. Zitterbewegung | Task 6 |
| 7. `m=0` の左右分離 | Task 6 |
| 8. Klein の対比 | Task 8 |
| 9. Strang の収束次数 | Task 3 |
| 10. 分枝スピノルの数値安定性 | Task 2 |
| 11. 分枝射影の厳密性 | Task 5 |
| 12. 平滑化の直流保存 | Task 7 |

## 設計書の節と実装タスクの対応

| 設計書の節 | 実装するタスク |
|---|---|
| §2.2 Weyl 表現 | Task 2, 3 |
| §3.1 格子 | Task 3 |
| §3.2 Strang 分割 | Task 3 |
| §3.3 ポテンシャル・質量ステップの厳密形 | Task 3 |
| §3.4 吸収層 | Task 8 |
| §3.5 分枝スピノル | Task 2 |
| §3.6 `⟨H⟩` の評価 | Task 4 |
| §3.7 平滑化 | Task 7 |
| §4 モジュール構成 | 全タスク |
| §5.1 レイアウト | Task 11 |
| §5.2 実空間キャンバス | Task 9 |
| §5.3 運動量キャンバス | Task 10 |
| §5.4 数値タイル | Task 4, 11 |
| §5.5 分枝の重みの注記 | Task 11（UI 文言）, Task 12（README） |
| §6 操作 | Task 11, 12 |
| §6.1 スライダー | Task 11 |
| §7.1 初期条件の作り方 | Task 5 |
| §7.2 プリセット | Task 5 |
| §7.3 手描きの初期条件 | Task 11（UI）, Task 12（配線） |
| §8 外場 | Task 8 |
| §9 検証 | Task 1〜8 |
