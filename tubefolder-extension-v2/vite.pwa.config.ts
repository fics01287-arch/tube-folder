// @ts-nocheck — node:child_process·node:fs 타입 선언(@types/node)이 프로젝트에 없음.
// 새 의존성 추가는 CLAUDE.md상 승인 필요 항목이라, 의존성 추가 없이 이 빌드 설정 파일만 타입체크 예외 처리.
// (src/** 앱 코드의 타입 검사에는 영향 없음 — tsconfig.json include 범위 중 이 파일에만 적용됨)
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// 독립 PWA(휴대폰 매니저) 빌드 — index.pwa.html 진입점, 크롬 확장 매니저 빌드(vite.config.ts)와는
// 별개 산출물(pwa-dist/)이다. GitHub Pages 등 하위 경로 배포를 위해 base를 상대경로로 지정.
// public/ 아래 manifest.webmanifest·sw-pwa.js·icons는 Vite가 자동으로 pwa-dist/에 복사한다.
// (같은 public/ 폴더를 확장 빌드와 공유하므로 이 빌드에 쓰이지 않는 manifest.json도 함께 복사되지만
//  index.pwa.html이 참조하지 않아 동작에 영향 없음 — 폴더 분리는 하지 않기로 함, 2026-07-25)

// 앱 정보 패널(AppInfo.tsx)용 — vite.config.ts(확장 매니저)와 동일한 방식으로 git 커밋일자·버전 자동 산출.
function getLastCommitDate(): string {
  try {
    return execSync('git log -1 --format=%cI').toString().trim();
  } catch {
    return '';
  }
}
const pkgVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')).version as string;

export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    __TF_LAST_MODIFIED__: JSON.stringify(getLastCommitDate()),
    __TF_VERSION__: JSON.stringify(pkgVersion)
  },
  build: {
    outDir: 'pwa-dist',
    emptyOutDir: true,
    rollupOptions: {
      input: 'index.pwa.html'
    }
  }
});
