/* sw-pwa.js — v2 PWA(휴대폰 매니저) 전용 오프라인 캐시 서비스워커.
 *  · index.pwa.html에서만 등록됨. 크롬 확장 매니저(index.html)에는 등록되지 않는다.
 *  · v1의 sw.js와 같은 "네트워크 우선 → 실패 시 캐시" 전략이지만, v2는 Vite 빌드라 자산 파일명에
 *    해시가 붙어 정적 캐시 목록을 미리 알 수 없다 — 그래서 사전 캐시(precache) 없이 요청이 실제로
 *    성공할 때마다 결과를 캐시에 채워 넣는 런타임 캐싱만 사용한다(오프라인에서는 이미 방문한 파일만
 *    캐시로 응답 가능 — 최초 1회는 온라인 상태에서 열어야 이후 오프라인 진입 가능).
 */
const CACHE = 'tubefolder-v2-pwa_1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches
          .open(CACHE)
          .then((c) => c.put(e.request, copy))
          .catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((cached) => cached || Response.error()))
  );
});
