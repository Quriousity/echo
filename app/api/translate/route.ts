import { openai, errorMessage } from "@/lib/server/openai";
import type { TranslateRequest, TranslateResponse } from "@/lib/types";

// 원문 → 원문 언어 판별 + 한·영·중 3개 결과 (JSON 스키마로 고정)
const SCHEMA = {
  type: "object",
  properties: {
    source: { type: "string", enum: ["ko", "en", "zh", "other"] },
    ko: { type: "string" },
    en: { type: "string" },
    zh: { type: "string" },
  },
  required: ["source", "ko", "en", "zh"],
  additionalProperties: false,
} as const;

// 앞부분(지시문 + 용어집)은 세션 내내 같게 유지 → 프롬프트 캐시가 잡히도록 맨 앞에 둔다
const INSTRUCTIONS = `You are a live interpreter at a business meeting where Korean, English and Chinese are spoken.
For each utterance you receive:
1. Decide its source language: "ko", "en", "zh", or "other".
2. Return the utterance in all three languages. In the field of the source language, copy the utterance as is.
Rules:
- Translate faithfully and naturally, as spoken. Do not add explanations, notes or quotation marks.
- Korean: polite meeting register (해요체/합쇼체). Chinese: Simplified characters.
- Keep names, numbers, units and product names exact. Follow the glossary when a term appears.
- The utterance may be a sentence fragment cut by a pause. Translate the fragment as it is; do not complete it.
- Use the recent conversation only to resolve pronouns, omitted subjects and terminology. Translate only the new utterance.
- If the utterance is not ko/en/zh, use "other" and translate it into all three.`;

export async function POST(request: Request): Promise<Response> {
  const started = Date.now();
  try {
    const req = (await request.json()) as TranslateRequest;
    if (!req.text?.trim()) return Response.json({ error: "Empty text" }, { status: 400 });

    const glossary = req.glossary.length
      ? `\n\nGlossary (ko | en | zh):\n${req.glossary.map((g) => `${g.ko ?? "-"} | ${g.en ?? "-"} | ${g.zh ?? "-"}`).join("\n")}`
      : "";
    const context = req.context.length
      ? `Recent conversation (oldest first):\n${req.context
          .map((c) => `[${c.source}${c.speaker ? ` · ${c.speaker}` : ""}] ${c[c.source as "ko" | "en" | "zh"] ?? c.en ?? ""}`)
          .join("\n")}\n\n`
      : "";
    const hints = req.langHint ? `The speaker was marked as speaking "${req.langHint}".` : "";

    const res = await openai().responses.create({
      model: req.model,
      reasoning: { effort: req.effort },
      instructions: INSTRUCTIONS + glossary,
      input: `${context}${hints ? hints + "\n" : ""}New utterance:\n${req.text}`,
      text: { format: { type: "json_schema", name: "translation", strict: true, schema: SCHEMA } },
    });

    const out = JSON.parse(res.output_text) as { source: "ko" | "en" | "zh" | "other"; ko: string; en: string; zh: string };
    return Response.json({ ...out, ms: Date.now() - started } satisfies TranslateResponse);
  } catch (err) {
    return Response.json({ error: errorMessage(err) } satisfies TranslateResponse, { status: 500 });
  }
}
