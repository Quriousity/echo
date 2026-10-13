// VAD 가 브라우저에서 읽는 파일을 public/vad 로 복사한다 (npm install 때 자동 실행).
// CDN 대신 로컬에 두어 현장 인터넷이 불안해도 VAD 는 동작하게 한다.
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";

const out = path.resolve("public/vad");
mkdirSync(out, { recursive: true });

const sources = [
  { dir: "node_modules/@ricky0123/vad-web/dist", match: (f) => f === "vad.worklet.bundle.min.js" || /^silero_vad_.*\.onnx$/.test(f) },
  { dir: "node_modules/onnxruntime-web/dist", match: (f) => /^ort-wasm.*\.(wasm|mjs)$/.test(f) },
];

let n = 0;
for (const { dir, match } of sources) {
  for (const f of readdirSync(dir).filter(match)) {
    copyFileSync(path.join(dir, f), path.join(out, f));
    n++;
  }
}
console.log(`[copy-vad-assets] ${n} files → public/vad`);
