// 저작권 표식(build fingerprint) 자동 검사 스크립트.
// 빌드 직전·직후에 자동 실행되어, 표식이 빠졌거나 형식이 틀리면 빌드를 실패시킨다.
// (규칙 원본: 공통지침 '빌드 핑거프린트 표식 지침.txt' / 개발 지침 '앱개발지침작성용지침.txt')
//
// 사용법
//   node scripts/check-fingerprint.mjs                      → 소스 파일의 표식 검사
//   node scripts/check-fingerprint.mjs --dist dist:2        → 위 검사 + 빌드 결과물(dist 폴더)의 N개 이상 파일에 표식이 남았는지 검사
//   (--dist 는 여러 번 쓸 수 있음: --dist dist:1 --dist dist-electron:1, ":N" 생략 시 1)
//
// 왜 `/*! ... */` 형식인가: 일반 주석(// 또는 /* */)은 Vite·esbuild 배포 빌드 때 지워진다.
// 느낌표(!)가 붙은 주석만 배포본에 그대로 남는다(2026-10-11 Vite 5.4 빌드로 직접 확인).
// 위치도 중요하다: import 문 바로 위에 두면 번들러(Rollup)가 import 와 함께 주석을 버린다.
//   → import 문들이 끝난 뒤, 첫 실행문(const·function·호출 등) 바로 위에 둔다.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── 앱별 설정: 이 블록만 앱에 맞게 고친다 ─────────────────────────────
const APP_NAME = 'TubeFolder';
// 표식을 심은 파일(프로젝트 루트 기준 상대경로). 앱마다 2개를 기본으로 한다.
const FILES = ['src/manager/main.tsx', 'src/background/background.ts'];
// ────────────────────────────────────────────────────────────────────

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MARK = /^\/\*!\s*build fingerprint:\s*([A-Za-z0-9+/]+={0,2})\s*\*\/\s*$/;
const errors = [];
const fingerprints = new Set();

function fail(msg) { errors.push(msg); }

// ── 1) 소스 파일 검사 ─────────────────────────────────────────────
for (const rel of FILES) {
  const abs = join(root, rel);
  if (!existsSync(abs)) { fail(`[없음] ${rel} — 표식을 심기로 한 파일이 없습니다(이름 변경·삭제됐다면 이 스크립트의 FILES도 고쳐야 합니다).`); continue; }
  const head = readFileSync(abs, 'utf8').split(/\r?\n/).slice(0, 150);
  let b64 = null;
  let at = -1;
  for (let i = 0; i < head.length; i++) {
    const m = MARK.exec(head[i].trim());
    if (m) { b64 = m[1]; at = i; break; }
  }
  if (!b64) {
    const loose = head.find((l) => l.includes('build fingerprint'));
    fail(loose
      ? `[형식] ${rel} — 표식은 있으나 '/*! build fingerprint: <base64> */' 형식이 아닙니다(// 나 /* */ 는 배포 빌드에서 지워집니다).`
      : `[누락] ${rel} — 앞 150줄 안에 build fingerprint 표식이 없습니다.`);
    continue;
  }
  // 표식 다음의 첫 '코드' 줄(빈 줄·주석 제외)이 import 이면 번들러가 주석을 버린다.
  const nextCode = head.slice(at + 1).find((l) => l.trim() !== '' && !/^\s*(\/\/|\/\*|\*)/.test(l));
  if (nextCode !== undefined && /^\s*import\b/.test(nextCode)) {
    fail(`[위치] ${rel} — 표식 바로 다음 줄이 import 문입니다. import 문들이 끝난 뒤 첫 실행문 위로 옮기세요(import 위의 주석은 번들 과정에서 지워집니다).`);
    continue;
  }
  let text = '';
  try { text = Buffer.from(b64, 'base64').toString('utf8'); } catch { /* 아래에서 걸러짐 */ }
  const checks = [
    [text.includes(`${APP_NAME} original author`), `'${APP_NAME} original author' 문구`],
    [text.includes('산들바람'), "개발자명 '산들바람'"],
    [text.includes('fics01287@gmail.com'), '개발자 이메일'],
    [/created \d{4}-\d{2}-\d{2}/.test(text), "'created YYYY-MM-DD' 날짜"],
    [text.includes('this build fingerprint proves authorship'), "'this build fingerprint proves authorship' 문구"]
  ];
  const missing = checks.filter(([ok]) => !ok).map(([, name]) => name);
  if (missing.length) { fail(`[내용] ${rel} — 표식을 디코드했더니 다음이 빠졌습니다: ${missing.join(', ')}  (디코드 결과: ${text || '해독 불가'})`); continue; }
  fingerprints.add(b64);
}

// ── 2) 빌드 결과물 검사(--dist) ───────────────────────────────────
const argv = process.argv.slice(2);
const distTargets = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--dist' && argv[i + 1]) {
    const [dir, n] = argv[i + 1].split(':');
    distTargets.push({ dir, min: Math.max(1, parseInt(n || '1', 10) || 1) });
    i++;
  }
}

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(m?js|cjs|html)$/i.test(name)) out.push(p);
  }
  return out;
}

if (errors.length === 0) {
  for (const { dir, min } of distTargets) {
    const abs = join(root, dir);
    if (!existsSync(abs)) { fail(`[결과물 없음] ${dir} 폴더가 없습니다 — 빌드가 먼저 끝나야 합니다.`); continue; }
    let hit = 0;
    for (const f of walk(abs, [])) {
      const body = readFileSync(f, 'utf8');
      for (const fp of fingerprints) { if (body.includes(fp)) { hit++; break; } }
    }
    if (hit < min) fail(`[결과물 누락] ${dir} 안에서 표식이 든 파일이 ${hit}개뿐입니다(최소 ${min}개 필요). 빌드 설정이 주석을 지우고 있을 수 있습니다.`);
    else console.log(`[fingerprint] 빌드 결과물 OK — ${dir}: 표식이 든 파일 ${hit}개 (최소 ${min})`);
  }
}

if (errors.length) {
  console.error('\n❌ 저작권 표식(build fingerprint) 검사 실패 — 빌드를 중단합니다.');
  for (const e of errors) console.error('  - ' + e);
  console.error('\n해결: 공통지침 \'빌드 핑거프린트 표식 지침.txt\'에 따라 표식을 다시 심거나, Claude에게 "표식 복구해줘"라고 요청하세요.\n');
  process.exit(1);
}
console.log(`[fingerprint] 소스 OK — ${APP_NAME}: ${FILES.length}개 파일의 표식을 확인했습니다.`);
