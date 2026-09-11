// Canvas 2D への描画。物理を知らず、渡された数値をそのまま描く。

export const REAL_MARGIN = { left: 40, right: 14, top: 14, bottom: 26 };

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
      ctx.fillText(x.toFixed(0), xToPx(x), CH - 8);
    }
    ctx.textAlign = "right";
    ctx.fillText(yscale.toFixed(2), REAL_MARGIN.left - 4, yToPx(yscale) + 4);
    ctx.fillText((-yscale).toFixed(2), REAL_MARGIN.left - 4, yToPx(-yscale) + 4);

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
