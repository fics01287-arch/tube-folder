// PWA: 일반 웹(http/https)에서만 서비스워커 등록. 확장(chrome-extension://)에서는 건너뜀.
if (('serviceWorker' in navigator) && (location.protocol === 'http:' || location.protocol === 'https:')) {
  navigator.serviceWorker.register('sw.js').catch(function () {});
}
