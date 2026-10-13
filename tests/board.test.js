import test from "node:test";
import assert from "node:assert/strict";
import { Board } from "../board.js";
import { generate } from "../engine.js";
import { getMission } from "../data.js";
function harness() {
  let scans = 0,
    frames = 0;
  const b = Object.create(Board.prototype);
  Object.assign(b, {
    canvas: {
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
      setPointerCapture() {},
    },
    session: generate(getMission(1)),
    options: {
      onSelect() {
        scans++;
      },
    },
    pointers: new Map(),
    gesture: null,
    pan: { x: 0, y: 0 },
    zoom: 1,
    fitZoom: 1,
    width: 400,
    height: 400,
    destroyed: false,
    raf: 0,
    pick: () => ({ key: "0,0" }),
    invalidate() {
      frames++;
    },
  });
  return {
    b,
    get scans() {
      return scans;
    },
    get frames() {
      return frames;
    },
  };
}
const event = (id, x, y) => ({
  pointerId: id,
  clientX: x,
  clientY: y,
  button: 0,
  pointerType: "touch",
  preventDefault() {},
});
test("a tap scans once, subthreshold motion does not pan, dragging never scans", () => {
  const h = harness();
  h.b.down(event(1, 100, 100));
  h.b.move(event(1, 103, 103));
  assert.deepEqual(h.b.pan, { x: 0, y: 0 });
  h.b.up(event(1, 103, 103));
  assert.equal(h.scans, 1);
  h.b.down(event(2, 100, 100));
  h.b.move(event(2, 140, 130));
  h.b.up(event(2, 140, 130));
  assert.equal(h.scans, 1);
  assert.notEqual(h.b.pan.x, 0);
});
test("pinch, one-finger continuation, and cancellation cannot emit a scan", () => {
  const h = harness();
  h.b.down(event(1, 100, 100));
  h.b.down(event(2, 200, 100));
  h.b.move(event(2, 230, 100));
  assert.ok(h.b.zoom > 1);
  h.b.up(event(2, 230, 100));
  h.b.up(event(1, 100, 100));
  assert.equal(h.scans, 0);
  h.b.down(event(3, 100, 100));
  h.b.cancel(event(3, 100, 100));
  h.b.up(event(3, 100, 100));
  assert.equal(h.scans, 0);
});
test("animation invalidations coalesce, and destruction cancels the owned frame", () => {
  const oldRequest = globalThis.requestAnimationFrame,
    oldCancel = globalThis.cancelAnimationFrame;
  let callbacks = 0,
    cancelled;
  globalThis.requestAnimationFrame = () => ++callbacks;
  globalThis.cancelAnimationFrame = (id) => (cancelled = id);
  try {
    const b = Object.create(Board.prototype);
    Object.assign(b, {
      destroyed: false,
      raf: 0,
      controller: { abort() {} },
      observer: { disconnect() {} },
    });
    b.invalidate();
    b.invalidate();
    b.invalidate();
    assert.equal(callbacks, 1);
    b.destroy();
    assert.equal(cancelled, 1);
    b.invalidate();
    assert.equal(callbacks, 1);
  } finally {
    globalThis.requestAnimationFrame = oldRequest;
    globalThis.cancelAnimationFrame = oldCancel;
  }
});
test("picking ignores the background and the small visual gaps between tiles", () => {
  const b = Object.create(Board.prototype);
  Object.assign(b, {
    session: generate(getMission(1)),
    width: 400,
    height: 400,
    zoom: 1,
    pan: { x: 0, y: 0 },
  });
  assert.equal(b.pick({ x: 200, y: 200 }).key, "0,0");
  assert.equal(b.pick({ x: 200, y: 200 + 38 * 0.76 }), null);
  assert.equal(b.pick({ x: 5, y: 5 }), null);
});
