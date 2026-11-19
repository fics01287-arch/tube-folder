// @ts-nocheck — scripts/bundleReport.mjs(JS) import에 타입 선언이 없어 이 빌드 설정 파일만 타입체크 예외 처리(vite.config.ts와 동일 사유).
import { defineConfig } from 'vite';
import { bundleReportPlugin } from './scripts/bundleReport.mjs';

// 콘텐츠 스크립트(content) 빌드 — 유튜브 페이지에 클래식 스크립트로 주입되므로 iife로 번들한다.
// (React 미사용: 호스트 페이지 번들 크기를 최소화하고 YouTube 자체 프레임워크와 충돌을 피하기 위해
//  미니 팝업은 Shadow DOM + vanilla TS로 구현 — src/content/miniPopup.ts 참고)
export default defineConfig({
  plugins: [bundleReportPlugin('content')],
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: 'src/content/content.ts',
      formats: ['iife'],
      name: 'TubeFolderContent',
      fileName: () => 'content.js'
    }
  }
});
