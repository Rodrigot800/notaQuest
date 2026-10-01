import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const contests = sqliteTable("contests", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  position: text("position").notNull(),
  board: text("board").notNull(),
  examDate: text("exam_date"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  index("idx_contests_user_id").on(table.userId),
]);

export const disciplines = sqliteTable("disciplines", {
  id: text("id").primaryKey(),
  contestId: text("contest_id").notNull().references(() => contests.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("idx_disciplines_user_contest").on(table.userId, table.contestId),
]);

export const topics = sqliteTable("topics", {
  id: text("id").primaryKey(),
  disciplineId: text("discipline_id").notNull().references(() => disciplines.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  notes: text("notes").notNull().default(""),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  index("idx_topics_user_discipline").on(table.userId, table.disciplineId),
]);

export const studySessions = sqliteTable("study_sessions", {
  id: text("id").primaryKey(),
  disciplineId: text("discipline_id").notNull().references(() => disciplines.id, { onDelete: "cascade" }),
  topicId: text("topic_id").references(() => topics.id, { onDelete: "set null" }),
  userId: text("user_id").notNull(),
  questions: integer("questions").notNull(),
  correct: integer("correct").notNull(),
  sessionDate: text("session_date").notNull(),
  notes: text("notes").notNull().default(""),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("idx_sessions_user_discipline_date").on(table.userId, table.disciplineId, table.sessionDate),
  index("idx_sessions_user_topic_date").on(table.userId, table.topicId, table.sessionDate),
]);
