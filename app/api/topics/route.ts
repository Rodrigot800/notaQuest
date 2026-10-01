import { getDatabase } from "@/db";
import { cleanText, getApiUser, jsonError } from "@/lib/api";

export async function POST(request: Request) {
  const user = await getApiUser();
  if (!user) return jsonError("Não autenticado.", 401);
  const body = await request.json().catch(() => ({}));
  const disciplineId = cleanText(body.disciplineId, 80);
  const title = cleanText(body.title);
  const notes = cleanText(body.notes, 20000);
  if (!disciplineId || !title) return jsonError("Informe a disciplina e o tópico.");

  const db = getDatabase();
  const owned = await db.prepare("SELECT id FROM disciplines WHERE id = ? AND user_id = ?").bind(disciplineId, user.userId).first();
  if (!owned) return jsonError("Disciplina não encontrada.", 404);

  const id = crypto.randomUUID();
  const now = Date.now();
  try {
    await db.prepare(
      "INSERT INTO topics (id, discipline_id, user_id, title, notes, completed, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)"
    ).bind(id, disciplineId, user.userId, title, notes, now, now).run();
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    console.error("topic_create_failed", error);
    return jsonError("Não foi possível adicionar o tópico.", 503);
  }
}
