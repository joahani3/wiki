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

### [2026-08-29] feat: 새 페이지 생성 다이얼로그 기본값 및 안내 문구 추가

- **이유**: 새 문서 생성 시 기본 문서명이 영문 `new-page`로 표시되어 한국어 사용자에게 어색함. 폴더 생성 방법을 모르는 사용자를 위한 안내 문구 필요
- **위치**: `client/components/common/page-selector.vue`
- **내용**:
  - 기본 문서명 `new-page` → `새문서` 로 변경 (props 기본값 및 data 초기값 두 곳)
  - 입력창 하단에 폴더 생성 안내 문구 추가: "폴더 만들기: 문서명 앞에 /폴더명/ 을 입력하시면 해당 폴더가 만들어집니다."

### [2026-08-28] fix: LDAP 로그인 시 사용자 이름 덮어쓰기 방지

- **이유**: LDAP로 로그인할 때마다 LDAP의 displayName이 DB에 저장된 이름을 강제로 덮어써서, 관리자가 Wiki 내에서 이름을 수정해도 다음 로그인 시 원래대로 돌아오는 문제
- **위치**: `server/models/users.js` 239번째 줄 (`processProfile` 함수)
- **내용**: `name: displayName` → `name: user.name || displayName` 으로 변경. 기존에 저장된 이름이 있으면 유지하고, 없을 때(신규 가입)만 LDAP 값을 사용하도록 수정
