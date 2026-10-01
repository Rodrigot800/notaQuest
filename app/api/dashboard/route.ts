import { getDatabase } from "@/db";
import { getApiUser, jsonError } from "@/lib/api";

export async function GET() {
  const user = await getApiUser();
  if (!user) return jsonError("Não autenticado.", 401);

  try {
    const db = getDatabase();
    const [contests, disciplines, topics, sessions] = await Promise.all([
      db.prepare(
        "SELECT id, title, position, board, exam_date AS examDate, created_at AS createdAt FROM contests WHERE user_id = ? ORDER BY created_at DESC"
      ).bind(user.userId).all(),
      db.prepare(
        "SELECT id, contest_id AS contestId, name, created_at AS createdAt FROM disciplines WHERE user_id = ? ORDER BY created_at ASC"
      ).bind(user.userId).all(),
      db.prepare(
        "SELECT id, discipline_id AS disciplineId, title, notes, completed, created_at AS createdAt, updated_at AS updatedAt FROM topics WHERE user_id = ? ORDER BY created_at ASC"
      ).bind(user.userId).all(),
      db.prepare(
        "SELECT id, discipline_id AS disciplineId, topic_id AS topicId, questions, correct, session_date AS sessionDate, notes, created_at AS createdAt FROM study_sessions WHERE user_id = ? ORDER BY session_date ASC, created_at ASC LIMIT 500"
      ).bind(user.userId).all(),
    ]);

    return Response.json({
      user: { displayName: user.displayName, email: user.email },
      contests: contests.results,
      disciplines: disciplines.results,
      topics: topics.results,
      sessions: sessions.results,
    });
  } catch (error) {
    console.error("dashboard_load_failed", error);
    return jsonError("Não foi possível carregar seus dados agora.", 503);
  }
}
