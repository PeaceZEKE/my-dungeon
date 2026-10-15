---
name: dl-notion-sync
description: Dungeon Legion 작업을 노션 프로젝트 허브에 최신화할 때 쓴다 — 버전을 커밋·푸시했거나 main 에 머지했을 때, 기능·수정 하나를 끝냈을 때, 결정이 났거나 작업을 보류했을 때, 새 할 일이 생겼을 때 '작업 로그' 데이터베이스에 한 줄을 넣거나 상태를 바꾸고, '앞으로 할 작업'·'출시 목표와 과정'·'지금까지 한 작업' 페이지의 해당 줄을 고친다. 사용자 지시로 **작업이 끝날 때마다** 한다(CLAUDE.md '노션 최신화'). Triggers — 한국어 — 노션 최신화, 노션 갱신, 노션에 올려, 노션 업데이트, 작업 로그, 진행 상황 정리, 백로그 갱신, 로드맵 갱신, 머지 반영, 노션에 기록. English — update Notion, sync Notion, log this to Notion, work log, update the backlog/roadmap page.
---

# dl-notion-sync — 노션 프로젝트 허브 최신화

사용자 지시(10-14): **앞으로 진행하는 작업은 계속 노션에 최신화한다.** 저장소 문서(`CLAUDE.md`·`기획서.md`·`인수인계.md`)가 원본이고, 노션은 사람이 읽기 좋게 모은 요약·결정·로드맵이다. 둘이 다르면 저장소가 이긴다 — 노션을 고친다.

## 페이지 지도 (2026-10-14 만듦 · 사용자 개인 워크스페이스의 비공개 페이지)

| 무엇 | ID / URL |
|---|---|
| 허브 「Dungeon Legion — 프로젝트 허브」 | `3f922520-baed-816f-9724-fe7ba7e19b81` · https://app.notion.com/p/3f922520baed816f9724fe7ba7e19b81 |
| DB 「작업 로그」 | 데이터베이스 `c976bb5f368540a38e373410f1a16b45` · **data source `collection://8f53dd97-baff-42c9-8d00-4e6256ed4eef`** |
| 「지금까지 한 작업 — 버전 이력」 | `3f922520-baed-8159-85de-d9b2bb5d4735` · https://app.notion.com/p/3f922520baed815985ded9b2bb5d4735 |
| 「앞으로 할 작업 — 백로그」 | `3f922520-baed-817d-8f4f-d05132c56bcf` · https://app.notion.com/p/3f922520baed817d8f4fd05132c56bcf |
| 「유니티 컨버팅 계획」 | `3f922520-baed-81ce-801b-d11cf8343792` · https://app.notion.com/p/3f922520baed81ce801bd11cf8343792 |
| 「크레이지게임즈 조사」 | (PAGE_CG) |
| 「출시 목표와 과정」 | `3fa22520-baed-81f8-ae64-d5bd89351faf` · https://app.notion.com/p/3fa22520baed81f8ae64d5bd89351faf |

ID 가 안 맞으면(사용자가 옮겼거나 지웠으면) `notion-search` 로 제목을 찾고, 이 표를 고쳐 커밋한다.

## 작업 로그 DB 칸

| 칸 | 형식 | 값 |
|---|---|---|
| `작업` (제목) | 글 | `v898 <한 줄>` 처럼 버전으로 시작하면 찾기 쉽다 |
| `상태` | 상태 | `예정` · `진행 중` · `보류` · `완료` |
| `분류` | 다중 선택(JSON 배열 문자열) | 콘텐츠 · 밸런스 · 렌더 · UI · 오디오 · 스토리 · 용병 · 버그 · 문서 · 출시 · 유니티 · 도구 |
| `버전` | 글 | `v898` 또는 `v898~v900` |
| `날짜` | 날짜 | `"date:날짜:start": "2026-10-15"` (+ 필요하면 `date:날짜:end`) |
| `요약` | 글 | 무엇을·왜 한 줄. 머지 대기면 끝에 `(머지 대기)` |
| `플래그` | 글 | `?flag=0` 들 |
| `우선순위` | 선택 | 높음 · 보통 · 낮음 (예정·보류 항목만) |

## 절차

1. 도구 불러오기: `ToolSearch` → `select:mcp__Notion__notion-search,mcp__Notion__notion-fetch,mcp__Notion__notion-create-pages,mcp__Notion__notion-update-page,mcp__Notion__notion-query-data-sources`. 노션 서버가 연결 안 돼 있으면 사용자에게 알리고, 할 일을 `인수인계.md` 에 적어 두었다가 다음에 한다(지어내지 말 것).
2. **작업 로그 한 줄**
   - 같은 작업이 이미 `예정`/`진행 중` 으로 있으면 새로 만들지 말고 그 줄을 `update_properties` 로 바꾼다(`notion-search` 에 data_source_url 을 주거나 `notion-query-data-sources` 로 찾는다).
   - 없으면 `notion-create-pages` — `parent: {type: "data_source_id", data_source_id: "8f53dd97-baff-42c9-8d00-4e6256ed4eef"}`.
   - 작업 브랜치에만 올렸으면 `진행 중` + 요약 끝 `(머지 대기)`, main 머지 뒤 `완료`.
3. **페이지 손보기** — `notion-fetch` 로 먼저 읽고 `update_content`(찾아 바꾸기)로 최소한만:
   - 백로그: 끝난 줄은 `- [ ]` → `- [x]` + 버전, 새로 생긴 할 일은 해당 절에 한 줄, 결정이 나면 '열린 결정' 표에서 결정 칸을 채운다.
   - 버전 이력: 해당 영역 절의 버전 표에 한 줄, 맨 위 '한눈에 보기' 표가 바뀌는 일이면(막·몬스터·용병 수 등) 그 칸.
   - 출시 목표와 과정: 단계 체크리스트·완료 기준이 움직였으면.
   - 유니티 계획: 유니티 관련 결정·작업일 때만.
   - 허브 첫 콜아웃의 '현재 배포 vNNN (날짜 기준)' 은 **main 머지 때만** 바꾼다.
4. 파일 이름(`CLAUDE.md`·`index.html` 등)은 **백틱으로 감싼다** — 그냥 쓰면 노션이 `http://CLAUDE.md` 링크로 바꿔 버린다(10-14 실제로 겪음). 표를 넣을 때는 노션 표 문법(`<table header-row="true"><tr><td>…`)을 쓴다 — 마크다운 파이프 표는 글자로 남는다. 긴 문서를 통째로 올릴 때는 `scripts/md2notion.py <in.md> <out.md>` 로 바꾼 뒤 올린다(첫 `# 제목` 줄은 빼 준다 — 제목은 properties 로).
5. 끝나면 사용자 보고에 "노션 작업 로그·<페이지> 갱신"을 한 줄 넣는다.

## 하지 말 것

- 페이지를 `replace_content` 로 통째로 갈아엎지 말 것 — 사용자가 노션에서 직접 고친 내용이 날아간다. 찾아 바꾸기로.
- 비밀값(토큰·키)·사용자 이메일을 페이지에 쓰지 말 것.
- 페이지를 다른 곳으로 옮기거나 공유하지 말 것(사용자가 정한다).
- 측정하지 않은 숫자·확인 안 된 사실을 쓰지 말 것 — 추정이면 '추정'이라고 쓴다.
