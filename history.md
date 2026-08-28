# Wiki.js 커스텀 수정 이력

원본: https://github.com/requarks/wiki (requarks/wiki:2)  
Fork: https://github.com/joahani3/wiki

---

## 형식

```
### [날짜] v버전 or 커밋해시 - 제목
- **이유**: 왜 수정했는가
- **위치**: 수정한 파일/경로
- **내용**: 어떻게 수정했는가
```

---

<!-- 이후 커밋마다 아래에 추가 -->

### [2026-08-29] feat: 나무위키 스타일 주석 기능 추가 (WYSIWYG 에디터)

- **이유**: 본문에 각주/주석을 삽입하고 문서 하단에 모아서 보여주는 기능 요청
- **위치**:
  - `client/components/editor/editor-ckeditor.vue` : 주석 삽입 버튼 및 다이얼로그, 삽입 로직
  - `client/themes/default/components/page.vue` : 뷰어 주석 파싱 및 렌더링
- **내용**:
  - 에디터 툴바 아래 "주석 삽입" 버튼 추가
  - 다이얼로그에서 주석 내용 입력 (Ctrl+Enter 단축키 지원)
  - 커서 위치에 `[N]` superscript 삽입, 문서 하단에 `── 주석 ──` 구분선 + `[N] 내용` 단락 자동 추가
  - 뷰어에서 주석 단락을 파싱하여 하단에 "주석" 섹션으로 렌더링
  - `[N]` 클릭 시 주석 섹션으로 스크롤, ↑ 클릭 시 본문으로 복귀

### [2026-08-29] fix: 페이지 등록 정보 경로 섹션에서 언어 선택 제거

- **이유**: 페이지 등록 정보 화면의 경로 입력 옆 언어(ko) 드롭다운이 불필요하여 제거 요청
- **위치**: `client/components/editor/editor-modal-properties.vue`
- **내용**: 언어 선택 `v-select` 제거, 경로 필드를 전체 너비로 변경, 섹션 제목 및 입력 레이블을 "경로/파일명"으로 변경

### [2026-08-29] feat: 새 문서 생성 시 Visual Editor 자동 선택

- **이유**: 새 문서 작성 시 편집기 선택 화면이 나타나는데, 항상 Visual Editor를 사용하므로 해당 화면 건너뛰기 요청
- **위치**: `client/components/editor.vue`
- **내용**: 새 문서 생성 모드에서 `dialogEditorSelector = true` 대신 `currentEditor = 'editorCkeditor'`로 직접 설정하여 편집기 선택 화면 생략

### [2026-08-29] fix: 페이지 선택 목록 한 줄 표시, 파일명 우선 정렬, 언어선택 제거

- **이유**: 페이지 선택기 목록에서 파일명과 문서제목이 혼재하여 가독성 저하, 언어(ko) 선택 UI 불필요
- **위치**: `client/components/common/page-selector.vue`
- **내용**: 목록 항목을 한 줄로 표시 (파일경로 flex:1 + 문서제목 flex:2), 컬럼 헤더(파일명/문서제목) 추가, 언어 선택 `v-select` 제거 후 "파일명" 레이블로 대체, 높이 376px 조정

### [2026-08-29] feat: 사이드바에 최근 생성/수정 문서 위젯 추가

- **이유**: 모든 페이지 좌측 사이드바에서 최근 문서 히스토리를 바로 확인할 수 있도록 요청
- **위치**: `client/themes/default/components/page.vue`
- **내용**: pages.list GraphQL API로 최근 생성(5개)/수정(5개) 문서 조회 후 접기/펼치기 패널로 표시. 클릭 시 해당 문서로 이동.

### [2026-08-29] feat: 사용자 프로필 아이콘 업로드 기능 추가

- **이유**: 사용자가 본인 아이콘을 직접 업로드하여 글작성자/댓글/헤더 등에 표시되도록 기능 요청
- **위치**:
  - `server/controllers/common.js` : POST `/_userav` (업로드), DELETE `/_userav` (삭제) 엔드포인트 추가
  - `client/components/profile/profile.vue` : 아이콘 업로드/삭제 UI 추가, 미리보기 표시
  - `client/components/comments.vue` : 댓글 작성자 아바타 이미지 표시 (없으면 이니셜 fallback)
- **내용**:
  - 이미지 업로드 시 `userAvatars` 테이블에 바이너리 저장, `pictureUrl = 'internal'` 설정 후 JWT 갱신
  - `/_userav/:uid` 엔드포인트로 아바타 서빙 (기존 인프라 활용)
  - 헤더 아바타는 기존 `internal` 처리 로직 활용으로 자동 반영

### [2026-08-29] feat: 위지윅 편집기 이미지 붙여넣기(paste) 지원

- **이유**: HWP 등에서 복사 후 붙여넣기 시 이미지가 편집기에 삽입되지 않는 문제
- **위치**: `client/components/editor/editor-ckeditor.vue`
- **내용**: paste 이벤트에서 clipboard items 중 이미지(image/*)만 가로채어 서버 업로드 후 커서 위치에 삽입. 텍스트/HTML 붙여넣기는 그대로 CKEditor 기본 동작 유지

### [2026-08-29] feat: 페이지 선택 다이얼로그 목록에 파일명/문서제목 구분 표시

- **이유**: 페이지 목록에 문서제목만 보여 파일명을 알 수 없어 혼동 발생
- **위치**: `client/components/common/page-selector.vue`
- **내용**: 우측 페이지 목록에 컬럼 헤더(문서제목/파일명) 추가, 각 항목에 제목(title) + 파일경로(path) 두 줄로 표시

### [2026-08-29] feat: 위지윅 편집기 로컬 파일 드래그&드롭 업로드 지원

- **이유**: Windows 탐색기에서 파일을 편집기로 바로 끌어다 놓으면 자동 업로드 및 본문 삽입이 되도록 UX 개선
- **위치**: `client/components/editor/editor-ckeditor.vue`
- **내용**:
  - CKEditor editable 영역에 `dragover` / `drop` 이벤트 리스너 추가
  - 드롭 시 `/u` 엔드포인트로 파일 업로드 (JWT 인증 포함, folderId=0 루트 폴더)
  - 이미지(`image/*`) → 본문에 이미지로 삽입, 그 외 파일 → 다운로드 링크로 삽입
  - 업로드 중/완료/실패 알림 표시
  - `beforeDestroy`에서 이벤트 리스너 정리

### [2026-08-29] feat: 새 페이지 생성 다이얼로그 기본값 및 안내 문구 추가

- **이유**: 새 문서 생성 시 기본 문서명이 영문 `new-page`로 표시되어 한국어 사용자에게 어색함. 폴더 생성 방법을 모르는 사용자를 위한 안내 문구 필요
- **위치**: `client/components/common/page-selector.vue`
- **내용**:
  - 기본 문서명 `new-page` → `새문서` 로 변경 (props 기본값 및 data 초기값 두 곳)
  - 입력창 하단에 폴더 생성 안내 문구 추가: "폴더 만들기: 문서명 앞에 /폴더명/ 을 입력하시면 해당 폴더가 만들어집니다."

### [2026-08-28] fix: LDAP 로그인 시 사용자 이름 및 아바타 덮어쓰기 방지

- **이유**: LDAP로 로그인할 때마다 LDAP의 displayName이 DB에 저장된 이름을 강제로 덮어써서, 관리자가 Wiki 내에서 이름을 수정해도 다음 로그인 시 원래대로 돌아오는 문제. 내부 아바타(`pictureUrl=internal`)도 LDAP 재로그인 시 덮어쓰이는 문제
- **위치**: `server/models/users.js` (`processProfile` 함수)
- **내용**: `name: displayName` → `name: user.name || displayName` 으로 변경. `pictureUrl: user.pictureUrl === 'internal' ? 'internal' : pictureUrl` 으로 내부 아바타 보호. 기존 이름/아바타가 있으면 유지하고, 없을 때(신규 가입)만 LDAP 값을 사용
