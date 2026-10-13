import { BIOMES } from "./data.js";
import { project, unproject, candidates, insideHex } from "./engine.js";
const COLORS = {
  grass: "#92c9a7",
  water: "#7bb9c8",
  snow: "#d6e9ec",
  stone: "#acb8bb",
  sand: "#dfc08f",
  autumn: "#caaa78",
  magic: "#b3a0d1",
  lava: "#d79278",
  rock: "#899299",
};
const shade = (hex, f) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${Math.round((n >> 16) * f)},${Math.round(((n >> 8) & 255) * f)},${Math.round((n & 255) * f)})`;
};
const SIZE = 38;
export class Board {
  constructor(canvas, session, assets, options) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.session = session;
    this.assets = assets;
    this.options = options;
    this.width = 1;
    this.height = 1;
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.hover = null;
    this.focus = "0,0";
    this.pointers = new Map();
    this.gesture = null;
    this.raf = 0;
    this.pulse = null;
    this.destroyed = false;
    this.customCamera = false;
    this.controller = new AbortController();
    const opt = { signal: this.controller.signal };
    canvas.addEventListener("pointerdown", (e) => this.down(e), opt);
    canvas.addEventListener("pointermove", (e) => this.move(e), opt);
    canvas.addEventListener("pointerup", (e) => this.up(e), opt);
    canvas.addEventListener("pointercancel", (e) => this.cancel(e), opt);
    canvas.addEventListener(
      "pointerleave",
      () => {
        if (!this.pointers.size) {
          this.hover = null;
          this.invalidate();
        }
      },
      opt,
    );
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const p = this.local(e);
        this.zoomAt(Math.exp(-e.deltaY * 0.0015), p);
      },
      { ...opt, passive: false },
    );
    canvas.addEventListener("keydown", (e) => this.key(e), opt);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
  }
  local(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  screen(cell) {
    const p = project(cell, SIZE);
    return {
      x: this.width / 2 + this.pan.x + p.x * this.zoom,
      y: this.height / 2 + this.pan.y + p.y * this.zoom,
    };
  }
  world(p) {
    return {
      x: (p.x - this.width / 2 - this.pan.x) / this.zoom,
      y: (p.y - this.height / 2 - this.pan.y) / this.zoom,
    };
  }
  pick(p) {
    const w = this.world(p),
      c = unproject(w.x, w.y, SIZE);
    const cell = this.session.cells.find((h) => h.key === c.key);
    if (!cell) return null;
    const center = project(cell, SIZE);
    return insideHex(w.x - center.x, w.y - center.y, SIZE - 1) ? cell : null;
  }
  resize() {
    if (this.destroyed) return;
    const r = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, r.width);
    this.height = Math.max(1, r.height);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.customCamera) this.fit();
    else this.constrain();
    this.invalidate();
  }
  fit() {
    const pts = this.session.cells.map((c) => project(c, SIZE));
    const w =
        Math.max(...pts.map((p) => p.x)) -
        Math.min(...pts.map((p) => p.x)) +
        SIZE * 2,
      h =
        Math.max(...pts.map((p) => p.y)) -
        Math.min(...pts.map((p) => p.y)) +
        SIZE * 3.3;
    this.fitZoom = Math.max(
      0.3,
      Math.min((this.width - 36) / w, (this.height - 36) / h, 1.7),
    );
    this.zoom = this.fitZoom;
    this.pan = { x: 0, y: 18 * this.zoom };
    this.customCamera = false;
    this.invalidate();
  }
  constrain() {
    const lim = this.session.config.radius * SIZE * this.zoom;
    this.pan.x = Math.max(-lim, Math.min(lim, this.pan.x));
    this.pan.y = Math.max(-lim, Math.min(lim, this.pan.y));
  }
  zoomAt(f, p = { x: this.width / 2, y: this.height / 2 }) {
    const world = this.world(p);
    this.zoom = Math.max(
      Math.min(this.fitZoom, 0.55),
      Math.min(3, this.zoom * f),
    );
    this.pan.x = p.x - this.width / 2 - world.x * this.zoom;
    this.pan.y = p.y - this.height / 2 - world.y * this.zoom;
    this.customCamera = true;
    this.constrain();
    this.invalidate();
  }
  center(key) {
    const cell = this.session.cells.find((c) => c.key === key);
    if (!cell) return;
    this.focus = key;
    const p = project(cell, SIZE);
    this.pan = { x: -p.x * this.zoom, y: -p.y * this.zoom };
    this.customCamera = true;
    this.invalidate();
    this.canvas.focus({ preventScroll: true });
  }
  down(e) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 1)
      this.gesture = { start: p, last: p, dragged: false };
    else {
      const [a, b] = [...this.pointers.values()];
      this.gesture = {
        dragged: true,
        pinch: Math.hypot(a.x - b.x, a.y - b.y),
        center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
    }
  }
  move(e) {
    const p = this.local(e);
    if (!this.pointers.has(e.pointerId)) {
      const c = this.pick(p);
      if (this.hover !== c?.key) {
        this.hover = c?.key;
        this.invalidate();
      }
      return;
    }
    this.pointers.set(e.pointerId, p);
    const g = this.gesture;
    if (!g) return;
    if (this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()],
        d = Math.hypot(a.x - b.x, a.y - b.y),
        center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (g.pinch > 0) this.zoomAt(d / g.pinch, g.center);
      if (g.center) {
        this.pan.x += center.x - g.center.x;
        this.pan.y += center.y - g.center.y;
      }
      g.pinch = d;
      g.center = center;
      g.dragged = true;
      this.customCamera = true;
    } else {
      if (!g.start) g.start = p;
      if (Math.hypot(p.x - g.start.x, p.y - g.start.y) > 8) g.dragged = true;
      if (g.dragged && g.last) {
        this.pan.x += p.x - g.last.x;
        this.pan.y += p.y - g.last.y;
        this.customCamera = true;
      }
      g.last = p;
    }
    this.constrain();
    this.invalidate();
  }
  up(e) {
    const g = this.gesture,
      p = this.local(e);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size) {
      const next = [...this.pointers.values()][0];
      this.gesture = { start: next, last: next, dragged: true };
      return;
    }
    this.gesture = null;
    if (g && !g.dragged) {
      const c = this.pick(p);
      if (c) {
        this.focus = c.key;
        this.options.onSelect(c.key);
      }
    }
    this.invalidate();
  }
  cancel(e) {
    this.pointers.delete(e.pointerId);
    this.gesture = this.pointers.size
      ? { dragged: true, last: [...this.pointers.values()][0] }
      : null;
  }
  key(e) {
    const moves = {
      ArrowRight: [1, 0],
      ArrowLeft: [-1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      q: [-1, 1],
      e: [1, -1],
    };
    const c =
      this.session.cells.find((h) => h.key === this.focus) ||
      this.session.cells[0];
    if (moves[e.key]) {
      e.preventDefault();
      const [dq, dr] = moves[e.key],
        next = this.session.cells.find(
          (h) => h.q === c.q + dq && h.r === c.r + dr,
        );
      if (next) {
        this.focus = next.key;
        this.options.onFocus?.(next);
        this.invalidate();
      }
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      this.options.onSelect(c.key);
    } else if (e.key === "Home") {
      e.preventDefault();
      this.fit();
    }
  }
  flash(key, rescue = false) {
    this.pulse = { key, start: performance.now(), rescue };
    this.invalidate();
  }
  invalidate() {
    if (!this.destroyed && !this.raf)
      this.raf = requestAnimationFrame((t) => {
        this.raf = 0;
        this.draw(t);
      });
  }
  polygon(x, y, size = SIZE) {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i + Math.PI / 6,
        px = x + size * Math.cos(a),
        py = y + size * 0.76 * Math.sin(a);
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
  }
  draw(time) {
    if (this.destroyed) return;
    const ctx = this.ctx,
      s = this.session,
      z = this.zoom;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.translate(this.width / 2 + this.pan.x, this.height / 2 + this.pan.y);
    ctx.scale(z, z);
    const possible = new Set(candidates(s).map((c) => c.key)),
      guided = this.options.guided(),
      contrast = this.options.contrast();
    const ordered = [...s.cells].sort((a, b) => a.r - b.r || a.q - b.q);
    // The same projected hex footprint is used for rendering and cube-round picking.
    for (const cell of ordered) {
      const { x, y } = project(cell, SIZE),
        color = COLORS[cell.biome];
      this.polygon(x, y + 10, SIZE - 1);
      ctx.fillStyle = shade(color, 0.6);
      ctx.fill();
      this.polygon(x, y, SIZE - 1);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.25)";
      ctx.lineWidth = 0.9;
      ctx.stroke();
      if (
        guided &&
        !possible.has(cell.key) &&
        !s.targets.some((t) => t.key === cell.key && t.found)
      ) {
        this.polygon(x, y, SIZE - 1);
        ctx.fillStyle = contrast ? "rgba(16,28,36,.68)" : "rgba(16,28,36,.42)";
        ctx.fill();
      }
      if (
        this.hover === cell.key ||
        (this.focus === cell.key && this.canvas === document.activeElement)
      ) {
        this.polygon(x, y, SIZE - 2);
        ctx.strokeStyle = "#fff4cc";
        ctx.lineWidth = 2.5 / z;
        ctx.stroke();
      }
    }
    for (const cell of ordered) {
      const { x, y } = project(cell, SIZE),
        found = s.targets.find((t) => t.key === cell.key && t.found);
      const image = found
        ? this.assets[found.crew.file]
        : cell.prop
          ? this.assets[cell.prop]
          : null;
      if (image) {
        const maxH = found ? SIZE * 1.6 : SIZE * 1.05,
          h = Math.min(maxH, image.height),
          w = (image.width * h) / image.height;
        ctx.globalAlpha = found
          ? 1
          : guided && !possible.has(cell.key)
            ? 0.35
            : 0.7;
        ctx.drawImage(image, x - w / 2, y - h + 6, w, h);
        ctx.globalAlpha = 1;
      } else if (found) {
        ctx.fillStyle = "#fff4cc";
        ctx.beginPath();
        ctx.arc(x, y - 18, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#101c24";
        ctx.fillRect(x - 6, y - 20, 3, 3);
        ctx.fillRect(x + 3, y - 20, 3, 3);
      }
    }
    // Evidence stays above scenery, and is always paired with text or a symbol.
    for (const cell of ordered) {
      const { x, y } = project(cell, SIZE),
        readings = s.readings.filter(
          (r) => r.cell === cell.key && r.target === s.active,
        ),
        reading = readings.at(-1),
        mark = s.marks[`${s.active}:${cell.key}`];
      const portal = s.portals.findIndex((p) => p.key === cell.key);
      if (portal >= 0) {
        ctx.strokeStyle = "#f7ebbd";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(x, y - 4, 18, 12, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#172630";
        ctx.fillRect(x - 10, y - 11, 20, 16);
        ctx.fillStyle = "#f7ebbd";
        ctx.font = "500 12px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillText(portal === 0 ? "A" : "B", x, y + 1);
      }
      if (reading && reading.result.kind !== "found") {
        const r = reading.result;
        let text =
          r.kind === "exact"
            ? String(r.value)
            : r.kind === "band"
              ? `${r.low}–${r.high}`
              : r.kind === "bearing"
                ? r.value
                : r.kind === "sweep"
                  ? r.inside
                    ? "IN"
                    : "OUT"
                  : r.tier === "Very close"
                    ? "HOT"
                    : r.tier === "Near"
                      ? "NEAR"
                      : "FAR";
        ctx.font = "600 13px ui-monospace, monospace";
        const w = Math.max(25, ctx.measureText(text).width + 12);
        ctx.fillStyle = "#15242e";
        ctx.beginPath();
        ctx.roundRect(x - w / 2, y - 9, w, 21, 6);
        ctx.fill();
        ctx.fillStyle = "#fff1c3";
        ctx.textAlign = "center";
        ctx.fillText(text, x, y + 6);
      }
      if (mark) {
        ctx.fillStyle = mark === 1 ? "#172630" : "#fff1c3";
        ctx.beginPath();
        ctx.arc(x + 20, y - 12, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = mark === 1 ? "#fff1c3" : "#172630";
        ctx.font = "600 12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(mark === 1 ? "?" : "×", x + 20, y - 8);
      }
      if (guided && contrast && !possible.has(cell.key) && !reading) {
        ctx.fillStyle = "#f4ead8";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("×", x, y + 8);
      }
    }
    if (this.pulse) {
      const elapsed = time - this.pulse.start;
      if (elapsed < 900 && this.options.motion()) {
        const c = s.cells.find((h) => h.key === this.pulse.key),
          p = project(c, SIZE),
          t = elapsed / 900;
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = "#fff1c3";
        ctx.lineWidth = 3 / z;
        ctx.beginPath();
        ctx.ellipse(
          p.x,
          p.y,
          20 + t * 70,
          (20 + t * 70) * 0.76,
          0,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
        if (this.pulse.rescue) {
          for (let i = 0; i < 14; i++) {
            const a = (i * Math.PI * 2) / 14;
            ctx.fillStyle = i % 2 ? "#e7c36f" : s.config.planet.color;
            ctx.beginPath();
            ctx.arc(
              p.x + Math.cos(a) * t * 110,
              p.y - 30 + Math.sin(a) * t * 70 + t * t * 50,
              3,
              0,
              Math.PI * 2,
            );
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
        this.invalidate();
      } else this.pulse = null;
    }
    ctx.restore();
  }
  destroy() {
    this.destroyed = true;
    this.controller.abort();
    this.observer.disconnect();
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }
}
