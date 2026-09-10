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
