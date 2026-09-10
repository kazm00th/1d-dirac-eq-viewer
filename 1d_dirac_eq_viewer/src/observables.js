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
