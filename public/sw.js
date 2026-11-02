const CACHE = "mievento-shell-v2";
const LEGACY_CACHES = ["mievento-shell-v1"];
const MAX_ASSETS = 200;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all(LEGACY_CACHES.map((key) => caches.delete(key))).then(() => self.clients.claim()),
  );
});

async function rememberAsset(request, response) {
  const cache = await caches.open(CACHE);
  await cache.put(request, response);
  const keys = await cache.keys();
  const assets = keys.filter((key) => new URL(key.url).pathname.startsWith("/assets/"));
  await Promise.all(assets.slice(0, Math.max(0, assets.length - MAX_ASSETS)).map((key) => cache.delete(key)));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/__grok")) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).then((res) => {
        // Solo la página inicial pública puede convertirse en shell offline.
        // Nunca guardar HTML de pases, rutas privadas, errores o URLs con parámetros.
        if (url.pathname === "/" && !url.search && res.ok && !/no-store|private/i.test(res.headers.get("Cache-Control") || "")) {
          event.waitUntil(caches.open(CACHE).then((cache) => cache.put("/", res.clone())).catch(() => {}));
        }
        return res;
      }).catch(async () => (await caches.open(CACHE)).match("/").then((cached) => cached || Response.error())),
    );
    return;
  }

  // Los archivos de compilación tienen nombres con hash. No cachear API,
  // imágenes arbitrarias ni respuestas sensibles o explícitamente privadas.
  if (!url.pathname.startsWith("/assets/") || url.search) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    if (cached) return cached;
    const res = await fetch(req);
    if (res.ok && res.type !== "opaque" && !/no-store|private/i.test(res.headers.get("Cache-Control") || "")) {
      event.waitUntil(rememberAsset(req, res.clone()).catch(() => {}));
    }
    return res;
  })());
});
