import { openai, errorMessage } from "@/lib/server/openai";
import { LANGS, type Lang, type Source, type TranslateRequest, type TranslateResponse } from "@/lib/types";

// 원문 → 원문 언어 판별 + 화면에 띄운 언어(targets)별 결과. 칸 구성이 바뀌므로 JSON 스키마도 요청마다 만든다.
const schema = (targets: Lang[]) => ({
  type: "object",
  properties: {
    source: { type: "string", enum: [...LANGS, "other"] },
    ...Object.fromEntries(targets.map((l) => [l, { type: "string" }])),
  },
  required: ["source", ...targets],
  additionalProperties: false,
});

// 앞부분(지시문 + 용어집)은 세션 내내 같게 유지 → 프롬프트 캐시가 잡히도록 맨 앞에 두고, 칸 목록은 입력 쪽에 둔다
const INSTRUCTIONS = `You are a live interpreter at a business meeting where Korean, English, Chinese and Japanese are spoken.
For each utterance you receive:
1. Decide its source language: "ko", "en", "zh", "ja", or "other".
2. Return the utterance in every requested target language. If the source language is one of the targets, copy the utterance as is in that field.
Rules:
- Translate faithfully and naturally, as spoken. Do not add explanations, notes or quotation marks.
- Korean: polite meeting register (해요체/합쇼체). Chinese: Simplified characters. Japanese: polite register (です・ます).
- Keep names, numbers, units and product names exact. Follow the glossary when a term appears.
- Each utterance is one chunk the user chose to send. If it is a fragment, translate it as it is; do not complete it.
- Spoken utterances come from speech recognition in a noisy room. In the translations, leave out stutters, repeated words, filler sounds (um, 음, 嗯, えっと) and stray fragments that are clearly background noise or other people's chatter. Fix a word only when the context makes the mishearing obvious. Never add content that was not said.
- Use the recent conversation only to resolve pronouns, omitted subjects and terminology. Translate only the new utterance.`;

export async function POST(request: Request): Promise<Response> {
  const started = Date.now();
  try {
    const req = (await request.json()) as TranslateRequest;
    if (!req.text?.trim()) return Response.json({ error: "Empty text" }, { status: 400 });
    const targets = LANGS.filter((l) => req.targets?.includes(l));
    if (!targets.length) return Response.json({ error: "No target languages" }, { status: 400 });

    const glossary = req.glossary.length
      ? `\n\nGlossary (ko | en | zh | ja):\n${req.glossary.map((g) => LANGS.map((l) => g[l] ?? "-").join(" | ")).join("\n")}`
      : "";
    const context = req.context.length
      ? `Recent conversation (oldest first):\n${req.context.map((c) => `[${c.source}] ${c.text}`).join("\n")}\n\n`
      : "";
    const hints = req.langHint ? `The speaker was marked as speaking "${req.langHint}".\n` : "";

    const res = await openai().responses.create({
      model: req.model,
      reasoning: { effort: req.effort },
      instructions: INSTRUCTIONS + glossary,
      input: `${context}${hints}${req.input === "voice" ? "Spoken (speech recognition)" : "Typed"} · target languages: ${targets.join(", ")}\nNew utterance:\n${req.text}`,
      text: { format: { type: "json_schema", name: "translation", strict: true, schema: schema(targets) } },
    });

    const { source, ...translations } = JSON.parse(res.output_text) as { source: Source } & Partial<Record<Lang, string>>;
    return Response.json({ source, translations, ms: Date.now() - started } satisfies TranslateResponse);
  } catch (err) {
    return Response.json({ error: errorMessage(err) } satisfies TranslateResponse, { status: 500 });
  }
}
