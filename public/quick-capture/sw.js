const CACHE_NAME = "candidate-quick-capture-v5";
const APP_SHELL = [
  "/quick-capture/",
  "/quick-capture/index.html",
  "/quick-capture/capture.html",
  "/quick-capture/list.html",
  "/quick-capture/style.css",
  "/quick-capture/script.js",
  "/quick-capture/list.js",
  "/quick-capture/manifest.json",
  "/quick-capture/icon-192.png",
  "/quick-capture/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.pathname === "/candidates" || requestUrl.pathname === "/parse-note") {
    event.respondWith(fetch(event.request));
    return;
  }

  const isDynamicAppShellAsset =
    requestUrl.pathname === "/quick-capture/" ||
    requestUrl.pathname === "/quick-capture/index.html" ||
    requestUrl.pathname === "/quick-capture/capture.html" ||
    requestUrl.pathname === "/quick-capture/list.html" ||
    requestUrl.pathname === "/quick-capture/script.js" ||
    requestUrl.pathname === "/quick-capture/list.js" ||
    requestUrl.pathname === "/quick-capture/style.css" ||
    requestUrl.pathname === "/quick-capture/manifest.json";

  if (isDynamicAppShellAsset) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type !== "basic") {
          return response;
        }
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      });
    })
  );
});
