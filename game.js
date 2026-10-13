import {
  PLANETS,
  CREW,
  BIOMES,
  MODE_NAMES,
  TOTAL_MISSIONS,
  getMission,
} from "./data.js";
import {
  generate,
  act,
  candidates,
  describe,
  medal,
  challengeConfig,
  distance,
} from "./engine.js";
import { load, save, sanitize, defaults } from "./storage.js";
import { tone } from "./audio.js";
import { Board } from "./board.js";
const app = document.getElementById("app"),
  modal = document.getElementById("modal"),
  content = document.getElementById("modalContent");
const loaded = load();
let data = loaded.data,
  storageAvailable = loaded.available,
  session = null,
  board = null,
  planetIndex = 0,
  tool = "scan",
  latest = null,
  assets = {},
  assetFailures = 0,
  view = "home",
  toastTimer,
  previousFocus;
const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const $ = (id) => document.getElementById(id);
const completed = () => Object.keys(data.records).length;
const stars = () =>
  Object.values(data.records).reduce((n, r) => n + r.stars, 0);
const starsText = (n) => "★".repeat(n) + "☆".repeat(3 - n);
function nextIndex() {
  for (let i = 0; i < TOTAL_MISSIONS; i++)
    if (!data.records[getMission(i).id]) return i;
  return 41;
}
function unlocked(i) {
  return i === 0 || !!data.records[getMission(i - 1).id];
}
function notify(text) {
  $("announcement").textContent = text;
  $("toast").textContent = text;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 3400);
}
function persist() {
  storageAvailable = save(data);
  if (!storageAvailable && !$("storageWarning"))
    notify(
      "Browser storage is unavailable. You can export progress from Settings.",
    );
  updateHeader();
}
function updateHeader() {
  $("crewCount").textContent = String(completed());
  document.body.classList.toggle("high-contrast", data.settings.contrast);
  document.body.classList.toggle(
    "reduce-motion",
    !data.settings.motion ||
      matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
}
function stopBoard() {
  board?.destroy();
  board = null;
}
function dialog(html) {
  previousFocus = document.activeElement;
  content.innerHTML = html;
  if (!modal.open) modal.showModal();
  content.querySelector("h2")?.setAttribute("id", "dialogTitle");
  modal.setAttribute("aria-labelledby", "dialogTitle");
}
function closeDialog() {
  modal.close();
  previousFocus?.isConnected && previousFocus.focus();
}
$("closeModal").onclick = closeDialog;
modal.addEventListener("click", (e) => {
  if (e.target === modal) {
    const r = modal.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      closeDialog();
  }
});
modal.addEventListener("cancel", () => {
  setTimeout(() => previousFocus?.isConnected && previousFocus.focus(), 0);
});
$("homeButton").onclick = () => home();
$("atlasButton").onclick = () => atlas();
$("journalButton").onclick = () => journal();
$("settingsButton").onclick = () => settings();
function planetOrb(p, cls = "") {
  return `<div class="planet-orb ${cls} orb-${p.id}" style="--planet:${p.color};--planet-dark:${p.dark}" aria-hidden="true"><span class="orb-shine"></span><span class="orb-land land-one"></span><span class="orb-land land-two"></span><span class="orb-land land-three"></span><span class="orb-ring"></span></div>`;
}
function home() {
  stopBoard();
  window.scrollTo(0, 0);
  view = "home";
  const next = getMission(nextIndex()),
    done = completed() === 42,
    dailyRecord = data.expeditions[dailyConfig().id];
  app.innerHTML = `
 <section class="home-hero"><div class="hero-copy"><p class="eyebrow"><span class="status-dot"></span> AN INDEPENDENT LITTLE SPACE AGENCY</p><h1>Small planets.<br><em>Big discoveries.</em></h1><p class="hero-description">Somewhere out there, a little explorer needs a ride home. Follow the signals. Find your people.</p><div class="hero-actions"><button class="button primary" id="launchButton">${done ? "Explore again" : data.resume ? "Continue rescue" : completed() ? "Continue expedition" : "Begin the expedition"} <span>↗</span></button><button class="text-button" id="browseButton">Explore the atlas <span>→</span></button></div><div class="hero-facts"><span><strong>06</strong> planets</span><span><strong>42</strong> missions</span><span><strong>∞</strong> curiosity</span></div></div>
 <div class="hero-space"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><span class="space-label">RESCUE SECTOR / 06</span>${planetOrb(PLANETS[0], "hero-orb")}<div class="satellite">${planetOrb(PLANETS[3])}</div><div class="hero-crew"><img src="tiles/alienGreen.png" alt="Pip the botanist"><span><b>Pip</b><small>Awaiting a little lift.</small></span><span class="signal-bars">▂▄▆</span></div><span class="coordinate">Q 0 / R 0<br>ALL SIGNALS WELCOME</span><span class="tiny-star star-one">✦</span><span class="tiny-star star-two">✧</span><span class="tiny-star star-three">·</span></div></section>
 <section class="home-bottom"><div><p class="eyebrow">YOUR FLIGHT LOG</p><p class="progress-copy">${done ? "Everyone is home. The stars are still calling." : completed() ? `${completed()} rescues complete. ${next.planet.name} is calling.` : "No rush. No danger. Just a good little mystery."}</p></div><div class="home-progress"><span>${completed()} / 42 missions</span><div class="progress-track"><div style="width:${(completed() / 42) * 100}%"></div></div><span class="muted">${stars()} / 126 stars</span></div></section>
 <section class="extra-expeditions"><button class="expedition-card" id="dailyButton"><span class="eyebrow">ONE SHARED SKY</span><strong>Today’s little rescue <span>↗</span></strong><span>${dailyRecord ? `Today’s best: ${dailyRecord.best} actions · ${starsText(dailyRecord.stars)}` : "A fresh, date-seeded puzzle. The same sky for everyone."}</span></button><button class="expedition-card" id="freeButton"><span class="eyebrow">TAKE THE SCENIC ROUTE</span><strong>Free expedition <span>↗</span></strong><span>Pick a planet. Try a signal. Follow your curiosity.</span></button></section>
 <footer><span>Made for curious humans of all ages.</span><span>Client-side · Offline friendly · No account</span></footer>`;
  $("launchButton").onclick = () =>
    data.resume ? resume() : briefing(next.index);
  $("browseButton").onclick = () => atlas();
  $("dailyButton").onclick = () => daily();
  $("freeButton").onclick = () => freeDialog();
  updateHeader();
}
function atlas(p = planetIndex) {
  stopBoard();
  window.scrollTo(0, 0);
  view = "atlas";
  planetIndex = p;
  const planet = PLANETS[p],
    planetDone = planet.missions.filter(
      (_, i) => data.records[getMission(p * 7 + i).id],
    ).length;
  app.innerHTML = `
 <section class="atlas-heading"><div><p class="eyebrow">THE EXPEDITION ATLAS</p><h1>Six worlds.<br><em>One way home.</em></h1></div><div class="atlas-total"><strong>${completed().toString().padStart(2, "0")}</strong><span>of 42 missions complete<br>${stars()} stars collected</span></div></section>
 <div class="planet-tabs" role="group" aria-label="Choose a planet">${PLANETS.map((x, i) => `<button class="planet-tab ${i === p ? "selected" : ""}" data-planet="${i}" aria-pressed="${i === p}">${planetOrb(x)}<span><small>0${i + 1}</small>${x.name}</span><span class="planet-status">${x.missions.filter((_, j) => data.records[getMission(i * 7 + j).id]).length}/7</span></button>`).join("")}</div>
 <section class="planet-detail" style="--planet:${planet.color}"><div class="planet-intro"><p class="eyebrow">${planet.tag}</p><h2>${planet.name}</h2><p>${planet.description}</p><div class="planet-tags"><span>${planet.mechanic}</span><span>${planetDone} / 7 rescued</span></div>${planetOrb(planet, "detail-orb")}</div><div class="mission-list">${planet.missions
   .map((m, i) => {
     const idx = p * 7 + i,
       record = data.records[getMission(idx).id],
       open = unlocked(idx);
     return `<button class="mission-row ${record ? "complete" : ""} ${!open ? "locked" : ""}" data-mission="${idx}" aria-label="Mission ${i + 1}: ${m.name}. ${record ? "Completed, " + record.stars + " stars" : open ? "Ready to play" : "Locked; complete the previous mission"}"><span class="mission-number">${record ? "✓" : String(i + 1).padStart(2, "0")}</span><span class="mission-name">${m.name}<small>${MODE_NAMES[m.mode]}${m.targets > 1 ? ` · ${m.targets} explorers` : ""}</small></span><span class="mission-end">${record ? `<span class="star-rating">${starsText(record.stars)}</span><small>${record.best} actions${record.cleanBest ? ` · ${record.cleanBest} independent` : " · assisted"}</small>` : open ? "↗" : "⌑"}</span></button>`;
   })
   .join(
     "",
   )}</div></section><footer><span>Complete a mission to unlock the next. Stars are a bonus, never a gate.</span><button class="text-button" id="freeAtlas">Take a free expedition ↗</button></footer>`;
  app
    .querySelectorAll("[data-planet]")
    .forEach((b) => (b.onclick = () => atlas(Number(b.dataset.planet))));
  app.querySelectorAll("[data-mission]").forEach(
    (b) =>
      (b.onclick = () => {
        const i = Number(b.dataset.mission);
        if (unlocked(i)) briefing(i);
        else
          notify(
            "Complete the previous mission to open this route. All six planets are available in Free expedition.",
          );
      }),
  );
  $("freeAtlas").onclick = freeDialog;
  updateHeader();
}
function briefing(indexOrConfig) {
  const c =
    typeof indexOrConfig === "number"
      ? getMission(indexOrConfig)
      : indexOrConfig;
  dialog(
    `<p class="eyebrow">${c.challenge ? "FREE FLIGHT" : `${c.planet.name.toUpperCase()} / MISSION ${c.number + 1} OF 7`}</p><h2>${c.name}</h2><p class="dialog-lead">${c.brief}</p>${data.records[c.id] ? `<p class="mission-record">Best: ${data.records[c.id].best} actions · Independent best: ${data.records[c.id].cleanBest ?? "not yet recorded"}</p>` : ""}<div class="brief-specs"><span>${MODE_NAMES[c.mode]}</span><span>${c.targets || 1} explorer${(c.targets || 1) > 1 ? "s" : ""}</span><span>${c.sweeps || 0} sweeps</span></div><p class="muted">Every explorer stays put. Every signal is true. You can always finish, however many scans you need.</p><button class="button primary full" id="beginMission">Let’s bring them home ↗</button>`,
  );
  $("beginMission").onclick = () => {
    closeDialog();
    start(c);
  };
}
function start(config, restored = null) {
  stopBoard();
  window.scrollTo(0, 0);
  view = "play";
  tool = "scan";
  latest = null;
  session = generate(config);
  session.assisted = data.settings.guided || !!config.tutorial;
  if (restored) {
    for (const event of restored.events) {
      if (session.targets[event.target]) {
        session.active = event.target;
        act(session, event.key, event.type);
      }
    }
    session.hints = restored.hints;
    session.marks = restored.marks || {};
    session.assisted ||= restored.assisted;
    session.active =
      session.targets[restored.active] &&
      !session.targets[restored.active].found
        ? restored.active
        : Math.max(
            0,
            session.targets.findIndex((t) => !t.found),
          );
    latest = session.readings.filter((r) => r.target === session.active).at(-1);
  }
  const p = config.planet;
  document.documentElement.style.setProperty("--mission-color", p.color);
  app.innerHTML = `
 <section class="play-heading"><div><button class="back-link" id="backAtlas">← Flight atlas</button><p class="eyebrow">${config.challenge ? "UNSCHEDULED EXPEDITION" : `${p.name.toUpperCase()} / ${config.number + 1} OF 7`}</p><h1>${config.name}</h1></div><div class="mission-stats"><span><b id="actionCount">0</b> actions</span><span class="muted">★ goal: ${config.par}</span><button id="outcomeButton" class="text-button" hidden>Flight result ↗</button><button id="helpButton" class="icon-button" aria-label="How to play">?</button></div></section>
 <section class="play-layout"><div class="board-column"><div class="board-chrome"><span id="boardStatus">${MODE_NAMES[config.mode]}</span><div><button class="mini-button" id="zoomOut" aria-label="Zoom out">−</button><button class="mini-button" id="fitBoard">Fit</button><button class="mini-button" id="zoomIn" aria-label="Zoom in">+</button></div></div><div class="mobile-signal" aria-live="polite"><span id="mobileSignalLabel">SCANNER READY</span><strong id="mobileSignal">Choose a tile to listen.</strong></div><div class="board-field"><canvas id="gameCanvas" tabindex="0" aria-label="Planet hex board. Arrow keys move, Q and E move diagonally, Enter scans, Home fits the board."></canvas><span class="board-coordinate" id="coordinate">Q 0 / R 0</span><span class="board-caption">${p.name.toUpperCase()}<br>RESCUE SURVEY / ${config.radius === 1 ? "07" : 1 + 3 * config.radius * (config.radius + 1)} TILES</span></div><div class="tool-tray" role="group" aria-label="Scanner tools"><button class="tool selected" data-tool="scan" aria-pressed="true"><span>⌖</span> Scan</button><button class="tool" data-tool="mark" aria-pressed="false"><span>⚑</span> Mark</button><button class="tool" data-tool="sweep" aria-pressed="false"><span>◎</span> Sweep <small id="sweepCount">${session.sweepsLeft}</small></button><button class="tool" id="hintButton"><span>✧</span> Hint</button></div><p class="board-instruction" id="toolInstruction">Tap a tile to scan · Drag to explore · Pinch or scroll to zoom</p></div>
 <aside class="notebook"><p class="eyebrow">YOUR RESCUE NOTEBOOK</p><div class="beacon-tabs" id="beaconTabs"></div><div class="signal-card"><div class="signal-label"><span class="status-dot"></span><span id="signalLabel">SCANNER READY</span></div><strong id="signalReading">A little signal, somewhere.</strong><p id="signalExplanation">Choose a tile to listen.</p></div><div id="fieldReport" class="field-report"></div><label class="guided-switch"><span>Show possible locations<small>Helpful overlay · assisted record</small></span><input id="guidedToggle" type="checkbox" ${guided() ? "checked" : ""}></label><p class="candidate-count" id="candidateCount"></p><div class="history-heading"><h2>Signal trail</h2><span id="readingCount">0 readings</span></div><ol class="reading-list" id="readingList"></ol><div class="mission-options"><button id="retryButton">Retry mission</button><button id="shareButton">Share puzzle ↗</button></div></aside></section>
 <details class="accessible-board"><summary>Accessible tile controls & keyboard help</summary><p>Arrow keys move on the canvas; Q / E move diagonally; Enter or Space uses the selected tool. You can also use these tile buttons. Marks never cost an action.</p><div id="accessibleTiles" class="accessible-tiles"></div></details>`;
  $("outcomeButton").onclick = finish;
  $("backAtlas").onclick = () => atlas(Math.floor(config.index / 7));
  $("helpButton").onclick = help;
  $("zoomOut").onclick = () => board.zoomAt(0.85);
  $("zoomIn").onclick = () => board.zoomAt(1.18);
  $("fitBoard").onclick = () => board.fit();
  app
    .querySelectorAll("[data-tool]")
    .forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));
  $("hintButton").onclick = hint;
  $("retryButton").onclick = () => retry();
  $("shareButton").onclick = share;
  $("guidedToggle").onchange = (e) => {
    data.settings.guided = e.target.checked;
    if (e.target.checked) session.assisted = true;
    persist();
    updatePlay();
  };
  board = new Board($("gameCanvas"), session, assets, {
    onSelect: select,
    onFocus: (cell) => {
      $("coordinate").textContent =
        `Q ${cell.q} / R ${cell.r} · ${BIOMES[cell.biome].name}`;
      announce(`Tile ${cell.q}, ${cell.r}. ${BIOMES[cell.biome].name}.`);
    },
    guided,
    contrast: () => data.settings.contrast,
    motion: () =>
      data.settings.motion &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches,
  });
  updatePlay();
  saveResume();
  if (restored && session.finished) finish();
}
function guided() {
  return data.settings.guided || !!session?.config.tutorial;
}
function announce(text) {
  $("announcement").textContent = text;
}
function setTool(value) {
  tool = value;
  app.querySelectorAll("[data-tool]").forEach((b) => {
    const on = b.dataset.tool === value;
    b.classList.toggle("selected", on);
    b.setAttribute("aria-pressed", String(on));
  });
  $("toolInstruction").textContent =
    value === "mark"
      ? "Tap to pin (?) · Tap again to exclude (×) · Tap again to clear"
      : value === "sweep"
        ? "Choose a tile: sweep tests that tile and its six neighbors"
        : "Tap a tile to scan · Drag to explore · Pinch or scroll to zoom";
}
function select(key) {
  if (!session || session.finished) return;
  const cell = session.cells.find((c) => c.key === key);
  if (!cell) return;
  $("coordinate").textContent =
    `Q ${cell.q} / R ${cell.r} · ${BIOMES[cell.biome].name}`;
  if (tool === "mark") {
    const k = `${session.active}:${key}`;
    session.marks[k] = ((session.marks[k] || 0) + 1) % 3;
    announce(
      `${session.marks[k] === 1 ? "Candidate marked" : session.marks[k] === 2 ? "Tile excluded" : "Mark cleared"} at ${key}.`,
    );
    updatePlay();
    saveResume();
    return;
  }
  const result = act(session, key, tool);
  if (result.error) {
    notify(result.error);
    return;
  }
  latest = result.reading;
  if (!result.repeated) {
    tone(latest.result.kind === "found" ? "rescue" : tool, data.settings.sound);
    board.flash(key, latest.result.kind === "found");
  }
  const name = session.targets[latest.target].crew.name;
  announce(`${name}: ${describe(latest)}. ${session.actions} actions.`);
  updatePlay();
  saveResume();
  if (result.finished) {
    finish();
    return;
  }
  if (latest.result.kind === "found") {
    notify(`${name} is ready to come home. Switch to the next beacon.`);
    session.active = session.targets.findIndex((t) => !t.found);
    latest =
      session.readings.filter((r) => r.target === session.active).at(-1) ||
      null;
    updatePlay();
  }
}
function badge(reading) {
  const r = reading.result;
  return r.kind === "found"
    ? "✓"
    : r.kind === "exact"
      ? r.value
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
}
function updatePlay() {
  if (view !== "play" || !session) return;
  const focusedTile = document.activeElement?.dataset.cell;
  const s = session,
    t = s.targets[s.active],
    list = s.readings.filter((r) => r.target === s.active),
    possible = candidates(s);
  $("outcomeButton").hidden = !s.finished;
  $("boardStatus").textContent = s.finished
    ? "EVERYONE IS SAFELY ABOARD"
    : MODE_NAMES[s.config.mode];
  $("mobileSignal").textContent = latest
    ? describe(latest)
    : `${t.crew.name}: choose a tile to listen.`;
  $("mobileSignalLabel").textContent = latest
    ? `SIGNAL FROM ${latest.cell}`
    : "SCANNER READY";
  $("actionCount").textContent = s.actions;
  $("sweepCount").textContent = s.sweepsLeft;
  $("signalReading").textContent = latest
    ? describe(latest)
    : `${t.crew.name} is out there.`;
  $("signalLabel").textContent = latest
    ? latest.type === "sweep"
      ? "SECTOR SWEEP"
      : "BEACON RECEIVED"
    : "SCANNER READY";
  $("signalExplanation").textContent = latest
    ? `From tile ${latest.cell}. ${latest.result.kind === "found" ? "A little miracle." : s.config.mode === "echo" ? "Distance can travel through gates A and B." : latest.result.kind === "band" ? "Any distance in this range is possible." : latest.result.kind === "bearing" ? "Direction uses the map compass: E, SE, SW, W, NW, NE." : "Compare this with your earlier readings."}`
    : "Choose a tile to listen. All explorers stay in one place.";
  $("beaconTabs").innerHTML = s.targets
    .map(
      (x, i) =>
        `<button class="beacon-tab ${i === s.active ? "selected" : ""}" data-beacon="${i}" aria-pressed="${i === s.active}"><img src="tiles/${x.crew.file}" alt=""><span>${x.crew.name}<small>${x.found ? "Rescued ✓" : "Signal active"}</small></span></button>`,
    )
    .join("");
  $("beaconTabs")
    .querySelectorAll("[data-beacon]")
    .forEach(
      (b) =>
        (b.onclick = () => {
          s.active = Number(b.dataset.beacon);
          latest =
            s.readings.filter((r) => r.target === s.active).at(-1) || null;
          updatePlay();
          saveResume();
        }),
    );
  $("fieldReport").innerHTML =
    `<span class="eyebrow">FIELD REPORT</span><p>${s.config.habitat ? `<b>${t.crew.name}</b> is hiding on <b>${BIOMES[t.biome].name}</b> terrain.` : "No habitat restriction. Any tile could hold an explorer."}${s.config.mode === "echo" ? "<br>Gates A ↔ B cost one signal step. Gates do not hold explorers; sweeps stay physical." : ""}${s.config.mode === "pulse" ? `<br>Next scan: <b>${list.filter((r) => r.type === "scan").length % 2 === 0 ? "distance band" : "exact distance"}</b>.` : ""}</p>`;
  $("guidedToggle").checked = guided();
  $("guidedToggle").disabled = !!s.config.tutorial;
  $("candidateCount").textContent = guided()
    ? `${possible.length} possible location${possible.length === 1 ? "" : "s"} for ${t.crew.name}`
    : "Overlay off. Follow the evidence in your notebook.";
  $("readingCount").textContent =
    `${list.length} reading${list.length === 1 ? "" : "s"}`;
  $("readingList").innerHTML = list.length
    ? [...list]
        .reverse()
        .map(
          (r) =>
            `<li><button data-reading="${r.order}" aria-label="${esc(describe(r))}, tile ${r.cell}"><span class="reading-badge">${badge(r)}</span><span>${describe(r)}<small>Q ${r.cell.split(",")[0]} / R ${r.cell.split(",")[1]} · ${r.type}</small></span></button></li>`,
        )
        .join("")
    : '<li class="empty-trail">Every good discovery starts with a little listening.</li>';
  $("readingList")
    .querySelectorAll("[data-reading]")
    .forEach(
      (b) =>
        (b.onclick = () => {
          latest = s.readings[Number(b.dataset.reading)];
          board.center(latest.cell);
          updatePlay();
        }),
    );
  const sweepButton = app.querySelector('[data-tool="sweep"]');
  sweepButton.disabled = s.sweepsLeft === 0;
  if (tool === "sweep" && s.sweepsLeft === 0) setTool("scan");
  $("accessibleTiles").innerHTML = s.cells
    .map((c) => {
      const r = list.filter((r) => r.cell === c.key).at(-1),
        mark = s.marks[`${s.active}:${c.key}`];
      return `<button data-cell="${c.key}" aria-label="Tile ${c.q}, ${c.r}; ${BIOMES[c.biome].name}; ${r ? esc(describe(r)) : "unscanned"}${mark === 1 ? "; marked candidate" : mark === 2 ? "; marked excluded" : ""}">${c.key}<small>${r ? badge(r) : BIOMES[c.biome].name}</small></button>`;
    })
    .join("");
  $("accessibleTiles")
    .querySelectorAll("[data-cell]")
    .forEach((b) => (b.onclick = () => select(b.dataset.cell)));
  if (focusedTile)
    Array.from($("accessibleTiles").querySelectorAll("[data-cell]"))
      .find((b) => b.dataset.cell === focusedTile)
      ?.focus({ preventScroll: true });
  board?.invalidate();
  updateHeader();
}
function saveResume() {
  if (!session.config.challenge && !session.finished) {
    data.resume = {
      index: session.config.index,
      events: session.readings.map((r) => ({
        key: r.cell,
        target: r.target,
        type: r.type,
      })),
      hints: session.hints,
      assisted: session.assisted,
      marks: session.marks,
      active: session.active,
    };
    persist();
  }
}
function resume() {
  const r = data.resume;
  if (!r) return briefing(nextIndex());
  start(getMission(r.index), r);
}
function retry() {
  dialog(
    `<p class="eyebrow">SAME PLANET, FRESH NOTEBOOK</p><h2>Try a different route?</h2><p>Restart this exact puzzle with zero actions. Your completed records stay safe.</p><button class="button primary full" id="confirmRetry">Restart mission</button>`,
  );
  $("confirmRetry").onclick = () => {
    const config = session.config;
    closeDialog();
    start(config);
  };
}
function hint() {
  if (session.finished) return;
  session.hints++;
  session.assisted = true;
  const possible = candidates(session),
    count = possible.length,
    t = session.targets[session.active];
  let text;
  if (count === 1)
    text = `Only tile ${possible[0].key} matches all the evidence for ${t.crew.name}. Scan it to make the rescue.`;
  else if (session.config.habitat && session.readings.length === 0)
    text = `Start on ${BIOMES[t.biome].name} terrain. The field report already rules out other landscapes.`;
  else if (session.hints % 2 === 1)
    text = `${count} tiles match the evidence. Scan from a different side of the board to split the possibilities.${session.config.mode === "echo" ? " Remember the portal shortcut." : ""}`;
  else {
    const current = session.cells.find((c) => c.key === "0,0"),
      choice = possible.reduce((a, b) =>
        distance(a, current) > distance(b, current) ? a : b,
      );
    text = `Try tile ${choice.key}. It is consistent with the clues; scanning there will give you another useful reading.`;
  }
  dialog(
    `<p class="eyebrow">A LITTLE HELP FROM MISSION CONTROL</p><h2>Follow the evidence.</h2><p class="dialog-lead">${text}</p><p class="muted">Hints mark this attempt as assisted. You can still earn stars and unlock every mission.</p><button class="button primary full" id="backFromHint">Back to the planet</button>`,
  );
  $("backFromHint").onclick = closeDialog;
  saveResume();
}
function finish() {
  const s = session,
    n = medal(s);
  if (!s.config.challenge) {
    const old = data.records[s.config.id];
    data.records[s.config.id] = {
      best: Math.min(old?.best ?? Infinity, s.actions),
      stars: Math.max(old?.stars || 0, n),
      cleanStars: s.assisted
        ? old?.cleanStars || 0
        : Math.max(old?.cleanStars || 0, n),
      assisted: (old?.assisted ?? true) && s.assisted,
      cleanBest: s.assisted
        ? old?.cleanBest || null
        : Math.min(old?.cleanBest ?? Infinity, s.actions),
    };
    data.resume = null;
    persist();
  } else {
    const old = data.expeditions[s.config.id];
    data.expeditions[s.config.id] = {
      best: Math.min(old?.best ?? Infinity, s.actions),
      stars: Math.max(old?.stars || 0, n),
    };
    data.expeditions = Object.fromEntries(
      Object.entries(data.expeditions).slice(-30),
    );
    persist();
  }
  const all = !s.config.challenge && completed() === 42,
    next = s.config.index + 1;
  dialog(
    `<p class="eyebrow">${all ? "THE WHOLE SKY IS HOME" : "MISSION COMPLETE / ALL EXPLORERS RESCUED"}</p><div class="result-crew">${s.targets.map((t) => `<img src="tiles/${t.crew.file}" alt="${t.crew.name}">`).join("")}</div><h2>${all ? "Forty-two little miracles." : "Everyone gets a ride home."}</h2><p class="dialog-lead">${all ? "Six planets. Forty-two rescues. A universe made a little kinder. Your expedition is complete." : `${s.targets.map((t) => t.crew.name).join(", ")} ${s.targets.length > 1 ? "are" : "is"} safely aboard. A good day for a little space agency.`}</p><div class="result-stars" aria-label="${n} of 3 stars">${starsText(n)}</div><div class="result-meta"><span><b>${s.actions}</b> actions</span><span><b>${s.config.par}</b> gold goal</span><span>${s.assisted ? "Assisted flight" : "Independent flight"}</span></div><p class="muted">${n === 3 ? "An exceptionally tidy rescue." : `Every rescue counts. ${n === 2 ? "Gold" : "Silver"} is within ${n === 2 ? s.config.par : s.config.par + 3} actions on a replay.`}</p><div class="result-actions"><button class="button primary" id="nextMission">${s.config.challenge ? "Another expedition" : next < 42 ? "Next mission ↗" : "Explore the atlas ↗"}</button><button class="button secondary" id="resultAtlas">Flight atlas</button><button class="text-button" id="replayResult">Replay this mission</button></div>`,
  );
  $("nextMission").onclick = () => {
    closeDialog();
    if (s.config.challenge) freeDialog();
    else if (next < 42) briefing(next);
    else atlas(5);
  };
  $("resultAtlas").onclick = () => {
    closeDialog();
    atlas(Math.floor(s.config.index / 7));
  };
  $("replayResult").onclick = () => {
    closeDialog();
    start(s.config);
  };
}
function journal() {
  dialog(
    `<p class="eyebrow">THE PEOPLE BEHIND THE SIGNALS</p><h2>Your little crew log.</h2><p class="dialog-lead">${completed()} missions complete. ${stars()} stars. A few very good traveling companions.</p><div class="crew-grid">${CREW.map(
      (crew) => {
        const met = Object.keys(data.records).some((id) => {
          const idx =
            PLANETS.findIndex((p) => id.startsWith(p.id + "-")) * 7 +
            Number(id.split("-").at(-1)) -
            1;
          return generate(getMission(idx)).targets.some(
            (t) => t.crew.name === crew.name,
          );
        });
        return `<article class="crew-card ${met ? "" : "unmet"}"><img src="tiles/${crew.file}" alt="${crew.name}"><div><p class="eyebrow">${met ? "RESCUED EXPLORER" : "A FUTURE FRIEND"}</p><h3>${crew.name}</h3><small>${crew.role}</small><p>${crew.note}</p></div></article>`;
      },
    ).join(
      "",
    )}</div><p class="muted">Revisit completed missions in the atlas to improve your flight records.</p>`,
  );
}
function help() {
  dialog(
    `<p class="eyebrow">THE AGENCY FIELD MANUAL</p><h2>A little listening goes a long way.</h2><div class="help-list"><p><b>Scan</b> a tile to hear the active explorer. A number is hex distance; a range includes every number between its ends. A compass bearing points into a six-way sector.</p><p><b>Compare</b> readings. An explorer stays put, and its hiding place must satisfy every clue. Guided mode dims impossible locations.</p><p><b>Mark</b> candidates freely: ? → × → clear. A <b>Sweep</b> tests a tile and its six immediate neighbors. Both a scan and a sweep cost one action.</p><p><b>Portal signals</b> may use gates A ↔ B for one step. Sweeps always use physical neighbors.</p><p><b>Pulse signals</b> alternate band / exact separately for each explorer. Reopening a reading and switching channels cost nothing.</p><p><b>Classic signals</b> show Near / Far / Very close plus a comparison to the previous scan. Equal distances are reported explicitly.</p><p><b>Play your way.</b> Stars reward efficiency; finishing always opens the next mission. Hints and guided mode affect record labeling, never progression.</p><p><b>Controls.</b> Tap to act, drag to pan, pinch or scroll to zoom. Arrow keys navigate; Q / E move diagonally; Enter scans; Home fits. Accessible tile buttons are below the board.</p></div><button class="button primary full" id="closeHelp">Ready to listen</button>`,
  );
  $("closeHelp").onclick = closeDialog;
}
function settings() {
  dialog(
    `<p class="eyebrow">MAKE YOURSELF AT HOME</p><h2>Flight preferences.</h2><div class="settings-list">${[
      [
        "guided",
        "Guided overlay",
        "Dim tiles that cannot match the evidence. Attempts using it are assisted.",
      ],
      [
        "sound",
        "Signal sounds",
        "Soft scanner tones and a little rescue melody.",
      ],
      [
        "motion",
        "Gentle animations",
        "Scanner ripples and a short rescue celebration.",
      ],
      [
        "contrast",
        "High-contrast clues",
        "Stronger dimming and explicit exclusion symbols.",
      ],
    ]
      .map(
        ([key, label, description]) =>
          `<label class="setting-row"><span><b>${label}</b><small>${description}</small></span><input type="checkbox" data-setting="${key}" ${data.settings[key] ? "checked" : ""}></label>`,
      )
      .join(
        "",
      )}</div><p class="storage-note" id="storageWarning">${storageAvailable ? "Progress is saved on this browser. Export a backup to move it to another device." : "Storage is unavailable. Export progress before closing this tab."}</p><div class="backup-actions"><button class="button secondary" id="exportSave">Export progress</button><label class="button secondary import-label">Import progress<input type="file" id="importSave" accept="application/json,.json"></label></div><button class="danger-link" id="resetSave">Reset flight log</button>`,
  );
  content.querySelectorAll("[data-setting]").forEach(
    (input) =>
      (input.onchange = () => {
        const key = input.dataset.setting;
        data.settings[key] = input.checked;
        if (key === "guided" && input.checked && session)
          session.assisted = true;
        persist();
        updatePlay();
      }),
  );
  $("exportSave").onclick = () => {
    const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = "alien-flight-log.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  $("importSave").onchange = async (e) => {
    try {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 250000) throw Error("Too large");
      const raw = JSON.parse(await file.text());
      if (raw.version !== 1 || !raw.records) throw Error("Invalid");
      data = sanitize(raw);
      persist();
      closeDialog();
      home();
      notify("Flight log imported. Welcome back.");
    } catch {
      notify("That file is not a valid Alien flight log.");
    }
  };
  $("resetSave").onclick = () => {
    dialog(
      `<p class="eyebrow">A FRESH START</p><h2>Reset this flight log?</h2><p>This clears local campaign records, saved missions, and preferences. Export a backup first if you want to keep them.</p><div class="backup-actions"><button class="button secondary" id="cancelReset">Keep my log</button><button class="button primary" id="confirmReset">Reset local progress</button></div>`,
    );
    $("cancelReset").onclick = settings;
    $("confirmReset").onclick = () => {
      data = defaults();
      session = null;
      persist();
      closeDialog();
      home();
      notify("A fresh notebook. A whole sky ahead.");
    };
  };
}
function freeDialog() {
  dialog(
    `<p class="eyebrow">YOUR OWN LITTLE DETOUR</p><h2>Where shall we listen?</h2><div class="free-form"><label>Planet<select id="freePlanet">${PLANETS.map((p, i) => `<option value="${i}">${p.name}</option>`).join("")}</select></label><label>Signal<select id="freeMode">${Object.entries(
      MODE_NAMES,
    )
      .map(([k, v]) => `<option value="${k}">${v}</option>`)
      .join(
        "",
      )}</select></label><label>Puzzle seed<input id="freeSeed" maxlength="64" value="${esc(randomSeed())}" placeholder="Any word or number"></label></div><p class="muted">The same seed, planet, and signal always create the same puzzle. Free expeditions leave campaign progress intact.</p><button class="button primary full" id="launchFree">Launch free expedition ↗</button>`,
  );
  $("launchFree").onclick = () => {
    const c = challengeConfig(
      $("freeSeed").value.trim() || "little-miracle",
      Number($("freePlanet").value),
      $("freeMode").value,
    );
    closeDialog();
    briefing(c);
  };
}
function randomSeed() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return `flight-${values[0].toString(36)}`;
}
function dailyConfig() {
  const date = new Date().toISOString().slice(0, 10),
    day = Math.floor(Date.now() / 86400000),
    p = day % 6,
    modes = ["exact", "band", "bearing", "echo", "pulse"];
  const c = challengeConfig(`daily-v1-${date}`, p, modes[day % 5]);
  c.name = `The daily rescue · ${date}`;
  c.brief =
    "One fresh rescue every UTC day. Everyone gets the same planet, signal, and hiding place. Play at your own pace.";
  return c;
}
function daily() {
  briefing(dailyConfig());
}
async function share() {
  const c = session.config,
    u = new URL(location.href);
  u.hash = "";
  u.search = "";
  if (c.challenge) {
    u.searchParams.set("seed", c.seed);
    u.searchParams.set("planet", String(PLANETS.indexOf(c.planet)));
    u.searchParams.set("signal", c.mode);
  } else u.searchParams.set("mission", String(c.index + 1));
  try {
    await navigator.clipboard.writeText(u.href);
    notify("Puzzle link copied. No progress or personal data is included.");
  } catch {
    dialog(
      `<p class="eyebrow">SAME SKY, ANOTHER EXPLORER</p><h2>Share this puzzle.</h2><label class="share-label">Puzzle link<input readonly value="${esc(u.href)}" id="shareLink"></label><p class="muted">Copy this link. A friend can play this puzzle without changing their campaign progress.</p>`,
    );
    $("shareLink").select();
  }
}
async function preload() {
  const files = [
    ...new Set([
      ...Object.values(BIOMES).flatMap((b) => b.props),
      ...CREW.map((c) => c.file),
    ]),
  ];
  await Promise.all(
    files.map(
      (file) =>
        new Promise((resolve) => {
          const image = new Image();
          image.onload = () => {
            assets[file] = image;
            resolve();
          };
          image.onerror = () => {
            assetFailures++;
            resolve();
          };
          image.src = `tiles/${file}`;
        }),
    ),
  );
}
await preload();
home();
if (assetFailures)
  notify(
    "Some scenery could not load. The scanner and all missions still work.",
  );
const query = new URLSearchParams(location.search);
if (query.has("seed")) {
  const p = Number(query.get("planet")),
    mode = query.get("signal");
  if (Number.isInteger(p) && p >= 0 && p < 6 && MODE_NAMES[mode])
    briefing(challengeConfig(query.get("seed").slice(0, 64), p, mode));
} else if (query.has("mission")) {
  const i = Number(query.get("mission")) - 1;
  if (Number.isInteger(i) && i >= 0 && i < 42) {
    const c = getMission(i);
    c.challenge = true;
    c.id = `practice-${c.id}`;
    c.brief +=
      " This shared mission is a practice flight; your campaign remains unchanged.";
    briefing(c);
  }
}
if (
  "serviceWorker" in navigator &&
  ["http:", "https:"].includes(location.protocol)
)
  navigator.serviceWorker.register("./sw.js").catch(() => {});
