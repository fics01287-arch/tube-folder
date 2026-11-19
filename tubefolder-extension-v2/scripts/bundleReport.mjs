// 번들 보고서 Vite 플러그인 — 빌드 결과물에 "실제로 들어간" node_modules 패키지 목록을 build-report/<이름>.json에 남긴다.
// 용도: 제3자 라이선스 고지(공통지침 '제3자 라이선스 고지 지침.txt' §3)의 근거. scripts/make-notices.mjs --check가
//       이 목록의 모든 패키지가 THIRD_PARTY_NOTICES.txt에 있는지 검사한다(새 라이브러리가 묶이면 고지 누락으로 빌드 실패).
// 기준: 번들러(Rollup)가 청크에 실제로 출력한 모듈(renderedLength > 0)만 센다. 트리 셰이킹으로 빠진 것은 제외.
// 의존성 추가 없음(Node 표준 모듈만 사용). build-report/ 는 빌드 부산물이라 git에 올리지 않는다(.gitignore).
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function bundleReportPlugin(name) {
  return {
    name: 'tf-bundle-report',
    apply: 'build',
    generateBundle(_options, bundle) {
      const pkgs = {};
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue;
        for (const [rawId, info] of Object.entries(chunk.modules || {})) {
          if (!info || !(info.renderedLength > 0)) continue;
          const id = rawId.replace(/\0/g, '').replace(/\\/g, '/');
          const at = id.lastIndexOf('node_modules/');
          if (at < 0) continue;
          const rest = id.slice(at + 'node_modules/'.length).split('/');
          const pkgName = rest[0].startsWith('@') ? rest.slice(0, 2).join('/') : rest[0];
          const dir = id.slice(0, at + 'node_modules/'.length) + pkgName;
          let version = '?';
          try { version = JSON.parse(readFileSync(dir + '/package.json', 'utf8')).version || '?'; } catch { /* 읽기 실패 시 ? */ }
          pkgs[pkgName] = version;
        }
      }
      const sorted = Object.fromEntries(Object.keys(pkgs).sort().map((k) => [k, pkgs[k]]));
      const outDir = join(process.cwd(), 'build-report');
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, name + '.json'), JSON.stringify({ build: name, packages: sorted }, null, 2) + '\n', 'utf8');
    }
  };
}
