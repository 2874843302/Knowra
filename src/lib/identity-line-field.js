// The mark is sampled once. Every visible frame is reconstructed from its field.
export const KNOWRA_MARK_PATH =
  "M12 4.7C9.3 2.5 5.2 2 1.5 3.2v16.1C5.1 18.1 9 18.6 12 21c3-2.4 6.9-2.9 10.5-1.7V3.2C18.8 2 14.7 2.5 12 4.7Zm-1 13.5C8.6 16.8 5.9 16.3 3.5 16.7V4.8C6.1 4.4 8.8 4.9 11 6.7v11.5Zm9.5-1.5c-2.4-.4-5.1.1-7.5 1.5V6.7c2.2-1.8 4.9-2.3 7.5-1.9v11.9Z";
const GRID = 60,
  SEGMENTS = 1800;
const WEIGHTS = [0.38, 1.12, 2.28, 3.8];
const ALPHAS = [0.15, 0.64, 0.93, 1];
let sampledMark;
const lattice = new Float32Array(128 * 128);
let seed = 7319;
for (let i = 0; i < lattice.length; i++) {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  lattice[i] = ((seed >>> 0) / 4294967295) * 2 - 1;
}
function noise(x, y) {
  const ix = Math.floor(x),
    iy = Math.floor(y);
  let tx = x - ix,
    ty = y - iy;
  tx *= tx * (3 - 2 * tx);
  ty *= ty * (3 - 2 * ty);
  const at = (a, b) => lattice[(b & 127) * 128 + (a & 127)];
  return (
    (at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx) * (1 - ty) +
    (at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx) * ty
  );
}
function sampleMark() {
  if (sampledMark) return sampledMark;
  if (typeof Path2D === "undefined") return null;
  const temporary = document.createElement("canvas");
  temporary.width = temporary.height = 300;
  const context = temporary.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.fillStyle = "#000";
  context.fillRect(0, 0, 300, 300);
  context.translate(150, 150);
  context.scale((300 * 0.86) / 24, (300 * 0.86) / 24);
  context.translate(-12, -12);
  context.fillStyle = "#fff";
  context.fill(new Path2D(KNOWRA_MARK_PATH), "evenodd");
  const pixels = context.getImageData(0, 0, 300, 300).data;
  const result = new Float32Array(GRID * GRID);
  for (let y = 0; y < GRID; y++)
    for (let x = 0; x < GRID; x++) {
      let light = 0;
      for (let dy = 0; dy < 5; dy++)
        for (let dx = 0; dx < 5; dx++) {
          const i = ((y * 5 + dy) * 300 + x * 5 + dx) * 4;
          light +=
            (0.2126 * pixels[i] +
              0.7152 * pixels[i + 1] +
              0.0722 * pixels[i + 2]) /
            255;
        }
      result[y * GRID + x] = light / 25;
    }
  temporary.width = temporary.height = 0;
  sampledMark = result;
  return result;
}

export function createIdentityLineField(
  canvas,
  host,
  { enabled = true, suspended = false } = {},
) {
  const source = sampleMark(),
    ctx = canvas.getContext("2d");
  if (!source || !ctx) return null;
  const offsetsX = new Float32Array(SEGMENTS),
    offsetsY = new Float32Array(SEGMENTS);
  const velocityX = new Float32Array(SEGMENTS),
    velocityY = new Float32Array(SEGMENTS);
  const brightness = new Float32Array(SEGMENTS);
  const field = new Float32Array(GRID * GRID),
    integral = new Float32Array(61 * 61);
  const slots = Array.from({ length: 3 }, () => ({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    alpha: 0,
    target: null,
    pending: null,
  }));
  const focusTarget = host;
  let width = canvas.clientWidth,
    height = canvas.clientHeight,
    dpr = 0;
  let frame = null,
    lastTime = null,
    elapsed = 0,
    pulse = 0,
    lastScan = -Infinity;
  let pointer = null,
    lastPulse = null,
    latestPointer = null,
    hovered = false,
    focused = false;
  let inView = true,
    disposed = false,
    frames = 0,
    scans = 0,
    resolutionQuery;
  const visible = () => !document.hidden && inView && !suspended;
  const moving = () => enabled && visible();
  const geometry = () => {
    const size = Math.max(1, Math.min(width - 12, height - 8));
    return {
      unit: size / GRID,
      x: (width - size) / 2,
      y: (height - size) / 2,
      size,
    };
  };
  const schedule = () => {
    if (frame === null && !disposed && visible())
      frame = requestAnimationFrame(draw);
  };
  const resetTime = () => {
    lastTime = null;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  };
  function resize() {
    const ratio = window.devicePixelRatio || 1;
    if (
      dpr !== ratio ||
      canvas.width !== Math.round(width * ratio) ||
      canvas.height !== Math.round(height * ratio)
    ) {
      dpr = ratio;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      lastScan = -Infinity;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function deposit(x, y, value) {
    const left = Math.floor(x),
      top = Math.floor(y),
      dx = x - left,
      dy = y - top;
    for (let oy = 0; oy < 2; oy++)
      for (let ox = 0; ox < 2; ox++) {
        const gx = left + ox,
          gy = top + oy;
        if (gx >= 0 && gx < GRID && gy >= 0 && gy < GRID)
          field[gy * GRID + gx] +=
            value * (ox ? dx : 1 - dx) * (oy ? dy : 1 - dy);
      }
  }
  function scan(unit) {
    field.fill(0);
    integral.fill(0);
    for (let i = 0; i < SEGMENTS; i++) {
      const col = i % GRID,
        row = Math.floor(i / GRID) * 2;
      deposit(
        col + offsetsX[i] / unit,
        row + offsetsY[i] / unit,
        brightness[i],
      );
      deposit(
        col + offsetsX[i] / unit,
        row + 1 + offsetsY[i] / unit,
        brightness[i],
      );
    }
    for (let y = 0; y < GRID; y++) {
      let sum = 0;
      for (let x = 0; x < GRID; x++) {
        sum += field[y * GRID + x];
        integral[(y + 1) * 61 + x + 1] = integral[y * 61 + x + 1] + sum;
      }
    }
    const candidates = [];
    let maximum = 0;
    for (let y = 0; y <= GRID - 7; y++)
      for (let x = 0; x <= GRID - 7; x++) {
        const light =
          (integral[(y + 7) * 61 + x + 7] -
            integral[y * 61 + x + 7] -
            integral[(y + 7) * 61 + x] +
            integral[y * 61 + x]) /
          49;
        maximum = Math.max(maximum, light);
        const cx = x + 3,
          cy = y + 3;
        const distance = Math.min(
          ...slots
            .filter((slot) => slot.target)
            .map(
              (slot) => (slot.target.x - cx) ** 2 + (slot.target.y - cy) ** 2,
            ),
          Infinity,
        );
        candidates.push({
          x: cx,
          y: cy,
          light,
          score: light + 0.025 * Math.exp(-distance / 128),
        });
      }
    candidates.sort((a, b) => b.score - a.score || a.y - b.y || a.x - b.x);
    const choose = (spacing) => {
      const chosen = [];
      if (maximum < 0.04) return chosen;
      for (const candidate of candidates) {
        if (candidate.light < maximum * 0.48) continue;
        if (
          chosen.every(
            (old) =>
              Math.hypot(old.x - candidate.x, old.y - candidate.y) >= spacing,
          )
        )
          chosen.push(candidate);
        if (chosen.length === 3) break;
      }
      return chosen;
    };
    let targets = choose(16);
    if (targets.length < 2) targets = choose(12);
    const available = new Set(slots),
      unmatched = [];
    for (const target of targets) {
      const match = [...available]
        .filter(
          (slot) =>
            slot.target &&
            Math.hypot(slot.target.x - target.x, slot.target.y - target.y) <=
              12,
        )
        .sort(
          (a, b) =>
            Math.hypot(a.target.x - target.x, a.target.y - target.y) -
            Math.hypot(b.target.x - target.x, b.target.y - target.y),
        )[0];
      if (match) {
        match.target = target;
        match.pending = null;
        available.delete(match);
      } else unmatched.push(target);
    }
    for (const slot of available) {
      slot.target = null;
      slot.pending = unmatched.shift() || null;
    }
    scans++;
    canvas.dataset.scans = String(scans);
    canvas.dataset.targets = JSON.stringify(targets.map(({ x, y }) => [x, y]));
  }
  function drawBoxes(g, dt, staticFrame) {
    const active = hovered || focused;
    for (const slot of slots) {
      const aim = active && slot.target ? 1 : 0;
      slot.alpha = staticFrame
        ? aim
        : slot.alpha + (aim - slot.alpha) * (1 - Math.exp(-dt * 16));
      if (!slot.target && slot.pending && (staticFrame || slot.alpha < 0.04)) {
        slot.target = slot.pending;
        slot.pending = null;
        slot.x = slot.target.x;
        slot.y = slot.target.y;
        slot.vx = slot.vy = 0;
        if (staticFrame) slot.alpha = active ? 1 : 0;
      }
      if (!slot.target) continue;
      if (staticFrame) {
        slot.x = slot.target.x;
        slot.y = slot.target.y;
        slot.vx = slot.vy = 0;
      } else {
        const steps = Math.max(1, Math.ceil(dt * 120)),
          step = dt / steps;
        for (let i = 0; i < steps; i++) {
          slot.vx += ((slot.target.x - slot.x) * 144 - slot.vx * 24) * step;
          slot.vy += ((slot.target.y - slot.y) * 144 - slot.vy * 24) * step;
          slot.x += slot.vx * step;
          slot.y += slot.vy * step;
        }
        if (
          Math.hypot(
            slot.x - slot.target.x,
            slot.y - slot.target.y,
            slot.vx,
            slot.vy,
          ) < 0.002
        ) {
          slot.x = slot.target.x;
          slot.y = slot.target.y;
          slot.vx = slot.vy = 0;
        }
      }
    }
    ctx.strokeStyle = "#4a83b8";
    ctx.fillStyle = "#4a83b8";
    for (let i = 1; i < slots.length; i++) {
      const a = slots[i - 1],
        b = slots[i];
      ctx.globalAlpha = Math.min(a.alpha, b.alpha) * 0.45;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(g.x + (a.x + 0.5) * g.unit, g.y + (a.y + 0.5) * g.unit);
      ctx.lineTo(g.x + (b.x + 0.5) * g.unit, g.y + (b.y + 0.5) * g.unit);
      ctx.stroke();
    }
    for (const slot of slots) {
      if (slot.alpha < 0.01) continue;
      const x = g.x + (slot.x - 4) * g.unit,
        y = g.y + (slot.y - 4) * g.unit,
        size = g.unit * 9;
      ctx.globalAlpha = slot.alpha * 0.08;
      ctx.fillRect(x, y, size, size);
      ctx.globalAlpha = slot.alpha * 0.75;
      ctx.lineWidth = 0.7;
      ctx.strokeRect(x, y, size, size);
      ctx.globalAlpha = slot.alpha;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (const [cx, cy, sx, sy] of [
        [x, y, 1, 1],
        [x + size, y, -1, 1],
        [x, y + size, 1, -1],
        [x + size, y + size, -1, -1],
      ]) {
        ctx.moveTo(cx + sx * 4, cy);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx, cy + sy * 4);
      }
      ctx.stroke();
      ctx.font = "7px ui-monospace, monospace";
      ctx.fillText(
        `${slot.x.toFixed(slot.x === slot.target?.x ? 0 : 1)},${slot.y.toFixed(slot.y === slot.target?.y ? 0 : 1)}`,
        x,
        y - 3,
      );
    }
    ctx.globalAlpha = 1;
  }
  function draw(time) {
    frame = null;
    if (disposed || !visible() || !width || !height) return;
    resize();
    const animated = moving(),
      dt =
        lastTime === null ? 1 / 60 : Math.min((time - lastTime) / 1000, 1 / 30);
    lastTime = animated ? time : null;
    if (animated) elapsed += dt;
    if (latestPointer) {
      const rect = canvas.getBoundingClientRect(); // At most one geometry read per pointer frame.
      pointer = {
        x: ((latestPointer.x - rect.left) * width) / rect.width,
        y: ((latestPointer.y - rect.top) * height) / rect.height,
      };
      if (
        !lastPulse ||
        Math.hypot(pointer.x - lastPulse.x, pointer.y - lastPulse.y) > 1.5
      ) {
        pulse = 1;
        lastPulse = { ...pointer };
      }
      latestPointer = null;
    }
    const g = geometry(),
      groups = Array.from({ length: 4 }, () => new Path2D());
    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = "butt";
    let displacement = 0;
    for (let i = 0; i < SEGMENTS; i++) {
      const col = i % GRID,
        row = Math.floor(i / GRID) * 2;
      const base =
        (source[row * GRID + col] + source[(row + 1) * GRID + col]) / 2;
      const light = Math.max(
        0,
        Math.min(
          1,
          base * 0.94 +
            noise(col * 0.15 + 17, row * 0.16 - elapsed * 0.17) *
              0.12 *
              (0.25 + base * 0.75),
        ),
      );
      brightness[i] = light;
      const x = g.x + (col + 0.5) * g.unit,
        y = g.y + (row + 1) * g.unit;
      let tx = 0,
        ty = 0;
      if (pointer && animated) {
        const dx = x - pointer.x,
          dy = y - pointer.y,
          distance = Math.hypot(dx, dy);
        const influence =
          Math.max(0, 1 - distance / (g.size / 4)) ** 2 * pulse * 25;
        if (distance > 0.001) {
          tx = (dx / distance) * influence;
          ty = (dy / distance) * influence * 0.58;
        }
      }
      if (animated) {
        velocityX[i] += ((tx - offsetsX[i]) * 145 - velocityX[i] * 19) * dt;
        velocityY[i] += ((ty - offsetsY[i]) * 145 - velocityY[i] * 19) * dt;
        offsetsX[i] += velocityX[i] * dt;
        offsetsY[i] += velocityY[i] * dt;
      } else {
        offsetsX[i] = offsetsY[i] = velocityX[i] = velocityY[i] = 0;
      }
      displacement = Math.max(
        displacement,
        Math.hypot(offsetsX[i], offsetsY[i]),
      );
      const group = light < 0.12 ? 0 : light < 0.42 ? 1 : light < 0.89 ? 2 : 3;
      const half = Math.max(0, (g.unit * 2 - 0.7) / 2);
      groups[group].moveTo(x + offsetsX[i], y + offsetsY[i] - half);
      groups[group].lineTo(x + offsetsX[i], y + offsetsY[i] + half);
    }
    pulse *= Math.exp(-dt * 5.5);
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = "#476d8c";
      ctx.lineWidth = (WEIGHTS[i] * g.unit) / 5.25;
      ctx.globalAlpha = ALPHAS[i];
      ctx.stroke(groups[i]);
    }
    ctx.globalAlpha = 1;
    if ((hovered || focused) && (time - lastScan >= 100 || !animated)) {
      scan(g.unit);
      lastScan = time;
    }
    drawBoxes(g, dt, !animated);
    frames++;
    canvas.dataset.frames = String(frames);
    canvas.dataset.displacement = displacement.toFixed(3);
    canvas.dataset.running = String(animated);
    if (animated) schedule();
  }
  const pointerMove = (event) => {
    latestPointer = { x: event.clientX, y: event.clientY };
    schedule();
  };
  const pointerEnter = (event) => {
    hovered = true;
    lastPulse = null;
    lastScan = -Infinity;
    pointerMove(event);
  };
  const pointerLeave = () => {
    hovered = false;
    latestPointer = null;
    lastPulse = null;
    schedule();
  };
  const focus = () => {
    focused = true;
    lastScan = -Infinity;
    schedule();
  };
  const blur = () => {
    focused = false;
    schedule();
  };
  const visibility = () => {
    resetTime();
    schedule();
  };
  const observer = new ResizeObserver((entries) => {
    const box = entries[0].contentRect;
    width = box.width;
    height = box.height;
    lastScan = -Infinity;
    resetTime();
    schedule();
  });
  observer.observe(canvas);
  const intersection = new IntersectionObserver((entries) => {
    inView = entries[0].isIntersecting;
    visibility();
  });
  intersection.observe(host);
  function resolutionChanged() {
    bindResolution();
    lastScan = -Infinity;
    resetTime();
    schedule();
  }
  function bindResolution() {
    resolutionQuery?.removeEventListener("change", resolutionChanged);
    resolutionQuery = matchMedia(
      `(resolution: ${window.devicePixelRatio || 1}dppx)`,
    );
    resolutionQuery.addEventListener("change", resolutionChanged);
  }
  bindResolution();
  // Some display changes omit a media-query event. A paused field only needs
  // one new static paint when the pixel ratio actually changes, never a RAF loop.
  const resolutionPoll = setInterval(() => {
    if (!moving() && visible() && (window.devicePixelRatio || 1) !== dpr)
      resolutionChanged();
  }, 750);
  window.addEventListener("resize", resolutionChanged);
  host.addEventListener("pointerenter", pointerEnter);
  host.addEventListener("pointermove", pointerMove);
  host.addEventListener("pointerdown", pointerEnter);
  host.addEventListener("pointerleave", pointerLeave);
  host.addEventListener("pointercancel", pointerLeave);
  host.addEventListener("pointerup", eventPointerUp);
  function eventPointerUp(event) {
    if (event.pointerType !== "mouse") pointerLeave();
  }
  focusTarget.addEventListener("focus", focus);
  focusTarget.addEventListener("blur", blur);
  document.addEventListener("visibilitychange", visibility);
  schedule();
  return {
    setEnabled(value) {
      enabled = value;
      resetTime();
      schedule();
    },
    setSuspended(value) {
      suspended = value;
      resetTime();
      schedule();
    },
    destroy() {
      disposed = true;
      clearInterval(resolutionPoll);
      window.removeEventListener("resize", resolutionChanged);
      resetTime();
      observer.disconnect();
      intersection.disconnect();
      resolutionQuery?.removeEventListener("change", resolutionChanged);
      host.removeEventListener("pointerenter", pointerEnter);
      host.removeEventListener("pointermove", pointerMove);
      host.removeEventListener("pointerdown", pointerEnter);
      host.removeEventListener("pointerleave", pointerLeave);
      host.removeEventListener("pointercancel", pointerLeave);
      host.removeEventListener("pointerup", eventPointerUp);
      focusTarget.removeEventListener("focus", focus);
      focusTarget.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
    },
  };
}
