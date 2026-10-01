import { getDatabase } from "@/db";
import { cleanText, getApiUser, jsonError } from "@/lib/api";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getApiUser();
  if (!user) return jsonError("Não autenticado.", 401);
  const { id } = await context.params;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const name = cleanText(body.name);
  if (!name) return jsonError("Informe o nome da disciplina.");

  try {
    const result = await getDatabase().prepare(
      "UPDATE disciplines SET name = ? WHERE id = ? AND user_id = ?"
    ).bind(name, id, user.userId).run();
    if (!result.meta.changes) return jsonError("Disciplina não encontrada.", 404);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("discipline_update_failed", error);
    return jsonError("Não foi possível atualizar a disciplina.", 503);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getApiUser();
  if (!user) return jsonError("Não autenticado.", 401);
  const { id } = await context.params;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (cleanText(body.confirmation, 3) !== "123") return jsonError("Digite 123 para confirmar a exclusão.", 400);

  try {
    const db = getDatabase();
    const owned = await db.prepare(
      "SELECT id FROM disciplines WHERE id = ? AND user_id = ?"
    ).bind(id, user.userId).first();
    if (!owned) return jsonError("Disciplina não encontrada.", 404);

    const [, , result] = await db.batch([
      db.prepare("DELETE FROM study_sessions WHERE discipline_id = ? AND user_id = ?").bind(id, user.userId),
      db.prepare("DELETE FROM topics WHERE discipline_id = ? AND user_id = ?").bind(id, user.userId),
      db.prepare("DELETE FROM disciplines WHERE id = ? AND user_id = ?").bind(id, user.userId),
    ]);
    if (!result.meta.changes) return jsonError("Disciplina não encontrada.", 404);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("discipline_delete_failed", error);
    return jsonError("Não foi possível excluir a disciplina.", 503);
  }
}
