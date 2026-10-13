# echo 설계

## 1. 전체 흐름

```
[마이크]
   │ getUserMedia (모노, 에코제거·노이즈억제 켬)
   ▼
[VAD]  @ricky0123/vad-web — 말 구간만 잘라냄 (브라우저)
   │ Float32Array, 16kHz 모노  ── ① 조각 가공 (§2)
   ▼
POST /api/transcribe   (Next.js 서버 라우트 → STT API)
   │ 원문 텍스트          ── ② 텍스트 정리 (§3)
   ▼
POST /api/translate    (Next.js 서버 라우트 → 번역 LLM)
   │ { source, ko, en, zh }
   ▼
[3분할 화면]  같은 순번(seq)은 같은 줄 · 원문 칸에 🎤 표시
   │
[IndexedDB]  발화마다 저장 → 끝나면 txt / md / srt 내보내기
```

- 조각 단위로 독립 처리한다. 하나가 실패해도 그 줄만 재시도한다.
- 실시간 스트리밍 연결(WebSocket)은 쓰지 않는다. 일반 HTTP 요청만 쓴다.
- 지연 목표: **말이 끝난 뒤 2~4초 안에** 세 칸이 모두 채워진다.

---

## 2. 음성 조각(말뭉치) 가공 — 브라우저

### 2-1. 자르기 규칙 (VAD 설정)
| 설정 | 시작값 | 의미 |
|---|---|---|
| `model` | `"v5"` | Silero v5 |
| `positiveSpeechThreshold` | 0.5 | 말 시작 판정 (기본 0.3 — 회의실 잡음 고려해 올림) |
| `negativeSpeechThreshold` | 0.35 | 말 끝 후보 |
| `redemptionMs` | 800 | 이만큼 조용하면 조각 확정 (기본 1400 — 반응 속도 위해 줄임) |
| `preSpeechPadMs` | 300 | 첫 음절 잘림 방지 |
| `minSpeechMs` | 400 | 이보다 짧으면 버림 (기침·탁 소리) |
| 최대 길이 | **15초** | 직접 구현: 말 시작 시각을 재다가 15초가 되면 `submitUserSpeechOnPause: true` 상태에서 `pause()` → `start()` |

- 숫자는 전부 화면의 설정 패널(슬라이더)에서 현장 조정 가능하게 둔다. 값은 localStorage 에 기억.

### 2-2. 조각 하나에 붙이는 정보
```ts
type Segment = {
  seq: number;            // 세션 안 순번 — 화면 줄 순서의 기준
  sessionId: string;
  startedAt: number;      // 말 시작 시각 (ms)
  durationMs: number;
  forcedSplit: boolean;   // 15초 강제 자르기로 끊긴 조각인지 (다음 조각과 이어질 가능성 높음)
  langHint?: "ko" | "en" | "zh";  // 수동 언어 버튼을 눌러 둔 경우
  wav: Blob;              // utils.encodeWAV(audio) — 16kHz 16bit 모노, 15초 ≈ 0.5MB
};
```

### 2-3. 보내기 전 처리
1. 0.4초 미만 → 버림 (VAD `onVADMisfire`).
2. `utils.encodeWAV` 로 WAV 변환. 로컬이라 용량 압축(opus 등)은 하지 않는다.
3. 전송 큐에 넣는다 — **동시에 최대 2개** 처리, 응답이 뒤죽박죽 와도 `seq` 순서로 화면에 꽂는다.
4. 결과가 확정될 때까지 오디오 Blob 을 메모리에 들고 있다가 실패 시 [재시도] 버튼으로 다시 보낸다.

### 2-4. 수동 언어 지정 (선택이지만 권장)
- 단축키 `1`=한국어 `2`=English `3`=中文 `0`=자동. 누른 상태가 다음 조각들의 `langHint` 가 된다.
- 자동 감지가 짧은 발화("네", "OK", "好的")에서 자주 틀리므로, 현장에서 한 사람이 길게 말할 때 눌러 두면 정확도가 올라간다.

---

## 3. 텍스트 정리 — 서버 (`/api/transcribe` 응답 직후)

1. 앞뒤 공백 제거, 연속 공백 1칸.
2. **무음 환각 문구 제거** — STT 가 소리가 거의 없을 때 지어내는 문장을 목록으로 걸러낸다.
   예: "시청해 주셔서 감사합니다", "Thank you for watching", "请不吝点赞 订阅", "字幕由…提供".
   목록은 `lib/hallucinations.ts` 에 두고 발견할 때마다 추가.
3. 결과가 비었거나 문장부호뿐이면 → 그 줄을 "(인식 안 됨)"으로 표시하고 번역은 건너뜀.
4. 같은 문장이 3번 이상 반복되면 1번으로 줄인다(STT 반복 오류).
5. `forcedSplit` 조각은 다음 조각과 이어 붙일 수 있게 표시만 해 두고(화면에서 "…" 연결), 번역은 각각 한다. — 합쳐서 다시 번역하는 건 2단계 개선.

---

## 4. 모델 — 결정할 것

### 4-1. 전사(STT)
| 후보 | 방식 | 장점 | 확인할 것 |
|---|---|---|---|
| OpenAI 전사 API (`gpt-4o-transcribe` 계열) | 파일 업로드 | 다국어 품질, 프롬프트로 용어 힌트 | 현재 모델명·가격, 섞인 언어 처리 |
| Soniox (비동기/파일 전사) | 파일 업로드 | 한·영·중 섞임 처리, 언어 태그 | 파일 전사 지연시간, 가격 |
| 로컬 Whisper (whisper.cpp 등) | 노트북에서 실행 | 무료·오프라인 | 노트북 사양으로 실시간이 되는지 |

- 같은 실제 녹음(세 언어 섞인 5분짜리) 하나로 2개 이상 비교한 뒤 정한다.
- `/api/transcribe` 는 업체를 바꿔 끼울 수 있게 `lib/stt/<업체>.ts` 로 나눈다.

### 4-2. 번역 LLM
한 번 호출로 **원문 언어 판별 + 3개 언어 결과**를 JSON 으로 받는다. 원문 칸에는 STT 원문을 그대로 쓰고, LLM 결과는 나머지 두 칸에만 쓴다(원문을 LLM 이 다듬지 않게).

| 후보 (Claude, 2026-10 기준) | 모델 ID | 가격 (입력/출력, 100만 토큰) | 성격 |
|---|---|---|---|
| Claude Haiku 5.5 | `claude-haiku-5-5` | $0.10 / $0.50 | 가장 빠르고 저렴 — 실시간 번역 1순위 후보 |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | $2 / $10 | 뉘앙스·전문용어 품질 ↑, 조금 느림 |
| Claude Opus 5.5 | `claude-opus-5-5` | $4 / $20 | 최고 품질, 실시간엔 지연이 부담일 수 있음 |
| (대안) OpenAI 텍스트 모델 | — | — | OpenAI 키 하나로 전사·번역을 통일하고 싶을 때 |

- **구조화 출력:** Claude 는 `output_config.format`(JSON 스키마)으로 형식을 고정할 수 있다 → 파싱 실패 걱정 없음.
- **속도 설정:** Haiku 5.5 는 생각(thinking)이 기본으로 켜져 있고 effort 기본값이 `medium` 이다. 번역은 단순 작업이라 `effort: "low"` 로 지연을 줄인다.
- **프롬프트 캐싱:** 시스템 프롬프트 + 용어집을 앞에 고정해 캐시되게 둔다(1시간 세션 동안 반복 호출).
- **1시간 비용 감:** 발화 ~600개 × (맥락 포함 입력 ~1.5K 토큰 + 출력 ~0.2K) ≈ 입력 0.9M · 출력 0.12M 토큰. Haiku 5.5 기준 약 $0.15 수준(캐싱 전). 실측 후 갱신.

번역 요청 형태:
```jsonc
// 입력
{
  "text": "这个价格可以再便宜一点吗？",
  "langHint": null,
  "context": [ /* 직전 5개 발화의 {source, ko, en, zh} */ ],
  "glossary": [ { "ko": "에코", "en": "Echo", "zh": "回声" } ]
}
// 출력 (JSON 스키마로 고정)
{ "source": "zh", "ko": "이 가격을 조금 더 낮출 수 있을까요?", "en": "Could you lower the price a bit more?", "zh": "这个价格可以再便宜一点吗？" }
```

### 4-3. 결정 (2026-10-13)
- [x] **OpenAI 단일 구성** — SDK·키 하나로 전사와 번역을 모두 처리
- [x] 전사: `gpt-transcribe` (`languages: ["ko","en","zh"]`, 용어집 → `keywords`, 직전 원문 → `prompt`)
- [x] 번역: `gpt-6-luna`, `reasoning.effort: "none"` · 줄별 **Refine** 은 `gpt-6-sol`
- [x] 중국어 간체 · 한국어는 회의체 존댓말 · 화자 구분 없음
- [x] 화면 문구는 영어, 앱 이름은 **ECHO**

첫 실측(TTS 음성 2개): 전사 0.8~1.7초 + 번역 약 2.3초 → 말이 끝난 뒤 약 3~4초.

---

## 5. 화면

- **3단 고정 열**: 한국어 | English | 中文. 같은 `seq` 는 같은 높이의 줄(그리드 행)로 맞춘다.
- 줄 상태: `처리 중…`(회색) → 원문만 표시 → 3칸 완성. 실패 시 빨간 [재시도].
- 원문 칸 🎤 배지, 시각 표시(mm:ss), 최신 줄 자동 스크롤(위로 올려 보는 중이면 자동 스크롤 멈춤).
- 상단 바: ● 녹음 상태 · 현재 언어 지정(자동/ko/en/zh) · 글자 크기 · 설정(VAD 슬라이더, 용어집) · 내보내기.
- 전체화면 · 다크모드 · 큰 글씨 모드(상대에게 보여줄 때).
- 화면 꺼짐 방지(Wake Lock).

---

## 6. 폴더 구조 (예정)

```
echo/
  app/
    page.tsx                  3분할 메인 화면
    api/transcribe/route.ts   오디오 조각 → 원문 (+정리)
    api/translate/route.ts    원문 → { source, ko, en, zh }
  components/
    TriColumn.tsx  UtteranceRow.tsx  TopBar.tsx  SettingsPanel.tsx  GlossaryEditor.tsx
    Recorder.tsx              VAD (dynamic import, ssr: false)
  lib/
    vad-config.ts             §2-1 기본값
    queue.ts                  순번·동시 2개·재시도
    stt/                      업체별 연결 (교체 가능)
    translate.ts              번역 프롬프트·스키마
    hallucinations.ts         §3 제거 목록
    store.ts                  zustand
    db.ts                     IndexedDB
    export.ts                 txt / md / srt
  public/vad/                 Silero .onnx · worklet · onnxruntime .wasm/.mjs (postinstall 로 복사)
  scripts/copy-vad-assets.mjs
  .env.local                  STT·LLM API 키 (git 제외)
```

---

## 7. 개발 단계

1. **골격** — `create-next-app` (Next 16, TS, Tailwind, App Router) · 3분할 화면을 더미 데이터로
2. **녹음** — VAD 붙이고 조각을 화면에 "처리 중" 줄로 쌓기 (STT 없이)
3. **전사** — `/api/transcribe` + 텍스트 정리 · 원문 칸 채우기
4. **번역** — `/api/translate` (JSON 스키마) · 나머지 두 칸 채우기
5. **현장 대비** — 수동 언어 버튼, 재시도, IndexedDB 저장, 내보내기, Wake Lock, 설정 패널
6. **개선** — 용어집, 강제 분할 조각 합치기, 지연시간 표시, (필요 시) 스트리밍 STT 로 교체
