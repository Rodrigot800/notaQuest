import { getDatabase } from "@/db";
import { cleanText, getApiUser, jsonError } from "@/lib/api";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getApiUser();
  if (!user) return jsonError("Não autenticado.", 401);
  const { id } = await context.params;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const disciplineId = cleanText(body.disciplineId, 80);
  const topicId = cleanText(body.topicId, 80) || null;
  const questions = Number(body.questions);
  const correct = Number(body.correct);
  const sessionDate = cleanText(body.sessionDate, 10);
  const notes = cleanText(body.notes, 1000);

  if (!disciplineId || !Number.isInteger(questions) || !Number.isInteger(correct) || questions < 1 || correct < 0 || correct > questions || !sessionDate) {
    return jsonError("Revise a disciplina, a data e as quantidades informadas.");
  }

  const db = getDatabase();
  const discipline = await db.prepare(
    "SELECT id FROM disciplines WHERE id = ? AND user_id = ?"
  ).bind(disciplineId, user.userId).first();
  if (!discipline) return jsonError("Disciplina não encontrada.", 404);

  if (topicId) {
    const topic = await db.prepare(
      "SELECT id FROM topics WHERE id = ? AND discipline_id = ? AND user_id = ?"
    ).bind(topicId, disciplineId, user.userId).first();
    if (!topic) return jsonError("Subtópico não encontrado nessa disciplina.", 404);
  }

  try {
    const result = await db.prepare(
      "UPDATE study_sessions SET discipline_id = ?, topic_id = ?, questions = ?, correct = ?, session_date = ?, notes = ? WHERE id = ? AND user_id = ?"
    ).bind(disciplineId, topicId, questions, correct, sessionDate, notes, id, user.userId).run();
    if (!result.meta.changes) return jsonError("Registro de questões não encontrado.", 404);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("session_update_failed", error);
    return jsonError("Não foi possível atualizar o registro de questões.", 503);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getApiUser();
  if (!user) return jsonError("Não autenticado.", 401);
  const { id } = await context.params;

  try {
    const result = await getDatabase().prepare(
      "DELETE FROM study_sessions WHERE id = ? AND user_id = ?"
    ).bind(id, user.userId).run();
    if (!result.meta.changes) return jsonError("Registro de questões não encontrado.", 404);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("session_delete_failed", error);
    return jsonError("Não foi possível excluir o registro de questões.", 503);
  }
}
