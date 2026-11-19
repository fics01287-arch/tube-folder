// @ts-nocheck — scripts/bundleReport.mjs(JS) import에 타입 선언이 없어 이 빌드 설정 파일만 타입체크 예외 처리(vite.config.ts와 동일 사유).
import { defineConfig } from 'vite';
import { bundleReportPlugin } from './scripts/bundleReport.mjs';

// 서비스워커(background) 빌드 — manifest.json에서 "type":"module"로 선언해 ES 모듈로 로드한다.
// emptyOutDir:false — vite.config.ts(매니저) 빌드가 먼저 dist/를 비우고 채운 뒤 이어붙는다.
export default defineConfig({
  plugins: [bundleReportPlugin('background')],
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: 'src/background/background.ts',
      formats: ['es'],
      fileName: () => 'background.js'
    }
  }
});
