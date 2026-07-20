import { defineConfig } from 'vite';

// 서비스워커(background) 빌드 — manifest.json에서 "type":"module"로 선언해 ES 모듈로 로드한다.
// emptyOutDir:false — vite.config.ts(매니저) 빌드가 먼저 dist/를 비우고 채운 뒤 이어붙는다.
export default defineConfig({
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
