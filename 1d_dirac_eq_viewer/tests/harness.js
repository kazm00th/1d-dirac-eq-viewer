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
