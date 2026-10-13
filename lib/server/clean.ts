import "server-only";

// 소리가 거의 없을 때 전사 모델이 지어내는 문장 (발견할 때마다 추가)
const HALLUCINATIONS = [
  /시청해\s*주셔서\s*감사합니다/,
  /구독(과|,)?\s*좋아요/,
  /^(감사합니다|고맙습니다)[.!]?$/,
  /thank(s| you) for watching/i,
  /please (like|subscribe)/i,
  /^(you|bye)[.!]?$/i,
  /字幕(由|制作|提供)/,
  /请不吝点赞/,
  /(订阅|點贊|点赞).{0,6}(频道|頻道)/,
  /^谢谢(观看|大家)?[。！!]?$/,
];

// 추임새(맞장구) 단위. 발화 전체가 이것들로만 이뤄지면 번역하지 않는다.
//   "네네네", "음, 네네", "uh-huh yeah", "嗯嗯" 처럼 붙거나 섞여 있어도 잡는다.
const FILLER_UNITS = [
  // 한국어
  "네", "넹", "예", "응", "엉", "음", "으음", "흠", "어", "아", "오", "아하",
  // 영어
  "uh-?huh", "m{2,}", "mhm", "hm+", "u+h+", "u+m+", "ah+", "oh+", "yeah", "yep", "yup", "yes", "ok", "okay",
  // 중국어
  "嗯", "哦", "噢", "啊", "呃", "额", "对", "是", "好", "好的", "是的",
];
const FILLER_ONLY = new RegExp(`^(?:${FILLER_UNITS.sort((a, b) => b.length - a.length).join("|")})+$`, "iu");

export function isFillerOnly(text: string): boolean {
  const compact = text.replace(/[\s\p{P}~]/gu, "");
  return compact.length > 0 && FILLER_ONLY.test(compact);
}

export function cleanTranscript(raw: string): string {
  let text = raw.replace(/\s+/g, " ").trim();
  if (HALLUCINATIONS.some((re) => re.test(text))) return "";

  // 같은 문장이 연달아 반복되면 하나로 (전사 반복 오류)
  const sentences = text.split(/(?<=[.!?。！？])\s*/).filter(Boolean);
  const deduped = sentences.filter((s, i) => i === 0 || s !== sentences[i - 1]);
  text = deduped.join(" ").trim();

  // 문장부호만 남으면 빈 결과로 처리
  return /[\p{L}\p{N}]/u.test(text) ? text : "";
}
