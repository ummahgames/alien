import { BIOMES, CREW, getMission } from "./data.js";
export function randomFrom(seed) {
  let a = 2166136261;
  for (const c of String(seed)) a = Math.imul(a ^ c.charCodeAt(0), 16777619);
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const keyOf = (c) => `${c.q},${c.r}`;
export const distance = (a, b) =>
  (Math.abs(a.q - b.q) +
    Math.abs(a.r - b.r) +
    Math.abs(a.q + a.r - b.q - b.r)) /
  2;
export function hexes(radius) {
  const out = [];
  for (let q = -radius; q <= radius; q++)
    for (
      let r = Math.max(-radius, -q - radius);
      r <= Math.min(radius, -q + radius);
      r++
    )
      out.push({ q, r, key: `${q},${r}` });
  return out;
}
export function project(c, size = 38) {
  return {
    x: size * Math.sqrt(3) * (c.q + c.r / 2),
    y: size * 1.5 * c.r * 0.76,
  };
}
export function insideHex(x, y, size = 38) {
  const ax = Math.abs(x),
    ay = Math.abs(y) / 0.76;
  return ax <= (Math.sqrt(3) * size) / 2 && ay + ax / Math.sqrt(3) <= size;
}
export function cubeRound(q, r) {
  let x = Math.round(q),
    z = Math.round(r),
    y = Math.round(-q - r);
  const dx = Math.abs(x - q),
    dz = Math.abs(z - r),
    dy = Math.abs(y + q + r);
  if (dx > dy && dx > dz) x = -y - z;
  else if (dz > dy) z = -x - y;
  return { q: x, r: z, key: `${x},${z}` };
}
export function unproject(x, y, size = 38) {
  const r = y / (size * 1.5 * 0.76),
    q = x / (size * Math.sqrt(3)) - r / 2;
  return cubeRound(q, r);
}
export function foldedDistance(a, b, portals) {
  if (!portals?.length) return distance(a, b);
  const [p, q] = portals;
  return Math.min(
    distance(a, b),
    distance(a, p) + 1 + distance(q, b),
    distance(a, q) + 1 + distance(p, b),
  );
}
const DIRECTIONS = ["E", "SE", "SW", "W", "NW", "NE"];
export function bearing(a, b) {
  if (distance(a, b) === 0) return "HERE";
  const p = project(a),
    q = project(b);
  return DIRECTIONS[
    (Math.round(Math.atan2((q.y - p.y) / 0.76, q.x - p.x) / (Math.PI / 3)) +
      6) %
      6
  ];
}
export function generate(config) {
  const rng = randomFrom(config.seed),
    cells = hexes(config.radius),
    biomes = config.planet.biomes;
  const seeds = biomes.map((biome, i) => ({
    ...cells[Math.floor((i * cells.length) / biomes.length)],
    biome,
  }));
  for (const cell of cells) {
    let best = seeds[0];
    for (const s of seeds)
      if (distance(cell, s) < distance(cell, best)) best = s;
    cell.biome = best.biome;
    const props = BIOMES[cell.biome].props;
    cell.prop = rng() < 0.28 ? props[Math.floor(rng() * props.length)] : null;
  }
  const shuffled = [...cells];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const portals =
    config.mode === "echo"
      ? [
          cells.find((c) => c.q === -config.radius && c.r === 0),
          cells.find((c) => c.q === config.radius && c.r === 0),
        ]
      : [];
  const targets = shuffled
    .filter((c) => !portals.some((p) => p.key === c.key))
    .slice(0, config.targets || 1)
    .map((c, i) => ({
      key: c.key,
      q: c.q,
      r: c.r,
      biome: c.biome,
      crew: CREW[(config.index + i) % CREW.length],
      found: false,
    }));
  return {
    config,
    cells,
    targets,
    portals,
    active: 0,
    readings: [],
    marks: {},
    actions: 0,
    sweepsLeft: config.sweeps || 0,
    hints: 0,
    finished: false,
  };
}
export function resultAt(
  session,
  cell,
  targetIndex = session.active,
  type = "scan",
) {
  const target = session.targets[targetIndex],
    physical = distance(cell, target),
    mode = session.config.mode;
  if (type === "sweep") return { kind: "sweep", inside: physical <= 1 };
  if (physical === 0) return { kind: "found", value: 0 };
  const d =
    mode === "echo" ? foldedDistance(cell, target, session.portals) : physical;
  if (mode === "bearing")
    return { kind: "bearing", value: bearing(cell, target) };
  if (mode === "classic") {
    const previous = session.readings
      .filter((r) => r.target === targetIndex && r.type === "scan")
      .at(-1);
    const pd = previous
      ? distance(
          session.cells.find((c) => c.key === previous.cell),
          target,
        )
      : null;
    return {
      kind: "classic",
      tier: d <= 1 ? "Very close" : d <= 3 ? "Near" : "Far",
      change:
        pd === null
          ? "First signal"
          : d < pd
            ? "Warmer"
            : d > pd
              ? "Colder"
              : "Same distance",
    };
  }
  const scans = session.readings.filter(
    (r) => r.target === targetIndex && r.type === "scan",
  ).length;
  if ((mode === "band" || (mode === "pulse" && scans % 2 === 0)) && d > 1) {
    const low = 1 + Math.floor((d - 1) / 2) * 2;
    return { kind: "band", low, high: low + 1 };
  }
  return { kind: "exact", value: d };
}
export function compatible(session, cell, reading) {
  const origin = session.cells.find((c) => c.key === reading.cell),
    r = reading.result;
  if (r.kind === "found") return cell.key === reading.cell;
  if (r.kind === "sweep") return distance(origin, cell) <= 1 === r.inside;
  if (r.kind === "bearing") return bearing(origin, cell) === r.value;
  const d =
    session.config.mode === "echo"
      ? foldedDistance(origin, cell, session.portals)
      : distance(origin, cell);
  if (r.kind === "exact") return d === r.value;
  if (r.kind === "band") return d >= r.low && d <= r.high;
  if (r.kind === "classic") {
    if ((d <= 1 ? "Very close" : d <= 3 ? "Near" : "Far") !== r.tier)
      return false;
    const prev = session.readings
      .filter(
        (x) =>
          x.target === reading.target &&
          x.type === "scan" &&
          x.order < reading.order,
      )
      .at(-1);
    if (!prev) return true;
    const p = distance(
      session.cells.find((c) => c.key === prev.cell),
      cell,
    );
    return (d < p ? "Warmer" : d > p ? "Colder" : "Same distance") === r.change;
  }
  return true;
}
export function candidates(session, targetIndex = session.active) {
  const t = session.targets[targetIndex];
  return session.cells.filter(
    (c) =>
      !session.portals.some((p) => p.key === c.key) &&
      !session.targets.some(
        (other, i) => i !== targetIndex && other.found && other.key === c.key,
      ) &&
      (!session.config.habitat || c.biome === t.biome) &&
      session.readings
        .filter((r) => r.target === targetIndex)
        .every((r) => compatible(session, c, r)),
  );
}
export function act(session, key, type = "scan") {
  if (session.finished || session.targets[session.active].found)
    return { error: "Select an explorer who still needs a rescue." };
  const cell = session.cells.find((c) => c.key === key);
  if (!cell) return { error: "Select a tile on the planet." };
  const existing = session.readings.find(
    (r) => r.target === session.active && r.cell === key && r.type === type,
  );
  if (existing) return { reading: existing, repeated: true };
  if (type === "sweep" && session.sweepsLeft <= 0)
    return { error: "No sweeps left on this mission." };
  if (type === "sweep") session.sweepsLeft--;
  const reading = {
    cell: key,
    target: session.active,
    type,
    order: session.readings.length,
    result: resultAt(session, cell, session.active, type),
  };
  session.readings.push(reading);
  session.actions++;
  if (reading.result.kind === "found") {
    session.targets[session.active].found = true;
    session.finished = session.targets.every((t) => t.found);
  }
  return { reading, finished: session.finished };
}
export function describe(r) {
  if (!r) return "Choose a tile to receive a signal.";
  const x = r.result;
  return x.kind === "found"
    ? "Explorer located. Ready for the ride home!"
    : x.kind === "exact"
      ? `${x.value} hex ${x.value === 1 ? "step" : "steps"} away`
      : x.kind === "band"
        ? `${x.low}–${x.high} hex steps away`
        : x.kind === "bearing"
          ? `Beacon lies ${x.value} of this tile`
          : x.kind === "sweep"
            ? x.inside
              ? "Beacon inside this neighborhood"
              : "Beacon outside this neighborhood"
            : `${x.change} · ${x.tier}`;
}
export function medal(session) {
  return session.actions <= session.config.par
    ? 3
    : session.actions <= session.config.par + 3
      ? 2
      : 1;
}
export function challengeConfig(seed, planetIndex = 0, mode = "exact") {
  const base = getMission(planetIndex * 7 + 4);
  return {
    ...base,
    id: `challenge-${planetIndex}-${mode}-${seed}`,
    seed,
    mode,
    name:
      mode === "classic"
        ? "The classic expedition"
        : "A little unscheduled expedition",
    brief:
      "A reproducible free expedition. Share the link to let a friend explore the same planet.",
    radius: 3,
    targets: 1,
    sweeps: 1,
    habitat: false,
    par: 6,
    challenge: true,
  };
}
