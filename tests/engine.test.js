import test from "node:test";
import assert from "node:assert/strict";
import { PLANETS, getMission, BIOMES, TOTAL_MISSIONS } from "../data.js";
import {
  generate,
  hexes,
  distance,
  project,
  unproject,
  foldedDistance,
  act,
  candidates,
  resultAt,
  challengeConfig,
  medal,
} from "../engine.js";
import { sanitize } from "../storage.js";
import { existsSync } from "node:fs";
const origin = { q: 0, r: 0 };
test("six distinct planets with seven missions and complete asset references", () => {
  assert.equal(PLANETS.length, 6);
  assert.equal(TOTAL_MISSIONS, 42);
  assert.equal(new Set(PLANETS.map((p) => p.id)).size, 6);
  for (const p of PLANETS) assert.equal(p.missions.length, 7);
  for (const b of Object.values(BIOMES))
    for (const file of [b.tile, ...b.props])
      assert.ok(existsSync(new URL("../tiles/" + file, import.meta.url)));
});
test("hex topology and projection round trips at every mission scale", () => {
  for (let radius = 1; radius <= 4; radius++) {
    const cells = hexes(radius);
    assert.equal(cells.length, 1 + 3 * radius * (radius + 1));
    for (const cell of cells) {
      assert.ok(distance(cell, origin) <= radius);
      const point = project(cell);
      assert.equal(unproject(point.x, point.y).key, cell.key);
      assert.equal(distance(cell, cell), 0);
      for (const other of cells)
        assert.equal(distance(cell, other), distance(other, cell));
    }
  }
});
test("all 42 campaign puzzles are deterministic and retain their actual targets in every clue intersection", () => {
  for (let i = 0; i < 42; i++) {
    const config = getMission(i),
      s = generate(config);
    assert.deepEqual(s, generate(config));
    assert.equal(new Set(s.targets.map((t) => t.key)).size, s.targets.length);
    assert.ok(s.cells.length <= 61);
    for (let target = 0; target < s.targets.length; target++) {
      s.active = target;
      const truth = s.targets[target];
      assert.ok(candidates(s).some((c) => c.key === truth.key));
      for (const cell of s.cells) {
        if (cell.key === truth.key) continue;
        const before = s.actions;
        const result = act(s, cell.key);
        assert.ok(!result.error);
        assert.equal(s.actions, before + 1);
        assert.ok(
          candidates(s).some((c) => c.key === truth.key),
          `mission ${i} excluded target after ${cell.key}`,
        );
        if (s.sweepsLeft) {
          act(s, cell.key, "sweep");
          assert.ok(candidates(s).some((c) => c.key === truth.key));
        }
      }
      act(s, truth.key);
      assert.equal(s.targets[target].found, true);
    }
    assert.equal(s.finished, true);
    assert.ok(medal(s) >= 1);
  }
});
test("portals use a one-step shortcut, sweeps remain physical", () => {
  const s = generate(getMission(21)),
    [a, b] = s.portals;
  assert.equal(foldedDistance(a, b, s.portals), 1);
  assert.equal(distance(a, b), s.config.radius * 2);
  s.targets[0] = { ...s.targets[0], ...b };
  assert.deepEqual(resultAt(s, a, 0, "sweep"), {
    kind: "sweep",
    inside: false,
  });
  assert.equal(resultAt(s, a).value, 1);
});
test("pulse channels alternate independently and duplicate readings are free", () => {
  const s = generate(getMission(32));
  for (let index = 0; index < 2; index++) {
    s.active = index;
    const cell = s.cells.find((c) => distance(c, s.targets[index]) > 2);
    const first = act(s, cell.key);
    assert.equal(first.reading.result.kind, "band");
    const count = s.actions;
    assert.equal(act(s, cell.key).repeated, true);
    assert.equal(s.actions, count);
    const next = s.cells.find(
      (c) => c.key !== cell.key && distance(c, s.targets[index]) > 2,
    );
    assert.equal(act(s, next.key).reading.result.kind, "exact");
  }
});
test("classic results report equal distances, and evidence remains truthful", () => {
  const s = generate(challengeConfig("classic-test", 0, "classic")),
    t = s.targets[0];
  const pair = s.cells.filter((c) => distance(c, t) === 2);
  act(s, pair[0].key);
  const second = act(s, pair[1].key);
  assert.equal(second.reading.result.change, "Same distance");
  assert.ok(candidates(s).some((c) => c.key === t.key));
});
test("sweep exhaustion, completed target protection, and final completion", () => {
  const s = generate({ ...getMission(5), sweeps: 1 });
  act(s, "0,0", "sweep");
  assert.ok(act(s, "1,0", "sweep").error);
  act(s, s.targets[0].key);
  assert.ok(act(s, "0,0").error);
  assert.equal(s.finished, false);
  s.active = 1;
  act(s, s.targets[1].key);
  assert.equal(s.finished, true);
});
test("progress import validates and bounds records, preferences, and resume events", () => {
  const clean = sanitize({
    version: 1,
    records: {
      "meadow-1": { best: 3, stars: 500 },
      bogus: { best: 1, stars: 3 },
      "frost-2": { best: -1, stars: 3 },
    },
    settings: { sound: false, guided: "yes" },
    resume: {
      index: 0,
      events: [
        { key: "0,0", target: 0, type: "scan" },
        { key: "<script>", target: 5, type: "evil" },
      ],
    },
  });
  assert.equal(clean.records["meadow-1"].stars, 3);
  assert.equal(Object.keys(clean.records).length, 1);
  assert.equal(clean.settings.sound, false);
  assert.equal(clean.settings.guided, true);
  assert.equal(clean.resume.events.length, 1);
  assert.deepEqual(sanitize({ version: 999 }).records, {});
});
test("gold thresholds are achievable by a deterministic information-gain reference strategy", () => {
  for (let i = 0; i < 42; i++) {
    const s = generate(getMission(i));
    for (let target = 0; target < s.targets.length; target++) {
      s.active = target;
      for (let tries = 0; !s.targets[target].found && tries < 100; tries++) {
        const possible = candidates(s, target),
          used = new Set(
            s.readings
              .filter((r) => r.target === target && r.type === "scan")
              .map((r) => r.cell),
          );
        let best = null,
          bestScore = Infinity;
        for (const cell of s.cells) {
          if (used.has(cell.key)) continue;
          const groups = new Map();
          for (const hypothesis of possible) {
            const fake = {
              ...s,
              targets: s.targets.map((t, j) =>
                j === target ? { ...t, ...hypothesis } : t,
              ),
            };
            const signal = JSON.stringify(resultAt(fake, cell, target));
            groups.set(signal, (groups.get(signal) || 0) + 1);
          }
          const score =
            [...groups.values()].reduce((n, v) => n + v * v, 0) /
              possible.length -
            (possible.some((c) => c.key === cell.key) ? 0.05 : 0);
          if (score < bestScore) {
            best = cell;
            bestScore = score;
          }
        }
        assert.ok(best);
        act(s, best.key);
      }
    }
    assert.ok(s.finished);
    assert.ok(
      s.actions <= s.config.par,
      `${s.config.name}: ${s.actions} > ${s.config.par}`,
    );
  }
});
test("resume replay preserves actions, pulse phase, and multi-explorer completion", () => {
  const config = getMission(32),
    original = generate(config);
  act(original, original.targets[0].key);
  original.active = 1;
  const tile = original.cells.find((c) => distance(c, original.targets[1]) > 2);
  act(original, tile.key);
  const imported = sanitize({
    version: 1,
    records: {},
    resume: {
      index: 32,
      events: original.readings.map((r) => ({
        key: r.cell,
        target: r.target,
        type: r.type,
      })),
      active: 1,
      marks: { "1:0,0": 1, "2:<script>": 2 },
      hints: 1,
      assisted: true,
    },
  }).resume;
  const restored = generate(config);
  for (const e of imported.events) {
    restored.active = e.target;
    act(restored, e.key, e.type);
  }
  assert.equal(restored.actions, original.actions);
  assert.deepEqual(restored.readings, original.readings);
  assert.equal(restored.targets[0].found, true);
  assert.equal(imported.active, 1);
  assert.deepEqual(imported.marks, { "1:0,0": 1 });
});
