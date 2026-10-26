"use client";

// 실시간 모드: 마이크를 계속 듣다가 말이 멈출 때마다 그 구간을 WAV 한 조각으로 넘긴다.
// 별도 모델 없이 소리 크기(RMS)를 주변 소음 수준과 비교하는 방식 — 마이크의 노이즈 억제가 켜져 있어 회의실에서도 쓸 만하다.
const WINDOW_MS = 30; // 판정 단위
const START_MS = 90; // 이만큼 연속으로 말소리가 나야 말 시작
const SILENCE_MS = 700; // 이만큼 조용하면 조각 확정
const PRE_PAD_MS = 300; // 첫 음절 잘림 방지
const TAIL_MS = 200; // 끝에 남겨 둘 무음
const MIN_SPEECH_MS = 400; // 말소리가 이보다 짧으면 버림 (기침·탁 소리)
const MAX_MS = 15000; // 길게 이어 말하면 여기서 끊고 바로 다음 조각을 시작
const RATIO = 3; // 소음 수준의 몇 배부터 말소리로 보나 (약 +10dB)
const MIN_RMS = 0.008; // 아주 조용한 방에서 숨소리까지 잡지 않게
const OUT_RATE = 16000; // 전사에 충분한 16kHz 로 줄여 보낸다

const n = (ms: number) => Math.round(ms / WINDOW_MS);

export type LiveCallbacks = {
  onSegment: (wav: Blob, durationMs: number) => void;
  onSpeaking: (speaking: boolean) => void;
};

// 마이크 소리를 그대로 메인 스레드로 넘기는 오디오 워크렛
const TAP = `registerProcessor("echo-tap", class extends AudioWorkletProcessor {
  process(inputs) { const ch = inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true; }
});`;

// 듣기 시작. 돌려받은 함수를 부르면 말하던 구간까지 보내고 멈춘다.
export async function startLive(cb: LiveCallbacks): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
  });
  const ctx = new AudioContext();
  let tap: AudioWorkletNode;
  try {
    const url = URL.createObjectURL(new Blob([TAP], { type: "application/javascript" }));
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    tap = new AudioWorkletNode(ctx, "echo-tap", { numberOfOutputs: 0 }); // 출력이 없는 노드는 스피커에 안 이어도 계속 돈다
    ctx.createMediaStreamSource(stream).connect(tap);
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close();
    throw err;
  }

  const rate = ctx.sampleRate;
  const winSize = Math.round((rate * WINDOW_MS) / 1000);
  let pending: number[] = [];
  let pre: Float32Array[] = []; // 말 시작 전 최근 소리
  let speech: Float32Array[] | null = null; // 지금 모으는 조각
  let voiced = 0; // 조각 안 말소리 창 수
  let loudRun = 0;
  let quietRun = 0;
  let floor: number | null = null; // 주변 소음 수준

  const finish = () => {
    if (!speech) return;
    const keep = speech.length - Math.max(0, quietRun - n(TAIL_MS));
    const chunks = speech.slice(0, keep);
    const enough = voiced * WINDOW_MS >= MIN_SPEECH_MS;
    speech = null;
    voiced = 0;
    if (!enough) return;
    const samples = concat(chunks);
    cb.onSegment(encodeWav(resample(samples, rate, OUT_RATE), OUT_RATE), Math.round((samples.length / rate) * 1000));
  };

  const onWindow = (w: Float32Array) => {
    const rms = Math.sqrt(w.reduce((s, x) => s + x * x, 0) / w.length);
    floor ??= rms;
    const loud = rms > Math.max(floor * RATIO, MIN_RMS);
    // 조용할 땐 소음 수준을 빠르게 따라가고, 시끄러운 상태가 오래가면(에어컨·환풍기) 천천히 올린다.
    // 말하는 중에는 아주 천천히 — 길게 이어 말해도 말소리가 소음으로 묻히지 않게
    floor = loud ? floor + (rms - floor) * (speech ? 0.0002 : 0.002) : Math.min(rms, floor * 0.9 + rms * 0.1);

    if (!speech) {
      pre.push(w);
      if (pre.length > n(PRE_PAD_MS)) pre.shift();
      loudRun = loud ? loudRun + 1 : 0;
      if (loudRun >= n(START_MS)) {
        speech = pre;
        pre = [];
        voiced = loudRun;
        quietRun = 0;
        cb.onSpeaking(true);
      }
      return;
    }

    speech.push(w);
    if (loud) {
      voiced++;
      quietRun = 0;
    } else quietRun++;

    if (quietRun >= n(SILENCE_MS)) {
      finish();
      loudRun = 0;
      cb.onSpeaking(false);
    } else if (speech.length >= n(MAX_MS)) {
      finish();
      speech = []; // 아직 말하는 중 — 끊김 없이 다음 조각으로
      quietRun = 0;
    }
  };

  tap.port.onmessage = (e: MessageEvent<Float32Array>) => {
    for (const x of e.data) pending.push(x);
    while (pending.length >= winSize) {
      onWindow(Float32Array.from(pending.slice(0, winSize)));
      pending = pending.slice(winSize);
    }
  };

  return () => {
    tap.port.onmessage = null;
    finish();
    cb.onSpeaking(false);
    stream.getTracks().forEach((t) => t.stop()); // 마이크 표시등 끄기
    void ctx.close();
  };
}

function concat(chunks: Float32Array[]): Float32Array {
  const out = new Float32Array(chunks.reduce((s, c) => s + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

// 구간 평균으로 표본 수를 줄인다 (단순 솎아내기보다 고음 잡음이 덜 생긴다)
function resample(x: Float32Array, from: number, to: number): Float32Array {
  if (from <= to) return x;
  const step = from / to;
  const out = new Float32Array(Math.floor(x.length / step));
  for (let i = 0; i < out.length; i++) {
    const a = Math.floor(i * step);
    const b = Math.min(x.length, Math.floor((i + 1) * step));
    let s = 0;
    for (let j = a; j < b; j++) s += x[j];
    out[i] = s / Math.max(1, b - a);
  }
  return out;
}

// 16bit 모노 WAV
function encodeWav(samples: Float32Array, rate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // 모노
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  samples.forEach((x, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x)) * 0x7fff, true));
  return new Blob([buf], { type: "audio/wav" });
}
