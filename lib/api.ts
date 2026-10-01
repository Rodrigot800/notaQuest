import { getChatGPTUser } from "@/app/chatgpt-auth";

export async function getApiUser() {
  const user = await getChatGPTUser();
  return user;
}

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export function cleanText(value: unknown, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
