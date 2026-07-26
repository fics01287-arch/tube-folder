// @ts-nocheck — node:child_process·node:fs 타입 선언(@types/node)이 프로젝트에 없음.
// 새 의존성 추가는 CLAUDE.md상 승인 필요 항목이라, 의존성 추가 없이 이 빌드 설정 파일만 타입체크 예외 처리.
// (src/** 앱 코드의 타입 검사에는 영향 없음 — tsconfig.json include 범위 중 이 파일에만 적용됨)
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// 매니저 페이지(React) 빌드 — index.html 진입점.
// public/ 아래 manifest.json·icons는 Vite가 자동으로 dist/에 복사한다.

// 앱 정보 패널(AppInfo.tsx)의 "최근 수정일"용 — 최신 git 커밋 일자를 빌드 시점에 자동 산출(CLAUDE.md
// "UI·앱 정보 표시 원칙" 반영). git이 없는 환경 등에서 실패해도 빌드가 죽지 않도록 빈 문자열로 안전 폴백.
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
  define: {
    __TF_LAST_MODIFIED__: JSON.stringify(getLastCommitDate()),
    __TF_VERSION__: JSON.stringify(pkgVersion)
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
