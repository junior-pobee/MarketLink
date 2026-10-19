const CACHE_NAME = "market-link-v1";

const APP_FILES = [
 "./",
 "./index.html",
 "./manifest.json",
 "./icons/icon-192.png",
 "./icons/icon-512.png"
];

// Install the service worker and cache essential app files.
self.addEventListener("install", (event) => {
 event.waitUntil(
  caches.open(CACHE_NAME).then((cache) => {
   return cache.addAll(APP_FILES);
  })
 );
 
 self.skipWaiting();
});

// Remove old Market Link caches.
self.addEventListener("activate", (event) => {
 event.waitUntil(
  caches.keys().then((cacheNames) => {
   return Promise.all(
    cacheNames
    .filter((name) => {
     return (
      name.startsWith("market-link-") &&
      name !== CACHE_NAME
     );
    })
    .map((name) => caches.delete(name))
   );
  })
 );
 
 self.clients.claim();
});

// Serve cached files when appropriate.
self.addEventListener("fetch", (event) => {
 const request = event.request;
 
 if (request.method !== "GET") {
  return;
 }
 
 const url = new URL(request.url);
 
 if (url.origin !== self.location.origin) {
  return;
 }
 
 event.respondWith(
  fetch(request)
  .then((response) => {
   if (response && response.ok) {
    const responseCopy = response.clone();
    
    caches.open(CACHE_NAME).then((cache) => {
     cache.put(request, responseCopy);
    });
   }
   
   return response;
  })
  .catch(async () => {
   const cachedResponse = await caches.match(request);
   
   if (cachedResponse) {
    return cachedResponse;
   }
   
   if (request.mode === "navigate") {
    const cachedPage = await caches.match("./index.html");
    
    if (cachedPage) {
     return cachedPage;
    }
   }
   
   return new Response(
    "You are offline. Please reconnect to use this feature.",
    {
     status: 503,
     headers: {
      "Content-Type": "text/plain; charset=utf-8"
     }
    }
   );
  })
 );
});