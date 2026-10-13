# ECHO

노트북 한 대를 회의 자리에 놓고, 한국어·영어·중국어가 오가는 대화를 **3분할 화면에 동시에 쌓아 주는** 개인용 실시간 통역 도구. (화면 문구는 영어)

```
┌──────────────┬──────────────┬──────────────┐
│ Korean       │ English      │ Chinese      │
├──────────────┼──────────────┼──────────────┤
│🎤 안녕하세요…  │ Hello…       │ 你好…         │  ← 같은 발화는 같은 줄
│ 가격은…       │🎤 The price… │ 价格…         │  ← 🎤 = 원문 칸
└──────────────┴──────────────┴──────────────┘
```

## 실행

```bash
npm install          # postinstall 이 VAD 모델·WASM 을 public/vad 로 복사
cp .env.example .env.local   # OPENAI_API_KEY 채우기
npm run dev          # http://localhost:3000
```

Chrome / Edge 에서 열고 마이크를 허용한다. 오래 쓸 때는 `npm run build && npm start` 가 더 가볍다.

## 사용법

| 조작 | 키 |
|---|---|
| 녹음 시작 / 정지 | `Space` 또는 Start recording 버튼 |
| 언어 지정: 자동 / 한국어 / 영어 / 중국어 | `0` `1` `2` `3` (자동 감지가 짧은 말에서 틀릴 때) |
| 글자 크기 | A− / A+ |
| 이 줄만 Sol 로 다시 번역 | 줄에 마우스 → **Refine** |
| 실패한 줄 다시 처리 | **Retry** |
| 기록 내보내기 | Export → md / txt / srt |
| 용어집 · 번역 모델 · VAD 조정 | ⚙ Settings |

- 기록은 브라우저(IndexedDB)에 자동 저장 — 새로고침해도 남는다. New session 을 누르면 이전 기록은 보관하고 새로 시작.
- 녹음 중에는 화면이 꺼지지 않는다(Wake Lock).

## 구성

| 항목 | 선택 |
|---|---|
| 런타임 / 프레임워크 | Node.js 24 LTS · Next.js 16.4 (Active LTS) · React 19 · Tailwind 4 |
| 음성 구간 감지 | `@ricky0123/vad-web` (Silero v5) — `lib/useVad.ts` 의 얇은 훅으로 사용 |
| 전사 | OpenAI `gpt-transcribe` — `languages: [ko, en, zh]`, 용어집을 `keywords` 로, 직전 문장을 `prompt` 로 |
| 번역 | OpenAI `gpt-6-luna` (기본, `reasoning.effort: none`) · Refine 은 `gpt-6-sol` — JSON 스키마로 `{source, ko, en, zh}` |
| 저장 | zustand + IndexedDB(idb-keyval) |

```
app/api/transcribe   음성 조각(WAV) → 원문 (+무음 환각 문장 제거)
app/api/translate    원문 → 원문 언어 + 3개 언어
app/api/health       API 키 설정 여부
components/          EchoApp(상단바) · Recorder(VAD) · TriColumn(3분할) · SettingsPanel
lib/                 pipeline(큐·재시도) · store · export · useVad · server/(OpenAI, 정리)
```

## 개발용 시험

마이크 없이 WAV 파일로 전체 흐름을 시험할 수 있다 (`npm run dev` 일 때만):
`public/__test__/sample.wav` 를 두고 브라우저 콘솔에서 `__echoTest("/__test__/sample.wav")`.
(16kHz 16bit 모노 WAV 기준. `public/__test__/` 는 git 제외)

설계 배경은 [PLAN.md](PLAN.md).
