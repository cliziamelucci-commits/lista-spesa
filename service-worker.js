/* ============================================================
   SERVICE WORKER – il "custode offline" dell'app
   È un piccolo script che il browser tiene attivo in background,
   separato dalla pagina. Intercetta le richieste dei file e può
   rispondere con le copie salvate in memoria (cache), così l'app
   si apre anche senza connessione internet.

   IMPORTANTE: quando modifichi un file dell'app, aumenta il numero
   di versione qui sotto (es. v1 → v2). Così il browser capisce che
   c'è un aggiornamento, scarica i file nuovi e butta la cache vecchia.
   ============================================================ */
const CACHE_VERSION = "v4";
const CACHE_NAME = `lista-spesa-${CACHE_VERSION}`;

/* ============================================================
   ELENCO DEI FILE DA SALVARE
   Sono tutti i file che servono all'app per funzionare.
   Lo sfondo a pattern è già dentro index.html, quindi non serve
   aggiungerlo a parte.
   ============================================================ */
const APP_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

/* ============================================================
   1. INSTALLAZIONE
   Avviene la prima volta che apri l'app (o quando cambia la
   versione): scarica tutti i file dell'elenco e li mette in cache.
   ============================================================ */
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting()) // attiva subito la nuova versione
  );
});

/* ============================================================
   2. ATTIVAZIONE
   Cancella le cache delle versioni precedenti, così non restano
   file vecchi a occupare spazio, e prende subito il controllo
   delle pagine già aperte.
   ============================================================ */
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith("lista-spesa-") && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

/* ============================================================
   3. RICHIESTE DEI FILE (strategia "prima la cache")
   Ogni volta che l'app chiede un file:
   - se è in cache, lo restituisce subito (veloce e offline);
   - altrimenti lo scarica da internet e ne salva una copia;
   - se si è offline e la pagina non è in cache, mostra index.html.
   ============================================================ */
self.addEventListener("fetch", event => {
  const request = event.request;

  // Gestiamo solo le letture (GET) di file del nostro sito
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(cached => {
      if (cached) return cached;

      return fetch(request)
        .then(response => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => {
          if (request.mode === "navigate") return caches.match("./index.html");
          return Response.error();
        });
    })
  );
});
