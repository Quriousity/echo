# ECHO

노트북 한 대를 회의 자리에 놓고, 한국어·영어·중국어·일본어가 오가는 대화를 **고른 언어 수만큼 나눈 화면에 나란히 쌓아 주는** 개인용 통역 도구. (화면 문구는 영어)

```
┌──────────────┬──────────────┬──────────────┐
│ Korean       │ English      │ Japanese     │  ← 보여 줄 언어는 직접 고르고 끌어서 순서 변경
├──────────────┼──────────────┼──────────────┤
│🎤 안녕하세요…  │ Hello…       │ こんにちは…   │  ← 한 묶음 = 한 줄
│ 가격은…       │⌨ The price…  │ 価格は…      │  ← 🎤/⌨ = 원문 칸
└──────────────┴──────────────┴──────────────┘
```

## 실행

```bash
npm install
cp .env.example .env.local   # OPENAI_API_KEY 채우기
npm run dev          # http://localhost:3000
```

Chrome / Edge 에서 열고 마이크를 허용한다. 오래 쓸 때는 `npm run build && npm start` 가 더 가볍다.

## 사용법

| 조작 | 키 |
|---|---|
| 보여 줄 언어 고르기 | 첫 화면에서 선택 → 열 머리의 **+ KO** 등으로 추가, **×** 로 빼기 |
| 열 순서 바꾸기 | 열 머리의 언어 칩을 좌우로 끌기 |
| 문장 한 묶음 번역 | 하단 입력창에 쓰고 `Enter` (`Shift+Enter` 줄바꿈) |
| 음성 한 묶음 번역 | **Speak** 로 시작 → **End** 로 끝 (입력창 밖에서 `Space`) |
| 원문 언어: 자동 / 한 / 영 / 중 / 일 | 하단 왼쪽, 또는 `0`~`4` |
| 글자 크기 | A− / A+ |
| 테마: 자동 / 라이트 / 다크 | 상단 ◐ 버튼 |
| 이 줄만 Sol 로 다시 번역 (나중에 추가한 칸도 채움) | 줄에 마우스 → **Refine** |
| 실패한 줄 다시 처리 | **Retry** |
| 기록 내보내기 | Export → md / txt / srt |
| 용어집 · 번역 모델 | ⚙ Settings |

- 기록은 브라우저(IndexedDB)에 자동 저장 — 새로고침해도 남는다. New session 을 누르면 이전 기록은 보관하고 새로 시작.
- 녹음 중에는 화면이 꺼지지 않는다(Wake Lock).

## 중국어·일본어 입력기 추가

입력창에 중국어·일본어를 직접 치려면 OS 입력기를 추가한다 (말로 하는 건 입력기 없이 된다).

- **macOS**: 시스템 설정 → 키보드 → 텍스트 입력 → 편집 → `+` → 중국어(간체) **병음 – 간체** / 일본어 **로마자** 입력. 전환은 `Ctrl+Space` 또는 🌐 키.
- **Windows 11**: 설정 → 시간 및 언어 → 언어 및 지역 → 언어 추가 → **中文(简体)** / **日本語** (음성·필기 등 선택 기능은 꺼도 됨). 전환은 `Win+Space`.
- 중국어는 병음(`nihao` → Space), 일본어는 로마자(`konnichiha` → Space 로 변환 → Enter)로 친다. 조합 중의 Enter 는 글자 확정이라 전송되지 않는다.

## 구성

| 항목 | 선택 |
|---|---|
| 런타임 / 프레임워크 | Node.js 24 LTS · Next.js 16.4 (Active LTS) · React 19 · Tailwind 4 |
| 녹음 | 브라우저 `MediaRecorder` (webm/opus, Safari 는 mp4) — 시작~끝을 한 묶음으로 |
| 전사 | OpenAI `gpt-transcribe` — `languages: [ko, en, zh, ja]`, 용어집을 `keywords` 로, 직전 문장을 `prompt` 로 |
| 번역 | OpenAI `gpt-6-luna` (기본, `reasoning.effort: none`) · Refine 은 `gpt-6-sol` — 화면에 띄운 언어만 JSON 스키마로 |
| 저장 | zustand + IndexedDB(idb-keyval) |

```
app/api/transcribe   음성 한 묶음 → 원문 (+무음 환각 문장 제거)
app/api/translate    원문 → 원문 언어 + 화면에 띄운 언어들
app/api/health       API 키 설정 여부
components/          EchoApp(상단바) · LangColumns(분할 화면) · Composer(하단 입력바) · Recorder · SettingsPanel · ThemeToggle
lib/                 pipeline(큐·재시도) · store · export · server/(OpenAI, 정리)
app/globals.css      색상 프로필 (라이트·다크 토큰)
```

## 개발용 시험

마이크 없이 오디오 파일로 전체 흐름을 시험할 수 있다 (`npm run dev` 일 때만):
`public/__test__/sample.wav` 를 두고 브라우저 콘솔에서 `__echoTest("/__test__/sample.wav")`.
(16kHz 16bit 모노 WAV 기준. `public/__test__/` 는 git 제외)

설계 배경은 [PLAN.md](PLAN.md).
