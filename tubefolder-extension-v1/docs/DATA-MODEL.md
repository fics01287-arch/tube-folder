# 튜브폴더 — 데이터 모델 (상세)

> 저장 키: `tubefolder_v1` · 스키마 버전: `DATA_VERSION = 1`

## 1. 최상위 구조 (정규화 트리)

데이터는 **정규화된 노드 맵**으로 저장한다(중첩 객체가 아니라 `id → node` 평면 맵).
부모-자식 관계는 각 노드의 `parentId`로만 표현 → **무제한 중첩**을 O(1) 재부모화로 다룬다.

```jsonc
{
  "version": 1,
  "rootId": "root",          // 최상위 폴더 id
  "trashId": "trash",        // 휴지통 폴더 id
  "nodes": {                 // id → 노드  (정규화 맵)
    "root":  { …folder… },
    "trash": { …folder(system:'trash')… },
    "n_ab12cd34": { …folder/video… },
    …
  },
  "settings": { "view": "large", "sortKey": "name", "sortDir": "asc" }
}
```

## 2. 노드 스키마

### 공통 필드
| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | string | 고유 id. 특수: `"root"`, `"trash"`. 그 외 `"n_" + base36(rand) + base36(time)` |
| `type` | `"folder"` \| `"video"` | 노드 종류 |
| `parentId` | string \| null | 부모 id. 루트만 `null` |
| `name` | string | 표시 이름(폴더명 / 영상 제목) |
| `order` | number | 같은 부모 내 수동 정렬 순서('없음' 정렬·드래그 재배치 기준) |
| `createdAt` | number | 생성 시각(ms) |
| `modifiedAt` | number | 수정 시각(ms) — '수정한 날짜' 정렬 기준 |

### 폴더 전용
| 필드 | 타입 | 설명 |
|---|---|---|
| `system` | `"trash"`? | 휴지통에만 존재. 시스템 폴더 표식(이동·삭제·이름변경 금지) |

### 영상 전용
| 필드 | 타입 | 설명 |
|---|---|---|
| `videoId` | string | 유튜브 영상 id (썸네일·식별) |
| `url` | string | 원본 URL(클릭 시 새 탭으로 열림) |
| `thumb` | string | `https://i.ytimg.com/vi/<id>/mqdefault.jpg` |
| `kind` | `"video"` \| `"music"` | music.youtube 여부 |
| `channel` | string | 채널명(메타데이터, 있을 때) |
| `duration` | number | 재생시간(초). '크기' 정렬 대용값. 현재 0(메타 미수집) |

### 휴지통 안 노드 전용(임시)
| 필드 | 타입 | 설명 |
|---|---|---|
| `prevParentId` | string | 삭제 직전 부모 — **복원** 시 되돌릴 위치 |

## 3. 특수 노드 & 불변식(invariants)

1. **루트(`root`)는 항상 존재**하고 `parentId === null`. 유일한 무부모 노드.
2. **휴지통(`trash`)은 항상 존재**하고 `parentId === rootId`, `system === 'trash'`.
3. **휴지통은 렌더에서 항상 루트의 맨 마지막**에 고정(정렬·이동과 무관). → `listFolder()`가 강제.
4. 루트/휴지통은 **이동·복사·삭제·이름변경 불가**(모든 조작 함수가 가드).
5. 폴더는 **자기 자신 또는 자기 하위로 이동 불가**(`isDescendant` 가드) → 사이클 방지.
6. 모든 비루트 노드는 **유효한 부모로 도달 가능**해야 한다. 깨지면 `migrate()`가 루트로 복구.
7. 같은 부모 안에서 **이름 중복 허용**하되, *새로 만들 때/복사할 때* 탐색기식 `(2)` 자동 부여(`uniqueName`).

## 4. 트리 표현이 곧 동작이 되는 이유

- **이동(move)** = 대상 노드의 `parentId`만 교체. 하위 전체는 참조로 따라옴 → O(1) 서브트리 이동.
- **삭제(휴지통)** = `prevParentId` 백업 후 `parentId = trash`. 서브트리 통째로 휴지통行.
- **복원** = `parentId = prevParentId`. 원위치 복귀.
- **완전삭제** = 자신 + 하위 id들을 맵에서 제거.
- **복사** = 서브트리를 새 id로 깊은 복제(`deepCopy`).

## 5. 버전 관리·마이그레이션

`storage.js`의 `migrate(data)`는 **로드 시 항상 통과**시켜 다음을 보정한다.
- 루트/휴지통 누락 → 재생성, 휴지통 `system` 표식 강제
- `settings` 결손 필드 → 기본값 주입
- 고아 노드(부모 없음) → 루트로 복구
- `version`을 현재 값으로 정규화

> 미래에 스키마가 바뀌면 `DATA_VERSION`을 올리고 `migrate()`에 단계별 변환을 추가한다.
> 내보내기 JSON도 `migrate()`를 거쳐 들어오므로 구버전 백업도 안전하게 가져온다.

## 6. 설정(settings)

| 키 | 값 | 의미 |
|---|---|---|
| `view` | `xl`\|`large`\|`medium`\|`small`\|`list`\|`details` | 보기 모드 |
| `sortKey` | `name`\|`date`\|`type`\|`size`\|`none` | 정렬 기준('없음'=수동 order) |
| `sortDir` | `asc`\|`desc` | 정렬 방향 |

설정은 `store`에 포함되어 저장·내보내기에 함께 실린다(기기 복원 시 보기/정렬도 복원).

연관: [아키텍처](ARCHITECTURE.md) · [알고리즘](ALGORITHMS.md)
