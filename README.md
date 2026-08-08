# 랴오헝 인터뷰 LLM Wiki

화웨이 반도체 수석과학자 랴오헝의 인터뷰를 7개 장과 35개 핵심 주제로 정리한 독립 정적 웹 위키입니다. 기존의 산업 연구자 필드노트 다크 테마를 유지하며, 빌드 단계나 런타임 프레임워크 없이 `index.html`, `styles.css`, `script.js`만으로 서비스됩니다.

## 로컬 실행

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

브라우저에서 <http://127.0.0.1:4173>을 엽니다.

## 검증

Node.js 20 이상이 필요합니다. 최초 한 번 의존성과 Chromium을 설치합니다.

```bash
npm ci
npx playwright install chromium
npm test
```

- `npm run validate`: HTML 파싱, 주제 1~35의 단일 존재, 장 1~7, 내부 앵커, Bilibili 타임스탬프 35개 이상, 로컬 자산, CSS 기본 구문, JavaScript 구문을 검사합니다.
- `npm run test:browser`: Chromium에서 390px 모바일 및 1280px 데스크톱 뷰를 열어 메뉴, 핵심 콘텐츠, 가로 overflow, 런타임 오류를 검사합니다. 테스트용 로컬 서버는 자동으로 시작됩니다.

## Vercel

프로젝트 루트를 그대로 연결합니다.

- Framework Preset: `Other`
- Build Command: 없음
- Output Directory: `.`

`vercel.json`은 clean URL만 지정합니다. 별도 빌드나 서버 함수는 없습니다.

## 파일

- `index.html` — 인터뷰 위키 본문 및 메타데이터
- `styles.css` — 모바일 우선 다크 필드노트 UI
- `script.js` — 목차 drawer, 읽기 진행률, 현재 위치 표시
- `scripts/validate.py` — 정적 구조 및 기본 구문 검사
- `tests/site.spec.js` — 390px/1280px 브라우저 검증
- `playwright.config.js` — 로컬 서버와 Chromium 테스트 설정
