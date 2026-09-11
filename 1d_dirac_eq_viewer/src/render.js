// Canvas 2D への描画。物理を知らず、渡された数値をそのまま描く。

// left/bottom を広げたのは、目盛り数値に加えて軸タイトル（横軸・縦軸のラベル）を
// 収めるため。ui.js はこの定数を import して使うので、ここを変えれば両方に反映される。
export const REAL_MARGIN = { left: 52, right: 14, top: 14, bottom: 38 };

function cssVar(name) {
  return getComputedStyle(document.body).getPropertyValue(name).trim();
}

export function createRealRenderer(canvas) {
  const ctx = canvas.getContext("2d");

  function draw(opts) {
    const { grid, state, density, current, fields, yscale, absorbWidth, show } = opts;
    const CW = canvas.width, CH = canvas.height;
    const plotW = CW - REAL_MARGIN.left - REAL_MARGIN.right;
    const plotH = CH - REAL_MARGIN.top - REAL_MARGIN.bottom;

    const xToPx = (x) => REAL_MARGIN.left + (x / grid.L) * plotW;
    const yToPx = (y) => REAL_MARGIN.top + plotH / 2 - (y / yscale) * (plotH / 2);

    ctx.clearRect(0, 0, CW, CH);

    // 吸収層の領域を淡く塗る（端で消えるのが物理でないことを示すため）
    if (absorbWidth > 0) {
      ctx.fillStyle = cssVar("--absorb-bg");
      const w = (absorbWidth / grid.L) * plotW;
      ctx.fillRect(REAL_MARGIN.left, REAL_MARGIN.top, w, plotH);
      ctx.fillRect(REAL_MARGIN.left + plotW - w, REAL_MARGIN.top, w, plotH);
    }

    // 軸
    ctx.strokeStyle = cssVar("--border");
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(REAL_MARGIN.left, yToPx(0));
    ctx.lineTo(CW - REAL_MARGIN.right, yToPx(0));
    ctx.moveTo(REAL_MARGIN.left, REAL_MARGIN.top);
    ctx.lineTo(REAL_MARGIN.left, CH - REAL_MARGIN.bottom);
    ctx.stroke();

    ctx.fillStyle = cssVar("--text-muted");
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    for (let i = 0; i <= 4; i++) {
      const x = (grid.L * i) / 4;
      ctx.fillText(x.toFixed(0), xToPx(x), CH - REAL_MARGIN.bottom + 12);
    }
    ctx.textAlign = "right";
    ctx.fillText(yscale.toFixed(2), REAL_MARGIN.left - 8, yToPx(yscale) + 4);
    ctx.fillText((-yscale).toFixed(2), REAL_MARGIN.left - 8, yToPx(-yscale) + 4);

    // 軸タイトル（横軸・縦軸のラベル）
    ctx.textAlign = "center";
    ctx.fillText("位置 x [ƛ_C]", REAL_MARGIN.left + plotW / 2, CH - 6);
    ctx.save();
    ctx.translate(12, REAL_MARGIN.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("値（自然単位, ħ=c=1）", 0, 0);
    ctx.restore();

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

export function createMomentumRenderer(canvas) {
  const ctx = canvas.getContext("2d");

  function draw(opts) {
    const { grid, m, wPlus, wMinus, kMax } = opts;
    const CW = canvas.width, CH = canvas.height;
    const plotW = CW - REAL_MARGIN.left - REAL_MARGIN.right;
    const plotH = CH - REAL_MARGIN.top - REAL_MARGIN.bottom;

    const eMax = Math.hypot(kMax, m) * 1.1;
    const kToPx = (k) => REAL_MARGIN.left + ((k + kMax) / (2 * kMax)) * plotW;
    const eToPx = (E) => REAL_MARGIN.top + plotH / 2 - (E / eMax) * (plotH / 2);

    ctx.clearRect(0, 0, CW, CH);

    // 軸
    ctx.strokeStyle = cssVar("--border");
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(REAL_MARGIN.left, eToPx(0));
    ctx.lineTo(CW - REAL_MARGIN.right, eToPx(0));
    ctx.moveTo(kToPx(0), REAL_MARGIN.top);
    ctx.lineTo(kToPx(0), CH - REAL_MARGIN.bottom);
    ctx.stroke();

    ctx.fillStyle = cssVar("--text-muted");
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`k = ${(-kMax).toFixed(0)}`, kToPx(-kMax) + 22, CH - REAL_MARGIN.bottom + 12);
    ctx.fillText(`k = ${kMax.toFixed(0)}`, kToPx(kMax) - 22, CH - REAL_MARGIN.bottom + 12);
    ctx.textAlign = "right";
    ctx.fillText(`E = ${eMax.toFixed(1)}`, REAL_MARGIN.left - 8, eToPx(eMax) + 10);

    // 軸タイトル（横軸・縦軸のラベル）
    ctx.textAlign = "center";
    ctx.fillText("波数 k [1/ƛ_C]", REAL_MARGIN.left + plotW / 2, CH - 6);
    ctx.save();
    ctx.translate(12, REAL_MARGIN.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("エネルギー E [1/ƛ_C]", 0, 0);
    ctx.restore();

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
    ctx.fillText(`質量ギャップ 2m = ${(2 * m).toFixed(2)}`, REAL_MARGIN.left + 6, REAL_MARGIN.top + 12);
  }

  return { draw };
}
