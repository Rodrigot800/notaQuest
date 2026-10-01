import { getDatabase } from "@/db";
import { cleanText, getApiUser, jsonError } from "@/lib/api";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getApiUser();
  if (!user) return jsonError("Não autenticado.", 401);
  const { id } = await context.params;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const name = cleanText(body.name);
  if (!name) return jsonError("Informe o nome do tópico.");

  try {
    const result = await getDatabase().prepare(
      "UPDATE disciplines SET name = ? WHERE id = ? AND user_id = ?"
    ).bind(name, id, user.userId).run();
    if (!result.meta.changes) return jsonError("Tópico não encontrado.", 404);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("discipline_update_failed", error);
    return jsonError("Não foi possível atualizar o tópico.", 503);
  }
}
