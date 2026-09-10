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
