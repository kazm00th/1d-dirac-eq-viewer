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
