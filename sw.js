const CACHE = "alien-agency-v1";
const SHELL = [
  "./",
  "index.html",
  "styles.css",
  "game.js",
  "data.js",
  "engine.js",
  "board.js",
  "storage.js",
  "audio.js",
  "icon.svg",
  "manifest.webmanifest",
];
const ASSETS = [
  "treeGreen_low.png",
  "flowerRed.png",
  "bushGrass.png",
  "waveWater.png",
  "pineBlue_low.png",
  "smallRockSnow.png",
  "bushSnow.png",
  "smallRockStone.png",
  "rockStone_moss1.png",
  "treeCactus_1.png",
  "treeCactus_2.png",
  "bushSand.png",
  "treeAutumn_low.png",
  "flowerYellow.png",
  "bushAutumn.png",
  "flowerBlue.png",
  "flowerWhite.png",
  "bushMagic.png",
  "waveLava.png",
  "rockStone_moss2.png",
  "alienGreen.png",
  "alienBlue.png",
  "alienPink.png",
  "alienBeige.png",
  "alienYellow.png",
].map((f) => "tiles/" + f);
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll([...SHELL, ...ASSETS])),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("alien-agency-") && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    !url.pathname.startsWith(new URL("./", self.location).pathname)
  )
    return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          event.waitUntil(
            caches.open(CACHE).then((cache) => cache.put(event.request, copy)),
          );
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === "navigate")
          return caches.match(new URL("./", self.location).href);
        return Response.error();
      }),
  );
});
