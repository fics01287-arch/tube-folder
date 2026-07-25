import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 독립 PWA(휴대폰 매니저) 빌드 — index.pwa.html 진입점, 크롬 확장 매니저 빌드(vite.config.ts)와는
// 별개 산출물(pwa-dist/)이다. GitHub Pages 등 하위 경로 배포를 위해 base를 상대경로로 지정.
// public/ 아래 manifest.webmanifest·sw-pwa.js·icons는 Vite가 자동으로 pwa-dist/에 복사한다.
// (같은 public/ 폴더를 확장 빌드와 공유하므로 이 빌드에 쓰이지 않는 manifest.json도 함께 복사되지만
//  index.pwa.html이 참조하지 않아 동작에 영향 없음 — 폴더 분리는 하지 않기로 함, 2026-07-25)
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'pwa-dist',
    emptyOutDir: true,
    rollupOptions: {
      input: 'index.pwa.html'
    }
  }
});
