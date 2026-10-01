import { getDatabase } from "@/db";
import { cleanText, getApiUser, jsonError } from "@/lib/api";

export async function POST(request: Request) {
  const user = await getApiUser();
  if (!user) return jsonError("Não autenticado.", 401);
  const body = await request.json().catch(() => ({}));
  const title = cleanText(body.title);
  const position = cleanText(body.position);
  const board = cleanText(body.board);
  const examDate = cleanText(body.examDate, 10) || null;
  if (!title || !position || !board) return jsonError("Preencha concurso, vaga e banca.");

  const id = crypto.randomUUID();
  const now = Date.now();
  try {
    await getDatabase().prepare(
      "INSERT INTO contests (id, user_id, title, position, board, exam_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(id, user.userId, title, position, board, examDate, now, now).run();
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    console.error("contest_create_failed", error);
    return jsonError("Não foi possível cadastrar o concurso.", 503);
  }
}
