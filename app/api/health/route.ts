import { connection } from "next/server";

// 화면 시작 시 API 키가 들어 있는지만 확인 (키 값은 내보내지 않음)
export async function GET(): Promise<Response> {
  await connection(); // 빌드 때 정적으로 굳지 않게 요청 시점에 실행
  return Response.json({ hasKey: Boolean(process.env.OPENAI_API_KEY) });
}
