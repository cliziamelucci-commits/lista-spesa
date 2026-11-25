/* ============================================================
   SERVICE WORKER – il "custode offline" dell'app
   È un piccolo script che il browser tiene attivo in background,
   separato dalla pagina. Intercetta le richieste dei file e può
   rispondere con le copie salvate in memoria (cache), così l'app
   si apre anche senza connessione internet.

   IMPORTANTE: quando modifichi un file dell'app, aumenta il numero
   di versione qui sotto (es. v5 → v6). Così il browser capisce che
   c'è un aggiornamento, scarica i file nuovi e butta la cache vecchia.
   ============================================================ */
const CACHE_VERSION = "v5";
const CACHE_NAME = `lista-spesa-${CACHE_VERSION}`;

/* ============================================================
   ELENCO DEI FILE DA SALVARE
   Sono tutti i file che servono all'app per funzionare.
   La pagina si salva come "./" e NON come "./index.html":
   hosting come Cloudflare Pages reindirizzano /index.html verso /,
   e Safari su iPhone rifiuta le pagine servite dal service worker
   se la copia salvata è il risultato di un reindirizzamento
   (errore "Response served by service worker has redirections").
   Lo sfondo a pattern è già dentro la pagina, quindi non serve
   aggiungerlo a parte.
   ============================================================ */
const APP_SHELL = "./";
const APP_FILES = [
  APP_SHELL,
  "./manifest.json",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

/* ============================================================
   RISPOSTA "PULITA"
   Se una risposta è arrivata dopo un reindirizzamento, il browser
   le lascia attaccato il segno "redirected". Qui ne creiamo una
   copia nuova con lo stesso contenuto, le stesse intestazioni e
   lo stesso stato, ma senza quel segno: così Safari la accetta.
   ============================================================ */
async function cleanResponse(response) {
  if (!response.redirected) return response;
  const body = await response.blob();
  return new Response(body, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText
  });
}

/* ============================================================
   1. INSTALLAZIONE
   Avviene la prima volta che apri l'app (o quando cambia la
   versione): scarica tutti i file dell'elenco direttamente dal
   server (senza usare copie vecchie del browser), li "ripulisce"
   e li mette in cache.
   ============================================================ */
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.all(APP_FILES.map(async url => {
        const response = await fetch(url, { cache: "reload" });
        if (!response.ok) throw new Error(`Impossibile scaricare ${url}: ${response.status}`);
        await cache.put(url, await cleanResponse(response));
      })))
      .then(() => self.skipWaiting()) // attiva subito la nuova versione
  );
});

/* ============================================================
   2. ATTIVAZIONE
   Cancella le cache delle versioni precedenti (comprese quelle
   che contenevano la pagina reindirizzata) e prende subito il
   controllo delle pagine già aperte.
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
   3a. APERTURA DELLA PAGINA (richieste di "navigazione")
   Qualunque indirizzo dell'app si apra (/, /index.html, l'icona
   sulla Home...), si risponde sempre con la pagina salvata come
   "./", ricostruita come risposta pulita. Se non è ancora in
   cache, la si scarica, la si ripulisce e la si salva.
   ============================================================ */
async function handleNavigation() {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(APP_SHELL);
  if (cached) return cleanResponse(cached);

  const response = await cleanResponse(await fetch(APP_SHELL, { cache: "reload" }));
  if (response.ok) await cache.put(APP_SHELL, response.clone());
  return response;
}

/* ============================================================
   3b. ALTRI FILE (strategia "prima la cache")
   - se il file è in cache, lo restituisce subito (veloce e offline);
   - altrimenti lo scarica da internet e ne salva una copia pulita.
   ============================================================ */
async function handleAsset(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;

  const response = await cleanResponse(await fetch(request));
  if (response.ok && (response.type === "basic" || response.type === "default")) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", event => {
  const request = event.request;

  // Gestiamo solo le letture (GET) di file del nostro sito
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation().catch(() => Response.error()));
  } else {
    event.respondWith(handleAsset(request).catch(() => Response.error()));
  }
});
