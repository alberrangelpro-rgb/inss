// Guarda o app para abrir mesmo sem internet (a voz do aparelho é offline).
const CACHE = 'estudo-em-voz-v4';
const ARQUIVOS = [
  './', 'index.html', 'css/style.css',
  'js/texto.js', 'js/exemplo.js', 'js/voz-servidor.js', 'js/comandos.js', 'js/app.js',
  'manifest.webmanifest',
  'icons/icone.svg', 'icons/icone-192.png', 'icons/icone-512.png', 'icons/apple-touch-icon.png',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
];
const CDN = 'https://cdnjs.cloudflare.com/';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Só cuidamos dos arquivos do próprio app e do PDF.js. O servidor de voz e
// quaisquer outras chamadas passam direto, sem cache (o áudio já é guardado
// em memória pelo app).
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;
  const daApp = url.startsWith(self.location.origin) || url.startsWith(CDN);
  if (!daApp) return;
  // Rede primeiro (para receber atualizações), cache se estiver offline.
  e.respondWith(
    fetch(e.request).then((r) => {
      if (r.ok || r.type === 'opaque') {
        const copia = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copia));
      }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
