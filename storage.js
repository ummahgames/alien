const KEY = "alien-rescue-agency-v1";
export const defaults = () => ({
  version: 1,
  records: {},
  expeditions: {},
  settings: { guided: true, sound: true, motion: true, contrast: false },
  resume: null,
});
export function sanitize(value) {
  const out = defaults();
  if (!value || value.version !== 1) return out;
  for (const [k, v] of Object.entries(value.records || {})) {
    if (
      /^(meadow|frost|dunes|prism|ember|aurora)-[1-7]$/.test(k) &&
      v &&
      Number.isInteger(v.best) &&
      v.best > 0
    )
      out.records[k] = {
        best: v.best,
        stars: Math.max(1, Math.min(3, Math.trunc(Number(v.stars)) || 1)),
        assisted: !!v.assisted,
        cleanStars: Math.max(
          0,
          Math.min(3, Math.trunc(Number(v.cleanStars)) || 0),
        ),
        cleanBest:
          Number.isInteger(v.cleanBest) && v.cleanBest > 0 ? v.cleanBest : null,
      };
  }
  for (const [k, v] of Object.entries(value.expeditions || {}).slice(-30))
    if (
      (k.startsWith("challenge-") ||
        /^practice-(meadow|frost|dunes|prism|ember|aurora)-[1-7]$/.test(k)) &&
      k.length <= 150 &&
      Number.isInteger(v?.best) &&
      v.best > 0
    )
      out.expeditions[k] = {
        best: v.best,
        stars: Math.max(1, Math.min(3, Math.trunc(Number(v.stars)) || 1)),
      };
  for (const k of Object.keys(out.settings))
    if (typeof value.settings?.[k] === "boolean")
      out.settings[k] = value.settings[k];
  if (
    value.resume &&
    Number.isInteger(value.resume.index) &&
    value.resume.index >= 0 &&
    value.resume.index < 42 &&
    Array.isArray(value.resume.events) &&
    value.resume.events.length < 300
  )
    out.resume = {
      index: value.resume.index,
      events: value.resume.events.filter(
        (e) =>
          e &&
          Number.isInteger(e.target) &&
          e.target >= 0 &&
          e.target < 3 &&
          typeof e.key === "string" &&
          /^-?\d+,-?\d+$/.test(e.key) &&
          ["scan", "sweep"].includes(e.type),
      ),
      hints: Math.max(0, Number(value.resume.hints) || 0),
      assisted: !!value.resume.assisted,
      active:
        Number.isInteger(value.resume.active) &&
        value.resume.active >= 0 &&
        value.resume.active < 3
          ? value.resume.active
          : 0,
      marks: Object.fromEntries(
        Object.entries(value.resume.marks || {})
          .filter(
            ([key, v]) =>
              /^[0-2]:-?[0-4],-?[0-4]$/.test(key) && [1, 2].includes(v),
          )
          .slice(0, 183),
      ),
    };
  return out;
}
export function load() {
  try {
    return {
      data: sanitize(JSON.parse(localStorage.getItem(KEY))),
      available: true,
    };
  } catch {
    return { data: defaults(), available: false };
  }
}
export function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
