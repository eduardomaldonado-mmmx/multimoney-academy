/* ============================================================
   Service Worker — Centro Comercial Plus · MultiMoney
   ------------------------------------------------------------
   Estrategia:
   - App (index.html y archivos propios): "network-first".
     Siempre intenta traer la versión más nueva del servidor.
     Si no hay internet, usa la copia guardada (funciona offline).
   - Fuentes de Google: "cache-first".
     Se guardan la primera vez que hay internet y luego sirven
     desde caché para que la app cargue rápido y funcione offline.

   IMPORTANTE: Cuando publiques una versión nueva de la intranet,
   sube el número de CACHE_VERSION (v1 -> v2). Eso obliga a todos
   los equipos a refrescar la caché en su siguiente apertura.
   ============================================================ */

const CACHE_VERSION = "v1";
const CACHE_NAME = `centro-plus-${CACHE_VERSION}`;

// Archivos propios que precargamos al instalar.
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./favicon.png"
];

// Dominios de fuentes que cacheamos en tiempo de ejecución.
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

// --- Instalación: precargar el "esqueleto" de la app ---
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(APP_SHELL).catch(() => {
        // Si algún archivo opcional falla, no rompemos la instalación.
        return cache.add("./index.html");
      })
    )
  );
  self.skipWaiting();
});

// --- Activación: borrar cachés viejas de versiones anteriores ---
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith("centro-plus-") && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// --- Intercepción de peticiones ---
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Solo manejamos GET.
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // 1) Fuentes de Google -> cache-first
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          cache.put(req, res.clone());
          return res;
        } catch (e) {
          return cached || Response.error();
        }
      })
    );
    return;
  }

  // 2) Todo lo demás (nuestra app) -> network-first con respaldo a caché
  event.respondWith(
    (async () => {
      try {
        const res = await fetch(req);
        // Guardamos una copia fresca para uso offline.
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, res.clone());
        return res;
      } catch (e) {
        // Sin internet: servimos lo último guardado.
        const cached = await caches.match(req);
        if (cached) return cached;
        // Si pidieron una página y no hay nada, devolvemos el index.
        if (req.mode === "navigate") {
          const fallback = await caches.match("./index.html");
          if (fallback) return fallback;
        }
        return Response.error();
      }
    })()
  );
});
