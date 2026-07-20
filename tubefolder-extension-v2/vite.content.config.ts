import { defineConfig } from 'vite';

// 콘텐츠 스크립트(content) 빌드 — 유튜브 페이지에 클래식 스크립트로 주입되므로 iife로 번들한다.
// (React 미사용: 호스트 페이지 번들 크기를 최소화하고 YouTube 자체 프레임워크와 충돌을 피하기 위해
//  미니 팝업은 Shadow DOM + vanilla TS로 구현 — src/content/miniPopup.ts 참고)
export default defineConfig({
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
