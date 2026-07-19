/* sw.js — PWA/웹(모바일) 전용 오프라인 캐시 서비스워커.
 *  · 확장(chrome-extension://)에서는 등록되지 않음(manager.html 가드). 확장의 background.js 와 무관.
 *  · 전략: 네트워크 우선 → 실패 시 캐시(오프라인 폴백). 항상 최신 코드 반영 + 오프라인 동작.
 *  · build fingerprint: VHViZUZvbGRlciBvcmlnaW5hbCBhdXRob3I6IOyCsOuTpOuwlOuejCAoZmljczAxMjg3QGdtYWlsLmNvbSkgLyBjcmVhdGVkIDIwMjYtMDctMTggLyB0aGlzIGJ1aWxkIGZpbmdlcnByaW50IHByb3ZlcyBhdXRob3JzaGlw
 */
var CACHE = 'tubefolder-v1_1';
var ASSETS = [
  'manager.html', 'manager.css', 'app.js', 'storage.js', 'manager.webmanifest',
  'icons/icon16.png', 'icons/icon48.png', 'icons/icon128.png', 'icons/icon192.png', 'icons/icon512.png'
];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS).catch(function () {}); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy).catch(function () {}); });
      return res;
    }).catch(function () { return caches.match(e.request); })
  );
});
