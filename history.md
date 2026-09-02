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

### [2026-09-02] fix: 문서 보기 화면 로그인 팝업에서 로그인 실패하는 문제 수정 및 1순위 인증전략에 맞춰 폼 전환

- **이유**: 비로그인 사용자에게 뜨는 로그인 팝업(`page.vue`)이 로그인 뮤테이션에 항상 `strategy: 'ldap'`을 하드코딩해서 보내 로그인 시도가 항상 실패했음. `/login` 페이지(`client/components/login.vue`)는 `authentication.activeStrategies` 쿼리로 얻은 전략 인스턴스의 실제 `key`를 사용하는데, 관리자 화면에서 인증 전략을 추가하면 그 `key`는 `uuid()`로 발급되고(`client/components/admin/admin-auth.vue`) 전략 타입 문자열('ldap')과 다름 - 서버(`server/models/users.js`의 `login()`)가 `WIKI.auth.strategies[opts.strategy]`를 찾지 못해 `AuthProviderInvalid`로 실패. 또한 팝업이 LDAP 폼으로 고정돼 있어, 사이트 설정상 1순위(order) 인증전략이 로컬(일반) 로그인인 경우에도 LDAP 폼이 떠서 실제 로그인 방식과 안 맞는 문제도 있었음
- **위치**: `client/themes/default/components/page.vue`
- **내용**: `fetchLoginStrategy()` 메서드 추가 - `activeStrategies(enabledOnly: true)`를 `order`로 정렬해 폼 로그인을 지원하는(`useForm`) 1순위 전략을 찾아 인스턴스 `key`/모듈 `key`/`usernameType`/`displayName`을 `loginStrategy`에 저장. 팝업이 뜰 때(`mounted`) 미리 조회해두고, `loginSubmit()`에서 하드코딩된 `'ldap'` 대신 `loginStrategy.key`를 로그인 뮤테이션에 사용. 팝업 제목/아이콘/아이디 입력란 라벨이 1순위 전략이 LDAP(`moduleKey === 'ldap'`)이면 "로그인 LDAP(ID/PW)"·아이디 입력으로, 그 외(로컬 등, `usernameType === 'email'`)면 일반 로그인 제목·이메일 주소 입력으로 자동 전환. 전략을 못 찾으면 로그인 시도 없이 안내 메시지 표시

### [2026-08-30] fix: "문서정보수정" 팝업 미표시 및 편집기 진입 시 빈 화면 버그 수정

- **이유**: 직전 커밋(문서정보수정 팝업 추가)에서 실기기 테스트 결과 두 가지 문제 발견 - (1) 팝업 자체가 안 뜸 (2) "수정" 버튼으로 편집기 진입 시 빈 화면이 나옴
- **위치**:
  - `client/components/common/nav-header.vue` : `pages.single` 조회에서 `publishStartDate`/`publishEndDate` 필드를 뺌 - 서버의 GraphQL `Date` 스칼라(`server/graph/scalars/date.js`)가 `value.toISOString()`을 무조건 호출하는데, 예약 발행이 없는 문서는 DB에 빈 문자열로 저장돼 있어 이 필드를 조회하면 서버 에러가 나서 쿼리 전체(및 팝업 오픈)가 실패하고 있었음 (대부분의 문서가 예약 발행을 안 써서 사실상 항상 재현됨)
  - `client/components/editor/editor-modal-properties.vue` : 스케줄링 값을 더 이상 안 가져오므로 `viewModeOnly`일 때 스케줄링 탭을 비활성화(잘못된 빈 값으로 실제 예약 설정을 덮어쓰는 걸 방지). 경로 힌트 문구를 인라인 삼항식(작은따옴표 안에 이스케이프한 작은따옴표 중첩)에서 computed property(`pathHint`)로 분리 - 이 템플릿 파싱 문제가 `editor-modal-properties.vue`를 통째로 깨뜨려서, 이 컴포넌트를 공유하는 편집기 화면(editor.vue)까지 같이 빈 화면이 됐던 게 진짜 원인
- **내용**: 두 버그 모두 이번 세션 안에서 바로 발견해 수정. 예약 발행이 있는 문서를 "문서정보수정"으로 열면 스케줄링 탭이 비활성화되는 제약이 남아있음 (Date 스칼라 자체를 고치는 건 더 큰 범위라 이번엔 보류)

### [2026-08-30] feat: 문서 보기 화면에서 바로 "문서정보수정" 팝업, 편집기 진입 시 로딩 표시 추가

- **이유**: (1) 페이지 분량이 많은 문서를 "수정" 눌러 편집기로 들어갈 때 CKEditor가 본문을 화면에 그리는 동안 아무 표시 없이 멈춘 것처럼 보이던 문제. (2) 문서 보기 화면에서 편집기로 안 넘어가고 제목/설명/태그 등 정보만 바로 고칠 수 있는 메뉴 요청
- **위치**:
  - `client/components/editor/editor-ckeditor.vue` : 기존 문서 편집 진입 시(`setData()` 호출) 로딩 오버레이 추가. `setData()`가 동기적으로 메인 스레드를 오래 점유할 수 있어, 오버레이를 실제로 화면에 페인트한 뒤(더블 `requestAnimationFrame`)에 `setData()`를 호출하도록 순서 조정
  - `server/graph/schemas/page.graphql`, `server/graph/resolvers/page.js`, `server/models/pages.js` : 새 경량 mutation `pages.updateProperties` 추가 - 본문(content)은 건드리지 않고 제목/설명/태그/공개여부/예약발행/스크립트만 저장. 기존 `pages.update`는 본문이 비어있으면 실패하고 호출마다 버전 이력을 생성하는 "전체 저장" 구조라 정보만 고치는 용도에 안 맞았음
  - `client/components/editor/editor-modal-properties.vue` : `viewModeOnly` prop 추가 - 본문 업로드 탭 숨김, 경로/파일명 읽기전용(경로 변경은 기존 "이동" 기능 사용), 확인 시 `pages.updateProperties` 직접 호출
  - `client/components/common/nav-header.vue` : "현재 문서" 메뉴에 "문서정보수정" 항목 추가. 클릭 시 문서 보기 화면에 없던 예약발행/스크립트 데이터를 `pages.single`로 미리 채운 뒤 `editor-modal-properties`를 `view-mode-only`로 오픈
- **내용**: 저장 시 Vuex `page` 스토어를 통해 화면의 제목/설명/태그가 새로고침 없이 바로 반영됨

### [2026-08-30] feat: txt/md 문서 변환 구현, 원본 파일 자산 저장 및 다운로드 링크 추가

- **이유**: "본문작성을 문서로" 기능의 마지막 남은 형식(txt/md)까지 구현 요청. 이어서 "업로드한 원본 파일이 서버에 남아있냐"는 질문에 확인해보니 지금까지는 변환 후 원본이 전혀 보존되지 않고 있었음(PDF도 페이지 스크린샷만 자산으로 남고 원본 PDF는 폐기) - 원본을 정식 자산으로 저장하고 본문 상단에 다운로드 링크를 넣어달라는 요청
- **위치**:
  - `server/helpers/officeConvert.js` : `convertTxtToHtml`(BOM 감지, UTF-8 실패 시 CP949/EUC-KR로 재시도), `convertMarkdownToHtml`(Wiki.js 자체 페이지 렌더러 markdown-core와 동일한 markdown-it 옵션 + 표/체크박스/각주/속성 플러그인 재사용, 새 의존성 없이 기존 설치된 패키지만 사용) 추가
  - `server/controllers/upload.js` : `.txt`/`.md` 분기 연결. `uploadOriginalDocument()` 신규 - 변환 성공 후 원본 파일 버퍼를 `WIKI.models.assets.upload`로 정식 자산 저장(권한 없으면 조용히 건너뛰고 변환된 본문은 그대로 제공), 성공 시 본문 맨 위에 `📎 원본 파일: [파일명]` 다운로드 링크 삽입
  - `package.json`/`yarn.lock` : `iconv-lite` 추가 (한글 텍스트 파일 인코딩 감지용, 유일한 신규 의존성)
- **내용**: 이제 hwp/hwpx/pdf/doc/docx/xls/xlsx/pptx/txt/md 전부 실제 변환되고, 전부 원본 다운로드 링크가 함께 붙음. 구버전 바이너리 .ppt만 여전히 미지원(라이브러리 부재)

### [2026-08-30] feat: PDF 업로드 실시간 진행률/렌더링 대기 표시, 한글 텍스트 깨짐 자동 감지+OCR 대체

- **이유**: 문서 업로드 크기 제한(5MB)에 걸려 서버가 HTML 에러 페이지를 반환해 "Unexpected token '<'" 오류가 나던 문제, 변환은 다 끝났는데 본문에 실제로 반영되는(CKEditor 렌더링) 동안 진행바가 멈춘 것처럼 보이던 문제, 그리고 텍스트 레이어가 있는 PDF인데도(ToUnicode CMap이 없는 폰트) 한글이 완전히 깨진 문자로 추출되던 문제를 순서대로 발견하고 수정
- **위치**:
  - `server/controllers/upload.js` : 문서 업로드 전용 상한을 50MB로 분리하고 multer 에러를 JSON으로 반환하도록 수정. `/u/parse-document` 응답을 NDJSON 스트림으로 바꿔 진행 상황(`{type:'progress'}`)을 실시간 전송, 완료/실패도 스트림 이벤트(`{type:'complete'|'error'}`)로 알림 (이미 응답이 시작된 뒤엔 HTTP 상태 코드를 바꿀 수 없어서)
  - `server/helpers/pdfConvert.js` : 페이지별 진행률 콜백(`onProgress`) 추가. 추출된 텍스트의 정상 문자(한글/영문/숫자/일반 문장부호) 비율이 낮으면 "인코딩 깨짐"으로 판단해 텍스트가 있어도 OCR로 대체(`looksGarbled`). OCR 해상도 150→300dpi, tesseract를 LSTM 전용 모드(`--oem 1`)로, Alpine 로케일 미비 대응으로 `LANG=C.UTF-8` 명시
  - `client/components/editor/editor-modal-properties.vue` : NDJSON 스트림을 읽어 진행바/경과시간/(PDF의 경우) 예상 남은 시간 표시. 변환 완료 후에도 에디터가 실제로 화면에 다 그릴 때까지("본문 작성 중") 별도 대기 단계 추가. 진행 중에는 항상 ✍️ 이모지가 흔들리는 애니메이션으로 "멈추지 않았음"을 표시. 서버가 이미 보낸 페이지 카운트를 화면에서 또 붙이던 중복 표시(`(179/180) (179/180)`)도 수정
  - `client/components/editor/editor-ckeditor.vue` : `overwriteEditorContent` 처리 후 `requestAnimationFrame` 두 번으로 실제 화면 페인트가 끝난 시점을 감지해 `editorContentOverwritten` 완료 신호를 쏘도록 추가
- **내용**: 실제 사용자 PDF 파일(`지능형_전력망_사이버보안_가이드라인(2026.03).pdf`, 180페이지, Adobe InDesign/Distiller 생성)로 poppler `pdftotext`와 직접 대조해 한글 페이지가 라이브러리와 무관하게 동일하게 깨짐을 확인, 정상 문자 비율 검사로 해결됨을 검증. 단, 알파벳만으로 이뤄진 자리이동식 깨짐(예: 영문 참고문헌 페이지)은 이번 범위에서 제외(요청에 따라 한글 케이스만 처리)

### [2026-08-29] feat: doc/docx/xls/xlsx/pptx 문서→본문 변환 구현, hwp 변환 오류 수정

- **이유**: hwp/hwpx/pdf에 이어 doc, xlsx, ppt 계열도 처리해달라는 요청. 구현 직후 실기기 테스트에서 hwp 업로드 시 "HwpxReader is not a constructor" 오류 발견
- **위치**:
  - `server/helpers/officeConvert.js` (신규): `officeparser`로 docx/pptx/xlsx를 표/서식 보존된 HTML로 변환, `word-extractor`로 구버전 바이너리 .doc는 텍스트만 추출, `xlsx`(SheetJS)로 구버전 바이너리 .xls는 시트별 HTML 표로 변환
  - `server/controllers/upload.js` : 위 함수들 연결, 허용 확장자에 `.xls .xlsx .pptx` 추가. 구버전 바이너리 `.ppt`는 지원 가능한 순수 JS 라이브러리가 없어 제외
  - `server/controllers/upload.js` (버그 수정) : hwp/hwpx 변환에서 `@ssabrojs/hwpxjs`를 동적 import 후 `{ default: HwpxReader }`로 구조분해했는데, 해당 패키지의 `index.js`가 `export * from`으로만 재수출해서 default export가 전달되지 않아 `HwpxReader`가 `undefined`였던 문제. `{ HwpxReader }`(named export)로 수정
  - `package.json`/`yarn.lock` : `officeparser`, `word-extractor`, `xlsx` 추가
- **내용**: doc/xls는 표/서식이 원본 포맷 자체의 구조 정보가 빈약해 텍스트/표 정도만 나옴. 이미지는 hwp/hwpx와 동일하게 이번 단계에서 제외

- **이유**: hwp/hwpx에 이어 PDF도 실제 변환 구현 요청. 텍스트 PDF와 OCR이 필요한 스캔본 PDF가 섞여 있고, 대부분 한글이며 표/이미지가 많다는 요구사항. 표 구조 복원과 개별 이미지 추출은 진짜 어려운 문제라 페이지 전체를 스크린샷으로 함께 첨부하는 방식으로 합의
- **위치**:
  - `server/helpers/pdfConvert.js` (신규): `pdfjs-dist`로 페이지별 텍스트 레이어 추출(좌표 기반 줄 재구성), `poppler-utils`(`pdftoppm`)로 페이지를 PNG로 래스터화, 텍스트가 거의 없으면(10자 미만) `tesseract-ocr`(kor+eng)로 OCR, 페이지 PNG는 `WIKI.models.assets.upload`로 정식 자산 업로드 후 본문에 텍스트+스크린샷을 페이지별로 나열한 HTML 반환
  - `server/controllers/upload.js` : `/u/parse-document`에 `.pdf` 분기 연결
  - `dev/build/Dockerfile` : 릴리즈 이미지에 `poppler-utils tesseract-ocr tesseract-ocr-data-eng tesseract-ocr-data-kor tesseract-ocr-data-osd` apk 패키지 추가 (네이티브 컴파일 불필요)
  - `package.json`/`yarn.lock` : `pdfjs-dist` 추가 (ESM 전용이라 동적 import로 사용)
- **내용**: 암호화/손상된 PDF는 한글 에러 메시지로 안내. 페이지 이미지 업로드 권한(`write:assets`) 없으면 처음부터 명확히 실패. 표는 구조 복원 없이 텍스트로만, 대신 페이지 스크린샷을 나란히 첨부해 원본 레이아웃 확인 가능

### [2026-08-29] feat: hwp/hwpx 실제 문서→본문 변환 구현

- **이유**: "본문작성을 문서로" 업로드 기능의 1단계(UI/업로드 골격)에 이어, hwp/hwpx부터 실제 파싱을 구현해달라는 요청
- **위치**:
  - `server/controllers/upload.js` : `@ssabrojs/hwpxjs`(HWP 5.0/CFB 및 HWPX/OWPML 모두 지원하는 순수 JS 라이브러리, HWP 파서는 rhwp(Rust)를 TS로 포팅한 것)로 `.hwpx`는 바로, `.hwp`는 `hwpToHwpx` 변환 후 `extractHtml`로 표/스타일 보존한 HTML 추출. 암호화/미지원 버전/손상 파일은 라이브러리 전용 에러 클래스를 잡아 한글 메시지로 안내
  - `client/components/editor/editor-modal-properties.vue` : 업로드 UX를 "선택 즉시 서버 요청 + 재확인 팝업"에서 "파일 선택 시 파일명만 표시 → 다이얼로그 상단 확인 버튼을 눌러야 업로드/변환 진행 + 진행바 표시"로 변경 (재확인 팝업 제거)
  - `package.json`/`yarn.lock` : `@ssabrojs/hwpxjs` 추가 (ESM 전용, 동적 import로 사용)
- **내용**: 이미지는 이번 단계에서 제외(`renderImages: false`), 이미지 자산 연동은 다음 단계로. pdf/doc/docx/txt/md는 아직 안내 문구만 반환하는 이전 단계 상태 유지

### [2026-08-29] feat: 페이지 등록 정보 팝업 드래그 이동 및 여백 축소

- **이유**: "페이지 등록 정보" 다이얼로그도 위치 선택 팝업처럼 화면 안에서 옮길 수 있어야 한다는 요청, 그리고 다이얼로그 내부 섹션/요소 간 여백이 너무 넓어 좁혀달라는 요청
- **위치**: `client/components/editor/editor-modal-properties.vue`
- **내용**:
  - 원래 `.dialog-header`가 `v-card` 바깥의 형제 요소라 드래그 시 함께 움직일 수 없었음 → `v-card` 안으로 이동시키고 타이틀 바에 mousedown 드래그 핸들러 추가 (page-selector와 동일한 패턴, 드래그 시작 시 너비를 같이 고정해 커지는 문제 방지)
  - 각 섹션 `v-card-text`의 `pt-5`/`pb-5`(20px) → `pt-2`/`pb-2`(8px), 라벨 하단 `pb-5`→`pb-1`, 그리드 거터 `grid-list-lg`→`grid-list-md`, 태그 칩 그룹 `mb-5`→`mb-2`로 축소

### [2026-08-29] feat: "본문작성을 문서로" 업로드 코너 추가 (1단계 - UI/업로드 골격)

- **이유**: 기존에 갖고 있던 문서(hwp/pdf/doc/docx/txt/md)를 업로드해서 위키 본문으로 바로 등록하고 싶다는 요청. hwp/구.doc는 신뢰할 만한 Node 파싱 라이브러리가 없거나 아예 없어 실제 파싱은 다음 단계로 미루고, 이번엔 업로드→반영까지의 전체 흐름만 구현
- **위치**:
  - `client/components/editor/editor-modal-properties.vue` : "경로/파일명"과 "분류" 사이에 문서 업로드 섹션, 하단에 내용 있을 때 "하단에 추가"/"덮어쓰기" 선택하는 확인 다이얼로그 추가 (업로드만으로 자동 반영되지 않고 확인 버튼을 눌러야 본문에 반영됨)
  - `server/controllers/upload.js` : 새 라우트 `POST /u/parse-document` - 확장자 화이트리스트(hwp/pdf/doc/docx/txt/md) 검증, write:pages/manage:pages/manage:system 권한 체크, 현재는 실제 파싱 없이 안내 문구를 본문 콘텐츠로 반환 (다음 단계에서 mammoth/pdf-parse/hwp.js 등으로 교체 예정)
- **내용**: `editor/content` 스토어 값을 직접 갱신하고 `overwriteEditorContent` 이벤트로 CKEditor에 반영 (기존 충돌 해결 기능과 동일한 메커니즘 재사용)

### [2026-08-29] fix: 페이지 선택 팝업 드래그 시 너비 확대 버그 수정, 파일명 입력창 Enter로 선택

- **이유**: 드래그로 팝업을 옮기면 `position: fixed` 전환 시 Vuetify가 부여하던 max-width(850px) 제약이 풀려 화면 거의 전체로 커지는 버그 발견. 파일명 입력 후 마우스로 "선택" 버튼을 눌러야 해서 불편하다는 요청
- **위치**: `client/components/common/page-selector.vue`
- **내용**: 드래그 시작 시점의 실제 너비(`getBoundingClientRect().width`)를 `dragWidth`로 저장해 `position: fixed` 전환 후에도 고정폭 유지. 파일명 `v-text-field`에 `@keydown.enter='isValidPath && open()'` 추가해 Enter로 "선택" 버튼과 동일하게 동작

### [2026-08-29] feat: 페이지 선택 팝업 타이틀 바 드래그 이동 기능 추가

- **이유**: 새 문서 만들기/이동/링크 삽입 시 뜨는 위치 선택 팝업이 화면 중앙에 고정돼 있어, 팝업에 가려진 뒤쪽 내용을 보기 위해 자유롭게 옮길 수 있어야 한다는 요청
- **위치**: `client/components/common/page-selector.vue`
- **내용**: 팝업 상단 타이틀 바(`.dialog-header`)에 mousedown 드래그 핸들러 추가. 드래그 시작 시 카드를 `position: fixed`로 전환해 마우스 이동에 따라 좌표를 갱신하고, 팝업을 껐다 켜면 원래 중앙 위치로 리셋됨. 이 컴포넌트는 새 문서 만들기/이동/링크 삽입 세 곳에서 공유되므로 모두 동일하게 적용됨

### [2026-08-29] feat: 사이드바 최근 문서 위젯에 "more..." 더보기 페이지 추가, 최근 댓글 문서 위젯 신설

- **이유**: 사이드바 "최근 생성된 문서"/"최근 수정된 문서"가 5개까지만 보여서 전체 목록을 볼 방법이 없었음. "최근 댓글 문서" 위젯도 요청됨
- **위치**:
  - `server/graph/schemas/comment.graphql`, `server/graph/resolvers/comment.js` : `comments.recentPages` 쿼리 신설 (댓글 테이블을 pageId로 그룹핑해 최신 댓글순 정렬)
  - `server/controllers/common.js`, `server/views/recent.pug` : `/r`, `/r/*` 라우트 및 뷰 신설
  - `client/components/recent-pages.vue` : 새 "문서 목록" 페이지 (생성/수정/댓글 탭 전환, `?type=` 쿼리로 상태 유지)
  - `client/graph/common/common-comments-query-recent.gql` : recentPages 쿼리 정의
  - `client/client-app.js` : `RecentPages` 컴포넌트 전역 등록
  - `client/themes/default/components/page.vue` : 최근 생성/수정 패널에 "more..." 링크 추가, "최근 댓글 문서" 패널 신설 및 `fetchRecentPages`에서 댓글 조회 추가 (문서 조회 권한과 별도 try/catch로 분리해 한쪽 권한이 없어도 다른 위젯이 안 깨지게 함)
- **내용**: 각 사이드바 패널 하단에 "more..." 항목을 추가해 `/r?type=created|updated|commented`로 이동. 새 페이지는 최대 100개까지 불러와 클라이언트 사이드 페이지네이션(`v-data-iterator`)으로 표시

### [2026-08-29] perf: Docker 빌드 시 소스만 바뀌어도 yarn install 재실행되지 않도록 레이어 순서 조정

- **이유**: 재배포 시 소스 파일 하나만 바뀌어도 yarn install 전체가 매번 다시 실행돼 빌드가 느렸음. "변경된 것만 처리되게 해달라"는 요청에 따라 원인을 찾아 수정
- **위치**: `dev/build/Dockerfile`
- **내용**: assets 스테이지에서 COPY 순서를 package.json/yarn.lock/patches → yarn install → client/dev 등 소스 코드 순으로 재배치하여, 의존성이 그대로면 install 레이어가 Docker 캐시로 재사용되게 함. 누락돼 있던 yarn.lock COPY도 추가해 `--frozen-lockfile`이 실제 lock 파일을 참조하도록 수정

### [2026-08-29] fix: 각주 버튼 라벨/위치 변경, 본문 각주 클릭 시 팝업 레이어 추가, DEVELOPMENT VERSION 배너 제거

- **이유**: 각주 버튼 명칭('주석 삽입')과 위치(툴바 맨 끝)가 요구와 맞지 않았고, 본문에서 각주 번호 클릭 시 페이지 하단으로 스크롤되는 방식이 불편해 팝업으로 바로 내용을 확인하고 싶다는 요청. 배포 이미지에 DEVELOPMENT VERSION 배너가 노출되는 문제도 함께 해결
- **위치**:
  - `client/components/editor/editor-ckeditor.vue` : 각주 버튼 라벨/위치
  - `client/themes/default/components/page.vue` : 각주 섹션 제목, 팝업 레이어
  - `dev/build/Dockerfile` : DEVELOPMENT VERSION 배너 제거 (dev:false 패치)
- **내용**:
  - 에디터 툴바의 각주 버튼 라벨을 '주석 삽입' → '각주' + 위첨자 asterisk 아이콘으로 변경, componentFactory로 todoList/specialCharacters 버튼을 찾아 그 사이(구분선-각주-구분선)로 위치 이동
  - 뷰어 하단 각주 섹션 제목을 '주석' → '각주'로 변경 (기존 '── 주석 ──' 구분선도 정규식으로 계속 인식하여 하위호환 유지)
  - 본문 각주 번호 클릭 시 스크롤 대신 드래그 가능한 v-card 팝업(수정/닫기 버튼 포함)을 열도록 openFootnotePopup/startFootnoteDrag/footnoteEdit 메서드 추가
  - 릴리즈 이미지 빌드 단계에서 package.json의 `"dev": true`를 sed로 false로 패치해 DEVELOPMENT VERSION 배너 억제

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

