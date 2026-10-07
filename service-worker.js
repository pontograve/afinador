const CACHE_NAME = "afinador-pontograve-v11";
const ASSETS = [
  "./",
  "./index.html",
  "./escalas.html",
  "./modos-gregos.html",
  "./pentatonicas.html",
  "./campo-harmonico.html",
  "./manifest.json",
  "./css/styles.css",
  "./css/escalas.css",
  "./css/modos-gregos.css",
  "./css/pentatonicas.css",
  "./css/campo-harmonico.css",
  "./js/sound-bank.js",
  "./js/rhythm-patterns.js",
  "./js/metronome-engine.js",
  "./js/pitch-detector.js",
  "./js/ui.js",
  "./js/app.js",
  "./js/escalas.js",
  "./js/modos-gregos.js",
  "./js/pentatonicas.js",
  "./js/campo-harmonico.js",
  "./icons/icon.svg",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/logo-fundo-escuro.svg",
  "./icons/logo-fundo-claro.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Busca na rede e guarda a cópia nova (para a próxima vez); falha em silêncio quando está offline
function atualizar(request) {
  return fetch(request)
    .then((response) => {
      if (response.ok && response.type === "basic") {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
      }
      return response;
    })
    .catch(() => undefined);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;          // outros sites: direto da rede
  if (url.pathname.endsWith(".mp3")) return;                // áudio: direto da rede

  // Páginas: abre a cópia guardada na hora (mesmo com ?ritmo=… no endereço) e atualiza em segundo plano.
  // Sem cópia e sem internet, abre o afinador (index.html).
  if (request.mode === "navigate") {
    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then((cached) => {
        const rede = atualizar(request);
        if (cached) { event.waitUntil(rede); return cached; }
        return rede.then((r) => r || caches.match("./index.html"));
      })
    );
    return;
  }

  // Arquivos do app (CSS, JS, ícones): cópia guardada na hora + atualização em segundo plano
  event.respondWith(
    caches.match(request).then((cached) => {
      const rede = atualizar(request);
      if (cached) { event.waitUntil(rede); return cached; }
      return rede.then((r) => r || new Response("", { status: 504, statusText: "Offline" }));
    })
  );
});
