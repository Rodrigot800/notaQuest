import { getDatabase } from "@/db";
import { cleanText, getApiUser, jsonError } from "@/lib/api";

export async function POST(request: Request) {
  const user = await getApiUser();
  if (!user) return jsonError("Não autenticado.", 401);
  const body = await request.json().catch(() => ({}));
  const contestId = cleanText(body.contestId, 80);
  const name = cleanText(body.name);
  if (!contestId || !name) return jsonError("Informe o concurso e a disciplina.");

  const db = getDatabase();
  const owned = await db.prepare("SELECT id FROM contests WHERE id = ? AND user_id = ?").bind(contestId, user.userId).first();
  if (!owned) return jsonError("Concurso não encontrado.", 404);

  const id = crypto.randomUUID();
  try {
    await db.prepare(
      "INSERT INTO disciplines (id, contest_id, user_id, name, created_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(id, contestId, user.userId, name, Date.now()).run();
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    console.error("discipline_create_failed", error);
    return jsonError("Não foi possível adicionar a disciplina.", 503);
  }
}
