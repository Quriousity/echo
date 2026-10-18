import { toFile } from "openai";
import { openai, errorMessage } from "@/lib/server/openai";
import { cleanTranscript, isFillerOnly } from "@/lib/server/clean";
import { LANGS, type Lang, type TranscribeResponse } from "@/lib/types";

// 음성 한 묶음(webm/mp4/wav) → 원문 텍스트
// form: file(오디오) · langHint(ko|en|zh|ja, 선택) · prompt(직전 문장, 선택) · keywords(JSON 배열, 선택)
export async function POST(request: Request): Promise<Response> {
  const started = Date.now();
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) return Response.json({ error: "Missing audio file" }, { status: 400 });

    const langHint = form.get("langHint");
    const hint = LANGS.includes(langHint as Lang) ? (langHint as Lang) : null;
    const prompt = String(form.get("prompt") ?? "").slice(-500) || undefined;
    const keywords = JSON.parse(String(form.get("keywords") ?? "[]")) as string[];

    const result = await openai().audio.transcriptions.create({
      // 형식은 파일 이름의 확장자로 판별되므로 브라우저가 붙인 이름을 그대로 넘긴다
      file: await toFile(file, file instanceof File && file.name ? file.name : "segment.webm", { type: file.type }),
      model: "gpt-transcribe",
      // 수동 지정이 있으면 그 언어만, 없으면 지원 언어 전체가 후보
      languages: hint ? [hint] : LANGS,
      ...(keywords.length ? { keywords } : {}),
      ...(prompt ? { prompt } : {}),
    });

    const text = cleanTranscript(result.text ?? "");
    const body: TranscribeResponse = {
      text,
      filler: isFillerOnly(text),
      languages: (result.languages ?? []).map((l) => l.code),
      ms: Date.now() - started,
    };
    return Response.json(body);
  } catch (err) {
    return Response.json({ error: errorMessage(err) } satisfies TranscribeResponse, { status: 500 });
  }
}
