import "server-only";
import OpenAI from "openai";

let client: OpenAI | null = null;

// OPENAI_API_KEY 는 .env.local 에서 읽는다. 브라우저로는 절대 내보내지 않는다.
export function openai(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing. Add it to echo/.env.local and restart the server.");
  }
  client ??= new OpenAI();
  return client;
}

export function errorMessage(err: unknown): string {
  if (err instanceof OpenAI.APIError) return `OpenAI ${err.status ?? ""} ${err.message}`.trim();
  return err instanceof Error ? err.message : String(err);
}
