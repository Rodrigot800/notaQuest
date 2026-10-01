import { getDatabase } from "@/db";
import { cleanText, getApiUser, jsonError } from "@/lib/api";

export async function POST(request: Request) {
  const user = await getApiUser();
  if (!user) return jsonError("Não autenticado.", 401);
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
  const owned = await db.prepare("SELECT id FROM disciplines WHERE id = ? AND user_id = ?").bind(disciplineId, user.userId).first();
  if (!owned) return jsonError("Disciplina não encontrada.", 404);
  if (topicId) {
    const topic = await db.prepare(
      "SELECT id FROM topics WHERE id = ? AND discipline_id = ? AND user_id = ?"
    ).bind(topicId, disciplineId, user.userId).first();
    if (!topic) return jsonError("Subtópico não encontrado nessa disciplina.", 404);
  }

  const id = crypto.randomUUID();
  try {
    await db.prepare(
      "INSERT INTO study_sessions (id, discipline_id, topic_id, user_id, questions, correct, session_date, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(id, disciplineId, topicId, user.userId, questions, correct, sessionDate, notes, Date.now()).run();
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    console.error("session_create_failed", error);
    return jsonError("Não foi possível registrar as questões.", 503);
  }
}
