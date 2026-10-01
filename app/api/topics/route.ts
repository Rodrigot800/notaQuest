import { getDatabase } from "@/db";
import { cleanText, getApiUser, jsonError } from "@/lib/api";

export async function POST(request: Request) {
  const user = await getApiUser();
  if (!user) return jsonError("Não autenticado.", 401);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const disciplineId = cleanText(body.disciplineId, 80);
  const items = Array.isArray(body.items) ? body.items : null;

  if (items) {
    if (!disciplineId || items.length < 1 || items.length > 100) return jsonError("Informe a disciplina e uma lista válida de tópicos.");
    const cleaned = items.map((item) => {
      const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return { title: cleanText(record.title), notes: cleanText(record.notes, 20000) };
    });
    if (cleaned.some((item) => !item.title)) return jsonError("Todos os tópicos precisam de um título.");

    const db = getDatabase();
    const owned = await db.prepare("SELECT id FROM disciplines WHERE id = ? AND user_id = ?").bind(disciplineId, user.userId).first();
    if (!owned) return jsonError("Disciplina não encontrada.", 404);

    try {
      const existing = await db.prepare(
        "SELECT id, title FROM topics WHERE discipline_id = ? AND user_id = ?"
      ).bind(disciplineId, user.userId).all<{ id: string; title: string }>();
      const used = new Set<string>();
      const statements = [];
      let created = 0;
      let updated = 0;
      const now = Date.now();

      for (const item of cleaned) {
        const number = item.title.match(/^\s*(\d+)\s*[-.)]/)?.[1];
        const normalized = item.title.trim().toLocaleLowerCase("pt-BR");
        const match = existing.results.find((candidate) => {
          if (used.has(candidate.id)) return false;
          const candidateNumber = candidate.title.match(/^\s*(\d+)\s*[-.)]/)?.[1];
          return number ? candidateNumber === number : candidate.title.trim().toLocaleLowerCase("pt-BR") === normalized;
        });

        if (match) {
          used.add(match.id);
          updated += 1;
          statements.push(db.prepare(
            "UPDATE topics SET title = ?, notes = ?, updated_at = ? WHERE id = ? AND user_id = ?"
          ).bind(item.title, item.notes, now, match.id, user.userId));
        } else {
          created += 1;
          statements.push(db.prepare(
            "INSERT INTO topics (id, discipline_id, user_id, title, notes, completed, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)"
          ).bind(crypto.randomUUID(), disciplineId, user.userId, item.title, item.notes, now, now));
        }
      }

      await db.batch(statements);
      return Response.json({ created, updated });
    } catch (error) {
      console.error("topic_import_failed", error);
      return jsonError("Não foi possível importar os tópicos.", 503);
    }
  }

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
