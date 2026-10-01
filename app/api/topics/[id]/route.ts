import { getDatabase } from "@/db";
import { cleanText, getApiUser, jsonError } from "@/lib/api";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getApiUser();
  if (!user) return jsonError("Não autenticado.", 401);
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const title = body.title === undefined ? null : cleanText(body.title);
  const notes = body.notes === undefined ? null : cleanText(body.notes, 20000);
  const completed = typeof body.completed === "boolean" ? (body.completed ? 1 : 0) : null;
  if (title === "" || (title === null && notes === null && completed === null)) return jsonError("Nenhuma alteração válida.");

  try {
    const result = await getDatabase().prepare(
      "UPDATE topics SET title = COALESCE(?, title), notes = COALESCE(?, notes), completed = COALESCE(?, completed), updated_at = ? WHERE id = ? AND user_id = ?"
    ).bind(title, notes, completed, Date.now(), id, user.userId).run();
    if (!result.meta.changes) return jsonError("Tópico não encontrado.", 404);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("topic_update_failed", error);
    return jsonError("Não foi possível atualizar o tópico.", 503);
  }
}
