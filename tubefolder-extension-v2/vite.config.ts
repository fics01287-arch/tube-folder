import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 매니저 페이지(React) 빌드 — index.html 진입점.
// public/ 아래 manifest.json·icons는 Vite가 자동으로 dist/에 복사한다.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
