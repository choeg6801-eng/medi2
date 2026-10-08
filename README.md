# Aurelis Trade Console

의료기기 수출입 업무 포털입니다. 한국수출입은행 환율과 최신 뉴스를 실시간으로 불러오고, 선적·인허가·인보이스·재고·업무 노트를 직접 기록할 수 있습니다.

처음 해 보셔도 괜찮습니다. 아래 순서대로 따라 하면 **① 내 컴퓨터에서 실행 → ② API 키 연결 → ③ 인터넷 주소로 배포**까지 할 수 있습니다.

---

## 0. 폴더 구성

```
aurelis-trade-console/
├─ public/index.html   화면 전체 (디자인, 기능, 차트)
├─ api/fx.js           환율 서버 코드: 수출입은행 API → 사이트용 데이터
├─ api/news.js         뉴스 서버 코드: 네이버 검색 API + Google 뉴스 → 사이트용 데이터
├─ lib/util.js         서버 코드가 함께 쓰는 도우미
├─ local-server.js     내 컴퓨터·Render에서 실행할 때 쓰는 서버 (Vercel은 이 파일 대신 api/ 폴더를 씀. 이름을 server.js로 바꾸지 마세요)
├─ .env.example        API 키 입력 예시 (복사해서 .env 로 사용)
├─ package.json        실행 명령 정의
├─ vercel.json         Vercel 배포 설정
└─ .github/workflows/  GitHub Pages 자동 배포 설정
```

API 키는 `api/` 서버 코드에서만 쓰입니다. 화면(`public/`)에는 키가 전혀 들어가지 않으므로, 방문자가 페이지 소스를 봐도 키가 보이지 않습니다.

---

## 1. 준비물 설치 (처음 한 번)

1. **VS Code**: https://code.visualstudio.com 에서 내려받아 설치
2. **Node.js (LTS 버전)**: https://nodejs.org 에서 "LTS"라고 적힌 버전 설치
   - 설치 확인: VS Code를 열고 상단 메뉴 **터미널 → 새 터미널**을 누른 뒤 `node -v` 입력 → `v18` 이상 숫자가 나오면 됩니다.

추가로 설치할 패키지는 없습니다. (`npm install` 불필요)

---

## 2. 내 컴퓨터에서 실행하기

1. 받은 zip 파일의 압축을 풉니다.
2. VS Code에서 **파일 → 폴더 열기**로 `aurelis-trade-console` 폴더를 엽니다.
3. **터미널 → 새 터미널**을 열고 아래를 입력합니다.
   ```
   npm start
   ```
4. 브라우저에서 **http://localhost:3000** 을 엽니다.

키가 없어도 실행됩니다. 이때 환율은 예시 값, 뉴스는 Google 뉴스(키 불필요)로 표시됩니다.
끄려면 터미널을 클릭하고 `Ctrl + C`를 누르세요.

> 코드를 고치면서 확인하고 싶다면 `npm start` 대신 `npm run dev`를 쓰세요. 서버 코드를 저장할 때마다 자동으로 다시 시작합니다. 화면(`public/index.html`)을 고친 뒤에는 브라우저를 새로고침하면 됩니다.

---

## 3. API 키 받기

### 3-1. 한국수출입은행 환율 (필수)
1. 한국수출입은행 오픈API 페이지 접속: https://www.koreaexim.go.kr/ir/HPHKIR020M01?apino=2&viewtype=C
2. 인증키 신청 (이메일 인증 후 바로 발급)
3. 알아둘 점
   - 하루 **1,000회**까지 호출 가능 → 이 프로젝트는 결과를 12시간 저장해 두고 재사용하므로 하루 수십 회만 씁니다.
   - 영업일 **오전 11시경** 그날 환율이 올라옵니다. 주말·공휴일은 직전 영업일 값이 마지막으로 표시됩니다.
   - 호출 주소는 새 도메인 `oapi.koreaexim.go.kr`을 씁니다. (예전 `www.koreaexim.go.kr` 주소는 2026년 4월 30일로 종료)

### 3-1-1. 키 없이 쓰는 대체 환율: ExchangeRate-API
- `KOREAEXIM_API_KEY`를 비워 두면 서버가 자동으로 **ExchangeRate-API 공개 주소**(`open.er-api.com`, 키 불필요)에서 환율을 받아옵니다.
- 수출입은행 키를 넣었는데 오류가 나도 이 주소로 자동 전환됩니다.
- 차이점
  | | 한국수출입은행 | ExchangeRate-API (무료) |
  |---|---|---|
  | 값의 종류 | 국내 은행 **매매기준율** | 국제 **중간 시세** |
  | 갱신 | 영업일 오전 11시경 | 하루 1회 |
  | 지난 추이 | 최근 45일 실제 값 | 없음 (그래프 끝점만 실제 값) |
  | 키 | 필요 | 불필요 (키를 받으면 `EXCHANGERATE_API_KEY`로 사용 가능) |
  | 조건 | — | 화면에 "Rates By Exchange Rate API" 링크 표시 (사이트가 자동 표시), 데이터 재배포 금지 |
- 인보이스 원화 환산·통관 신고에는 은행 매매기준율이나 관세청 고시환율이 기준이 되므로, 업무용으로는 수출입은행 키를 권장합니다.
- 출처를 고정하려면 `FX_PROVIDER=koreaexim` 또는 `FX_PROVIDER=exchangerate-api`를 넣으세요.

### 3-2. 네이버 뉴스 검색 (선택)
1. https://developers.naver.com 로그인 → **Application → 애플리케이션 등록**
2. 사용 API에서 **검색**을 선택, 환경은 **WEB 설정**에 `http://localhost:3000`과 나중에 받을 배포 주소를 입력
3. 발급된 **Client ID**와 **Client Secret**을 복사
   - 하루 25,000회까지 무료입니다.

### 3-3. 키 넣기
1. 폴더의 `.env.example` 파일을 복사해서 이름을 **`.env`** 로 바꿉니다. (VS Code 왼쪽 파일 목록에서 우클릭 → 복사 → 붙여넣기 → 이름 바꾸기)
2. `.env`를 열어 `=` 뒤에 키를 붙여 넣고 저장합니다.
   ```
   KOREAEXIM_API_KEY=발급받은키
   NAVER_CLIENT_ID=발급받은아이디
   NAVER_CLIENT_SECRET=발급받은시크릿
   ```
3. 터미널에서 `Ctrl + C`로 끈 뒤 `npm start`로 다시 실행합니다. 터미널에 "환율 API 키: 설정됨"이 보이면 성공입니다.

### 3-4. 잘 연결됐는지 확인
- 브라우저에서 http://localhost:3000/api/fx 를 열면 환율 데이터(JSON)가 보여야 합니다.
- http://localhost:3000/api/news 를 열면 기사 목록이 보여야 합니다.
- 사이트의 **설정 → 데이터 연동** 화면에서 각 항목이 "연결됨"으로 바뀝니다.
- **환율 & 거래 전략** 화면 제목이 "최근 ○○영업일 추이"로 바뀌면 실제 환율입니다. 수출입은행이 제공하지 않는 통화(베트남 동 등)는 카드에 "예시"라고 표시됩니다.

---

## 4. 인터넷에 올리기 (Vercel, 무료)

1. **GitHub에 올리기**
   - https://github.com 가입 → https://desktop.github.com 에서 GitHub Desktop 설치
   - GitHub Desktop에서 **File → Add local repository**로 이 폴더 선택 → "create a repository" → **Publish repository** (Private 체크 권장)
   - `.env`는 `.gitignore`에 들어 있어 자동으로 빠집니다. 올라간 파일 목록에 `.env`가 없는지 한 번 확인하세요.
2. **Vercel 연결**
   - https://vercel.com 에서 GitHub 계정으로 가입
   - **Add New → Project** → 방금 올린 저장소 **Import**
   - Framework Preset은 **Other** 그대로 둡니다.
   - **Environment Variables**에 `.env`와 같은 이름·값을 하나씩 입력 (`KOREAEXIM_API_KEY` 등)
   - **Deploy** 클릭 → 1분 뒤 `https://프로젝트이름.vercel.app` 주소가 생깁니다.
3. 이후에는 VS Code에서 고친 뒤 GitHub Desktop에서 **Commit → Push**만 하면 Vercel이 자동으로 다시 배포합니다.
4. 네이버 개발자센터의 WEB 설정에 배포 주소를 추가해 두세요.

키를 나중에 바꿨다면 Vercel의 **Settings → Environment Variables**에서 수정한 뒤 **Deployments → Redeploy** 하세요.

> (선택) 서버 함수를 **서울**에서 돌리면 수출입은행·네이버 API 응답이 더 빠릅니다. 배포가 성공한 뒤 Vercel 프로젝트 **Settings → Functions → Function Region**에서 **Seoul (icn1)**을 고르고 Redeploy 하세요.

---

## 4-0. Vercel 대신 Render로 올리기 (Vercel 로그인이 안 될 때)

코드는 그대로 두고 `local-server.js`를 Render가 실행합니다. 무료 플랜은 15분 동안 접속이 없으면 잠들었다가, 다음 접속 때 깨어나느라 첫 화면이 30–50초 늦게 뜰 수 있습니다.

1. https://render.com → **Get Started** → **GitHub로 가입**
2. 대시보드 **New → Blueprint** → 이 저장소 선택 (`render.yaml`을 자동으로 읽습니다)
3. `KOREAEXIM_API_KEY` 값을 입력 (네이버 키는 비워도 됩니다) → **Apply**
4. 몇 분 뒤 `https://aurelis-trade-console.onrender.com` 같은 주소가 생깁니다. `주소/api/fx`를 열어 환율 JSON이 보이면 성공입니다.
5. GitHub Pages와 함께 쓰려면 `public/index.html`의 `REMOTE_API`에 `"https://내주소.onrender.com/api"`를 넣으세요.

키를 바꿀 때: Render 서비스 → **Environment** → 값 수정 → 저장하면 자동으로 다시 시작됩니다.

## 4-1. GitHub Pages로 올리기 (무료, 가장 간단)

GitHub Pages는 **화면만** 올리는 서비스라 서버 코드(`api/`)는 돌아가지 않습니다. 그래서 환율·뉴스는 예시 데이터와 기사 스냅샷으로 보이고, 나머지 기능(기록, 계산기, 분석, 마스코트 등)은 모두 그대로 동작합니다. 실시간 환율·뉴스까지 원하면 아래 "GitHub Pages + Vercel 함께 쓰기"를 보세요.

1. **GitHub 가입**: https://github.com
2. **GitHub Desktop 설치**: https://desktop.github.com 에서 설치 후 GitHub 계정으로 로그인
3. **저장소 만들기**
   - GitHub Desktop → **File → Add local repository** → 압축을 푼 `aurelis-trade-console` 폴더 선택
   - "This directory does not appear to be a Git repository" 가 뜨면 **create a repository** 클릭 → 그대로 **Create repository**
   - 위쪽 **Publish repository** 클릭 → **Keep this code private 체크를 해제** (무료 계정은 공개 저장소에서만 Pages를 쓸 수 있습니다) → Publish
   - 올라가는 파일 목록에 `.env`가 없는지 확인하세요. (`.gitignore`가 자동으로 빼 줍니다)
4. **Pages 켜기**
   - 브라우저에서 내 저장소 페이지 → **Settings → Pages**
   - **Source** 를 **GitHub Actions** 로 선택 (저장할 필요 없이 선택만 하면 됩니다)
5. **배포 확인**
   - 저장소의 **Actions** 탭에서 "GitHub Pages 배포"가 초록색 체크가 되면 완료 (1~2분)
   - 주소: `https://내아이디.github.io/aurelis-trade-console/`
6. **수정할 때**: VS Code에서 고치고 저장 → GitHub Desktop에서 요약을 적고 **Commit to main** → **Push origin**. 1~2분 뒤 사이트에 반영됩니다.

> 이 동작은 `.github/workflows/pages.yml` 파일이 자동으로 해 줍니다. `public` 폴더만 인터넷에 올라가고, `api/`, `.env` 같은 파일은 올라가지 않습니다.

### GitHub Pages + Vercel 함께 쓰기 (실시간 환율·뉴스)
1. 같은 GitHub 저장소를 위 4번 순서대로 Vercel에도 연결하고, Vercel에 API 키를 넣어 배포합니다.
2. `public/index.html` 위쪽의 `const REMOTE_API = "";` 를 찾아 따옴표 안에 Vercel 주소를 넣습니다.
   ```
   const REMOTE_API = "https://내프로젝트.vercel.app/api";
   ```
3. Commit → Push 하면 GitHub Pages 사이트도 Vercel의 실시간 환율·뉴스를 받아 옵니다. (API 키는 Vercel에만 있고, GitHub에는 올라가지 않습니다)

---

## 5. 어디를 고치면 되나요?

| 하고 싶은 일 | 고칠 곳 |
|---|---|
| 뉴스 검색어 바꾸기 | `.env`의 `NEWS_KEYWORDS_KO`, `NEWS_KEYWORDS_EN` (쉼표로 구분) |
| 뉴스 분류(규제·인허가 등) 규칙 | `api/news.js`의 `TAG_RULES`, `REGION_RULES` |
| 불러올 환율 통화 추가 | `api/fx.js`의 `WANT` 목록, 그리고 `public/index.html`의 `const FX=` 목록 |
| 환율 기간 | `.env`의 `FX_DAYS` (기본 45일, 주말 제외) |
| 회사명·색상·문구 | `public/index.html` 위쪽 `:root{ ... }` 색상 값(`--accent`가 대표 색), 화면 문구는 각 `def('모듈이름', ...)` 부분 |
| 로고 | `public/brand/` 파일 교체, 화면 왼쪽 위 로고는 `public/index.html`에서 `lgSide`로 검색 |

---

## 6. 문제 해결

**환율이 예시 값에서 안 바뀌어요**
- http://localhost:3000/api/fx 를 직접 열어 보면 원인이 한국어로 나옵니다.
  - "인증키가 올바르지 않습니다" → `.env`의 키에 공백이나 따옴표가 섞이지 않았는지 확인
  - "호출 한도를 넘었습니다" → 다음 날 다시 시도
  - "최근 환율 데이터를 찾지 못했습니다" → 오전 11시 이전이거나 연휴일 수 있습니다. 기간을 늘리려면 `FX_DAYS=60`
  - "unable to verify the first certificate" 같은 인증서 오류 → 회사 네트워크(보안 프로그램)가 막는 경우가 많습니다. 다른 네트워크에서 시도하거나, Vercel에 배포한 주소에서 확인하세요.
- `.env`를 고친 뒤에는 서버를 껐다 켜야(`Ctrl + C` → `npm start`) 반영됩니다.

**뉴스가 스냅샷(고정 목록)으로만 나와요**
- http://localhost:3000/api/news 를 열어 오류 문구를 확인하세요. 네이버 키가 틀려도 Google 뉴스는 계속 동작합니다.

**입력한 기록이 사라졌어요**
- 이 버전은 기록을 **브라우저에 저장**합니다. 다른 브라우저나 기기에서는 보이지 않고, 브라우저 데이터를 지우면 사라집니다.
- **내 기록 → 내 정보 · 데이터 관리 → 백업 파일 받기**로 주기적으로 백업하고, 다른 곳에서는 "백업에서 복원"으로 옮기세요.

**`npm`을 찾을 수 없다고 나와요**
- Node.js 설치 후 VS Code를 완전히 껐다가 다시 켜세요.

---

## 7. 다음 단계 (필요해지면)

- **여러 사람이 같은 기록을 공유**: 로그인과 데이터베이스가 필요합니다. Supabase(무료 요금제 있음)를 붙이면 지금의 "브라우저 저장" 부분을 서버 저장으로 바꿀 수 있습니다.
- **KOTRA 해외시장뉴스**: 공공데이터포털(data.go.kr)에서 활용 신청 후 `api/news.js`에 출처를 하나 더 추가하면 됩니다.
- **관세청 UNI-PASS 통관 조회**: UNI-PASS 오픈API 인증키를 받아 `api/customs.js`를 만들면 선적 추적 화면의 통관 상태를 자동으로 채울 수 있습니다.
- 화면의 제품·거래처·인허가 등은 가상의 예시 데이터로 시작합니다. 첫 화면에서 "빈 상태로 시작"을 고르거나, **내 정보 · 데이터 관리 → 모든 기록 비우기**로 지울 수 있습니다.

---

## 8. 로고 파일

`public/brand/` 폴더에 임의로 만든 로고가 들어 있습니다. (가상의 회사용 예시 로고입니다. 실제 회사명으로 쓰기 전에는 상표 등록 여부를 확인하세요.)

| 파일 | 쓰임 |
|---|---|
| `mark.svg`, `mark-512.png` | 심볼만 (앱 아이콘, 파비콘, 프로필 사진) |
| `logo-horizontal.svg`, `.png` | 밝은 배경용 가로형 로고 (문서, 명함, 인보이스 머리말) |
| `logo-horizontal-white.svg`, `.png` | 어두운 배경용 가로형 로고 |

심볼은 회사 이니셜 **A**의 가로획을 **심전도 파형**으로 바꾼 모양이고, 청록(#16B3AE)에서 의료용 블루(#0B57B8)로 이어지는 색을 씁니다. SVG는 글꼴 없이도 똑같이 보이도록 글자를 도형으로 바꿔 두었습니다.
