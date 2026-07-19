# 튜브폴더 버전2 (개발 중)

`tubefolder-extension/` (버전1, 완성·배포됨)은 그대로 두고, 이 폴더에서 버전2 개발을 진행합니다.

## 버전1과의 관계
- 버전1: `tubefolder-extension/` — 건드리지 않음, 배포 유지
- 버전2: 이 폴더 (`tubefolder-extension-v2/`) — 새 개발 진행
- 두 폴더는 완전히 독립적입니다. 배포용 압축도 아래처럼 폴더 단위로 분리됩니다.

## 배포 (단일 zip 패키징)
저장소 루트(`tube-folder/`)에서 실행:

```powershell
Compress-Archive -Path .\tubefolder-extension-v2\* -DestinationPath .\tubefolder-extension-v2.zip -Force
```

- 이 명령은 `tubefolder-extension-v2` 폴더 안의 파일만 압축합니다. `tubefolder-extension`(버전1), `youtube-manager-extension`, 루트의 `CLAUDE.md`·매뉴얼·인계서 등은 대상 경로 밖이라 섞이지 않습니다.
- 개발용 파일(테스트 스크립트, 문서 초안 등)을 배포에서 빼고 싶으면 이 폴더 안에 `docs/`, `_test/` 처럼 하위 폴더로 분리해두고, 위 명령의 `-Path`를 필요한 파일/폴더만 나열하는 방식으로 좁히면 됩니다.

## 상태
- 기술 스택·설계는 아직 미정. 다음 세션에서 결정 후 이 문서를 갱신합니다.
