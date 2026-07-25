// vite가 index.pwa.html을 입력받아 그대로 pwa-dist/index.pwa.html로 출력하는데,
// GitHub Pages 등 정적 호스팅은 디렉터리 접속 시 기본적으로 index.html만 찾는다.
// 빌드 후 파일명만 index.html로 바꿔 하위 경로(.../pwa-dist/)를 그대로 열 수 있게 한다.
import { existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'pwa-dist';
const from = join(dir, 'index.pwa.html');
const to = join(dir, 'index.html');

if (existsSync(from)) {
  renameSync(from, to);
  console.log('[build:pwa] index.pwa.html → index.html 이름 변경 완료');
} else if (!existsSync(to)) {
  console.warn('[build:pwa] index.pwa.html을 찾지 못했습니다 — 빌드 산출물을 확인하세요.');
  process.exitCode = 1;
}
