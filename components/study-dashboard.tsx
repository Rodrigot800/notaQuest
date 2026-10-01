"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  BookOpenCheck,
  CircleCheck,
  FileText,
  LayoutDashboard,
  Loader2,
  LogOut,
  NotebookPen,
  Plus,
  Target,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type Contest = {
  id: string;
  title: string;
  position: string;
  board: string;
  examDate: string | null;
};
type Discipline = { id: string; contestId: string; name: string };
type Topic = {
  id: string;
  disciplineId: string;
  title: string;
  notes: string;
  completed: number | boolean;
};
type StudySession = {
  id: string;
  disciplineId: string;
  questions: number;
  correct: number;
  sessionDate: string;
  notes: string;
};
type DashboardData = {
  contests: Contest[];
  disciplines: Discipline[];
  topics: Topic[];
  sessions: StudySession[];
};

type ModelTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => Promise<unknown>;
};

declare global {
  interface Document {
    modelContext?: {
      registerTool: (tool: ModelTool, options?: { signal?: AbortSignal }) => void | Promise<void>;
    };
  }
}

const emptyData: DashboardData = {
  contests: [],
  disciplines: [],
  topics: [],
  sessions: [],
};

const colors = ["#06b6d4", "#8b5cf6", "#f59e0b", "#10b981", "#f43f5e", "#3b82f6"];

export function StudyDashboard({ displayName }: { displayName: string }) {
  const [data, setData] = useState<DashboardData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [activeContestId, setActiveContestId] = useState("");
  const [tab, setTab] = useState("visao");
  const [dialog, setDialog] = useState<"contest" | "discipline" | "topic" | "session" | "notes" | null>(null);
  const [selectedDisciplineId, setSelectedDisciplineId] = useState("");
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/dashboard", { cache: "no-store" });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Não foi possível carregar os dados.");
    const next = (await response.json()) as DashboardData;
    setData(next);
    setActiveContestId((current) =>
      current && next.contests.some((contest) => contest.id === current)
        ? current
        : next.contests[0]?.id ?? "",
    );
  }, []);

  useEffect(() => {
    refresh()
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Não foi possível carregar os dados."))
      .finally(() => setLoading(false));
  }, [refresh]);

  const activeContest = data.contests.find((contest) => contest.id === activeContestId);
  const disciplines = data.disciplines.filter((discipline) => discipline.contestId === activeContestId);
  const disciplineIds = useMemo(() => new Set(disciplines.map((discipline) => discipline.id)), [disciplines]);
  const topics = data.topics.filter((topic) => disciplineIds.has(topic.disciplineId));
  const sessions = data.sessions.filter((session) => disciplineIds.has(session.disciplineId));
  const totalQuestions = sessions.reduce((sum, session) => sum + Number(session.questions), 0);
  const totalCorrect = sessions.reduce((sum, session) => sum + Number(session.correct), 0);
  const accuracy = totalQuestions ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
  const completedTopics = topics.filter((topic) => Boolean(topic.completed)).length;
  const progress = topics.length ? Math.round((completedTopics / topics.length) * 100) : 0;
  const firstName = displayName.includes("@") ? "Estudante" : displayName.split(" ")[0];

  const chartByDiscipline = disciplines.map((discipline, index) => {
    const own = sessions.filter((session) => session.disciplineId === discipline.id);
    const questions = own.reduce((sum, session) => sum + Number(session.questions), 0);
    const correct = own.reduce((sum, session) => sum + Number(session.correct), 0);
    return {
      name: discipline.name.length > 20 ? discipline.name.slice(0, 18) + "…" : discipline.name,
      accuracy: questions ? Math.round((correct / questions) * 100) : 0,
      fill: colors[index % colors.length],
    };
  });
  const evolution = sessions.map((session) => ({
    date: formatDate(session.sessionDate, true),
    accuracy: Math.round((Number(session.correct) / Number(session.questions)) * 100),
  }));

  async function mutate(path: string, body: Record<string, unknown>, method = "POST") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Não foi possível salvar.");
      await refresh();
      setDialog(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleTopic(topic: Topic) {
    const completed = !Boolean(topic.completed);
    setData((current) => ({
      ...current,
      topics: current.topics.map((item) => item.id === topic.id ? { ...item, completed } : item),
    }));
    try {
      const response = await fetch(`/api/topics/${topic.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed }),
      });
      if (!response.ok) throw new Error("Não foi possível atualizar.");
    } catch {
      setData((current) => ({
        ...current,
        topics: current.topics.map((item) => item.id === topic.id ? { ...item, completed: topic.completed } : item),
      }));
      setError("Não foi possível atualizar o tópico.");
    }
  }

  function openTopicDialog(disciplineId: string) {
    setSelectedDisciplineId(disciplineId);
    setDialog("topic");
  }

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: ModelTool) => {
      try {
        void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => undefined);
      } catch {
        // WebMCP is optional and must never block the visible experience.
      }
    };

    register({
      name: "create_contest",
      title: "Cadastrar concurso",
      description: "Cadastra um concurso, sua vaga e a banca para o usuário autenticado.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Nome do concurso." },
          position: { type: "string", description: "Nome da vaga ou cargo." },
          board: { type: "string", description: "Banca organizadora." },
          examDate: { type: "string", description: "Data opcional da prova no formato AAAA-MM-DD." },
        },
        required: ["title", "position", "board"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input) {
        const body = input as Record<string, unknown>;
        if (!body.title || !body.position || !body.board) throw new Error("Concurso, vaga e banca são obrigatórios.");
        const response = await fetch("/api/contests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error((await response.json()).error || "Não foi possível cadastrar.");
        const result = await response.json();
        await refresh();
        return { id: result.id, created: true };
      },
    });

    register({
      name: "register_question_session",
      title: "Registrar sessão de questões",
      description: "Registra o resultado de questões feitas fora do sistema em uma disciplina existente.",
      inputSchema: {
        type: "object",
        properties: {
          disciplineId: { type: "string", description: "ID da disciplina." },
          questions: { type: "integer", minimum: 1, description: "Quantidade de questões feitas." },
          correct: { type: "integer", minimum: 0, description: "Quantidade de acertos." },
          sessionDate: { type: "string", description: "Data no formato AAAA-MM-DD." },
          notes: { type: "string", description: "Observação opcional." },
        },
        required: ["disciplineId", "questions", "correct", "sessionDate"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input) {
        const body = input as Record<string, unknown>;
        const questions = Number(body.questions);
        const correct = Number(body.correct);
        if (!body.disciplineId || !Number.isInteger(questions) || !Number.isInteger(correct) || correct > questions) {
          throw new Error("Disciplina e quantidades válidas são obrigatórias.");
        }
        const response = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error((await response.json()).error || "Não foi possível registrar.");
        const result = await response.json();
        await refresh();
        return { id: result.id, created: true };
      },
    });

    return () => lifecycle.abort();
  }, [refresh]);

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-background">
        <div className="text-center">
          <Loader2 className="mx-auto size-7 animate-spin text-cyan-600" />
          <p className="mt-3 text-sm text-muted-foreground">Carregando seu plano de estudos…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-white/8 bg-[#0a1629] px-5 py-6 text-white lg:flex">
        <Brand />
        <nav className="space-y-1" aria-label="Navegação principal">
          <NavButton active={tab === "visao"} icon={<LayoutDashboard />} onClick={() => setTab("visao")}>Visão geral</NavButton>
          <NavButton active={tab === "conteudo"} icon={<BookOpenCheck />} onClick={() => setTab("conteudo")}>Meu conteúdo</NavButton>
          <NavButton active={tab === "metricas"} icon={<BarChart3 />} onClick={() => setTab("metricas")}>Métricas</NavButton>
        </nav>
        <div className="mt-auto rounded-2xl border border-white/8 bg-white/5 p-4">
          <p className="truncate text-sm font-medium">{displayName}</p>
          <a className="mt-3 flex items-center gap-2 text-xs text-slate-400 hover:text-white" href="/signout-with-chatgpt?return_to=/">
            <LogOut className="size-3.5" /> Sair
          </a>
        </div>
      </aside>

      <section className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:ml-64 lg:px-10 lg:py-9">
        <div className="mb-6 flex items-center justify-between lg:hidden">
          <Brand compact />
          <a className="text-sm text-muted-foreground" href="/signout-with-chatgpt?return_to=/">Sair</a>
        </div>

        <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm text-muted-foreground">{new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" }).format(new Date())}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Olá, {firstName}. Vamos avançar?</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="h-11 rounded-xl" onClick={() => setDialog("contest")}>
              <Plus /> Concurso
            </Button>
            <Button
              className="h-11 rounded-xl bg-cyan-400 px-5 font-semibold text-[#071322] hover:bg-cyan-300"
              disabled={!disciplines.length}
              onClick={() => setDialog("session")}
            >
              <Plus /> Registrar questões
            </Button>
          </div>
        </header>

        {error && (
          <div role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {data.contests.length > 0 && (
          <div className="mt-7 flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-3 shadow-sm">
            <span className="pl-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Concurso ativo</span>
            <NativeSelect className="min-w-64 border-0 bg-slate-50 font-medium shadow-none" value={activeContestId} onChange={(event) => setActiveContestId(event.target.value)}>
              {data.contests.map((contest) => (
                <NativeSelectOption key={contest.id} value={contest.id}>{contest.title} — {contest.position}</NativeSelectOption>
              ))}
            </NativeSelect>
            {activeContest && <span className="ml-auto pr-2 text-sm text-muted-foreground">Banca {activeContest.board}</span>}
          </div>
        )}

        <Tabs value={tab} onValueChange={setTab} className="mt-5">
          <TabsList variant="line" className="w-full justify-start overflow-x-auto border-b border-border pb-0 lg:hidden">
            <TabsTrigger value="visao" className="px-4 pb-3">Visão geral</TabsTrigger>
            <TabsTrigger value="conteudo" className="px-4 pb-3">Conteúdo</TabsTrigger>
            <TabsTrigger value="metricas" className="px-4 pb-3">Métricas</TabsTrigger>
          </TabsList>

          <TabsContent value="visao" className="pt-5">
            {!activeContest ? (
              <EmptyState
                icon={<Target />}
                title="Cadastre seu primeiro concurso"
                text="Informe o concurso, a vaga e a banca. Depois você poderá organizar as disciplinas e registrar seu desempenho."
                action="Cadastrar concurso"
                onAction={() => setDialog("contest")}
              />
            ) : (
              <>
                <section className="grid gap-4 md:grid-cols-3" aria-label="Resumo do desempenho">
                  <MetricCard icon={<CircleCheck />} label="Questões realizadas" value={String(totalQuestions)} helper={sessions.length ? `${sessions.length} sessões` : "Comece registrando"} />
                  <MetricCard icon={<Target />} label="Taxa de acerto" value={`${accuracy}%`} helper={totalQuestions ? `${totalCorrect} acertos` : "Sem resultados"} />
                  <MetricCard icon={<BookOpenCheck />} label="Conteúdo concluído" value={`${progress}%`} helper={topics.length ? `${completedTopics} de ${topics.length} tópicos` : "Adicione tópicos"} />
                </section>

                <section className="mt-5 grid gap-5 xl:grid-cols-[1.45fr_0.8fr]">
                  <article className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-600">Seu edital</p>
                        <h2 className="mt-2 text-xl font-bold">{activeContest.title} — {activeContest.position}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">Banca {activeContest.board} · {disciplines.length} disciplinas · {topics.length} tópicos</p>
                      </div>
                      <Button variant="outline" className="rounded-xl" onClick={() => setDialog("discipline")}>
                        <Plus /> Disciplina
                      </Button>
                    </div>
                    {disciplines.length ? (
                      <div className="mt-7 space-y-5">
                        {disciplines.map((discipline, index) => {
                          const ownTopics = topics.filter((topic) => topic.disciplineId === discipline.id);
                          const ownSessions = sessions.filter((session) => session.disciplineId === discipline.id);
                          const done = ownTopics.filter((topic) => Boolean(topic.completed)).length;
                          const subjectProgress = ownTopics.length ? Math.round((done / ownTopics.length) * 100) : 0;
                          const subjectQuestions = ownSessions.reduce((sum, session) => sum + Number(session.questions), 0);
                          const subjectCorrect = ownSessions.reduce((sum, session) => sum + Number(session.correct), 0);
                          const subjectAccuracy = subjectQuestions ? Math.round((subjectCorrect / subjectQuestions) * 100) : 0;
                          return (
                            <button key={discipline.id} className="block w-full text-left" onClick={() => setTab("conteudo")}>
                              <div className="mb-2 flex items-end justify-between gap-4">
                                <div>
                                  <p className="font-medium">{discipline.name}</p>
                                  <p className="text-xs text-muted-foreground">{subjectQuestions ? `${subjectAccuracy}% de acertos · ${subjectQuestions} questões` : "Sem questões registradas"}</p>
                                </div>
                                <span className="text-sm font-semibold">{subjectProgress}%</span>
                              </div>
                              <Progress value={subjectProgress} className="h-2.5 bg-slate-100 [&_[data-slot=progress-indicator]]:bg-cyan-500" />
                              <span className="sr-only">Abrir conteúdo de {discipline.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <SmallEmpty text="Adicione as disciplinas do edital para começar a organizar o conteúdo." />
                    )}
                  </article>

                  <article className="overflow-hidden rounded-2xl bg-[#0a1629] p-6 text-white shadow-sm">
                    <p className="text-sm text-slate-400">Última sessão</p>
                    {sessions.length ? (
                      (() => {
                        const last = sessions[sessions.length - 1];
                        const discipline = disciplines.find((item) => item.id === last.disciplineId);
                        const percent = Math.round((Number(last.correct) / Number(last.questions)) * 100);
                        return (
                          <>
                            <h2 className="mt-2 text-xl font-semibold">{discipline?.name}</h2>
                            <div className="mt-8 flex items-end gap-2">
                              <strong className="text-6xl font-bold tracking-tighter text-cyan-300">{last.correct}</strong>
                              <span className="pb-2 text-slate-400">acertos de {last.questions}</span>
                            </div>
                            <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
                              <div className="h-full rounded-full bg-cyan-400" style={{ width: `${percent}%` }} />
                            </div>
                            <p className="mt-3 text-sm text-slate-300">{percent}% de aproveitamento · {formatDate(last.sessionDate)}</p>
                            <Button variant="ghost" className="mt-6 w-full rounded-xl border border-white/10 text-white hover:bg-white/10 hover:text-white" onClick={() => setTab("metricas")}>
                              Ver histórico completo
                            </Button>
                          </>
                        );
                      })()
                    ) : (
                      <div className="mt-8">
                        <Target className="size-10 text-cyan-300" />
                        <h2 className="mt-5 text-xl font-semibold">Seu histórico começa aqui</h2>
                        <p className="mt-2 text-sm leading-6 text-slate-400">Registre quantas questões você fez fora do sistema e quantas acertou.</p>
                      </div>
                    )}
                  </article>
                </section>
              </>
            )}
          </TabsContent>

          <TabsContent value="conteudo" className="pt-5">
            {!activeContest ? (
              <EmptyState icon={<BookOpenCheck />} title="Nenhum conteúdo ainda" text="Cadastre um concurso antes de organizar suas disciplinas." action="Cadastrar concurso" onAction={() => setDialog("contest")} />
            ) : (
              <section className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-bold">Conteúdo do edital</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Marque cada tópico concluído e guarde suas anotações.</p>
                  </div>
                  <Button className="rounded-xl" onClick={() => setDialog("discipline")}><Plus /> Nova disciplina</Button>
                </div>
                {disciplines.map((discipline, index) => {
                  const ownTopics = topics.filter((topic) => topic.disciplineId === discipline.id);
                  const done = ownTopics.filter((topic) => Boolean(topic.completed)).length;
                  const percentage = ownTopics.length ? Math.round((done / ownTopics.length) * 100) : 0;
                  return (
                    <article key={discipline.id} className="overflow-hidden rounded-2xl border bg-white shadow-sm">
                      <header className="flex flex-wrap items-center gap-4 border-b bg-slate-50/70 p-5">
                        <span className="h-10 w-1.5 rounded-full" style={{ background: colors[index % colors.length] }} />
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold">{discipline.name}</h3>
                          <p className="text-sm text-muted-foreground">{done} de {ownTopics.length} tópicos concluídos</p>
                        </div>
                        <div className="flex w-32 items-center gap-3">
                          <Progress value={percentage} className="bg-slate-200" />
                          <span className="text-sm font-semibold">{percentage}%</span>
                        </div>
                        <Button variant="outline" size="sm" className="rounded-lg" onClick={() => openTopicDialog(discipline.id)}><Plus /> Tópico</Button>
                      </header>
                      {ownTopics.length ? (
                        <div className="divide-y">
                          {ownTopics.map((topic) => (
                            <div key={topic.id} className="flex items-start gap-3 px-5 py-4">
                              <Checkbox checked={Boolean(topic.completed)} onCheckedChange={() => toggleTopic(topic)} aria-label={`Marcar ${topic.title} como concluído`} className="mt-1 size-5" />
                              <button
                                className="min-w-0 flex-1 text-left"
                                onClick={() => { setSelectedTopic(topic); setDialog("notes"); }}
                              >
                                <p className={`font-medium ${topic.completed ? "text-muted-foreground line-through" : ""}`}>{topic.title}</p>
                                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{topic.notes || "Sem anotações. Clique para adicionar."}</p>
                              </button>
                              <Button variant="ghost" size="icon-sm" onClick={() => { setSelectedTopic(topic); setDialog("notes"); }} aria-label={`Editar anotações de ${topic.title}`}>
                                <NotebookPen />
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <SmallEmpty text="Esta disciplina ainda não tem tópicos." />
                      )}
                    </article>
                  );
                })}
                {!disciplines.length && <EmptyState icon={<FileText />} title="Adicione uma disciplina" text="Crie livremente as disciplinas do seu edital." action="Nova disciplina" onAction={() => setDialog("discipline")} />}
              </section>
            )}
          </TabsContent>

          <TabsContent value="metricas" className="pt-5">
            {!activeContest ? (
              <EmptyState icon={<BarChart3 />} title="Métricas ainda não disponíveis" text="Cadastre um concurso e registre suas sessões de questões." action="Cadastrar concurso" onAction={() => setDialog("contest")} />
            ) : (
              <section>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-bold">Seu desempenho</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Resultados das questões feitas fora do sistema.</p>
                  </div>
                  <Button className="rounded-xl" disabled={!disciplines.length} onClick={() => setDialog("session")}><Plus /> Registrar sessão</Button>
                </div>
                <div className="mt-5 grid gap-5 xl:grid-cols-2">
                  <ChartCard title="Evolução dos acertos" empty={!evolution.length}>
                    <ChartContainer config={{ accuracy: { label: "Acertos", color: "#06b6d4" } }} className="h-64 w-full">
                      <LineChart data={evolution} accessibilityLayer margin={{ left: -15, right: 12, top: 12 }}>
                        <CartesianGrid vertical={false} strokeDasharray="4 4" />
                        <XAxis dataKey="date" tickLine={false} axisLine={false} />
                        <YAxis domain={[0, 100]} tickLine={false} axisLine={false} unit="%" />
                        <ChartTooltip content={<ChartTooltipContent formatter={(value) => <span className="font-semibold">{Number(value)}%</span>} />} />
                        <Line dataKey="accuracy" type="monotone" stroke="var(--color-accuracy)" strokeWidth={3} dot={{ r: 4, fill: "#06b6d4" }} />
                      </LineChart>
                    </ChartContainer>
                  </ChartCard>
                  <ChartCard title="Acertos por disciplina" empty={!chartByDiscipline.length}>
                    <ChartContainer config={{ accuracy: { label: "Acertos", color: "#8b5cf6" } }} className="h-64 w-full">
                      <BarChart data={chartByDiscipline} accessibilityLayer margin={{ left: -15, right: 12, top: 12 }}>
                        <CartesianGrid vertical={false} strokeDasharray="4 4" />
                        <XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} tick={{ fontSize: 11 }} />
                        <YAxis domain={[0, 100]} tickLine={false} axisLine={false} unit="%" />
                        <ChartTooltip content={<ChartTooltipContent formatter={(value) => <span className="font-semibold">{Number(value)}%</span>} />} />
                        <Bar dataKey="accuracy" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ChartContainer>
                  </ChartCard>
                </div>
                <article className="mt-5 rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
                  <h3 className="font-semibold">Histórico de sessões</h3>
                  {sessions.length ? (
                    <Table className="mt-4">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Disciplina</TableHead>
                          <TableHead>Resultado</TableHead>
                          <TableHead className="text-right">Aproveitamento</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...sessions].reverse().map((session) => (
                          <TableRow key={session.id}>
                            <TableCell>{formatDate(session.sessionDate)}</TableCell>
                            <TableCell>{disciplines.find((item) => item.id === session.disciplineId)?.name}</TableCell>
                            <TableCell>{session.correct} de {session.questions}</TableCell>
                            <TableCell className="text-right font-semibold">{Math.round((Number(session.correct) / Number(session.questions)) * 100)}%</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <SmallEmpty text="Nenhuma sessão de questões registrada." />
                  )}
                </article>
              </section>
            )}
          </TabsContent>
        </Tabs>
      </section>

      <ContestDialog open={dialog === "contest"} busy={busy} onOpenChange={(open) => !open && setDialog(null)} onSubmit={(body) => mutate("/api/contests", body)} />
      <DisciplineDialog open={dialog === "discipline"} busy={busy} onOpenChange={(open) => !open && setDialog(null)} onSubmit={(name) => mutate("/api/disciplines", { contestId: activeContestId, name })} />
      <TopicDialog open={dialog === "topic"} busy={busy} onOpenChange={(open) => !open && setDialog(null)} onSubmit={(body) => mutate("/api/topics", { disciplineId: selectedDisciplineId, ...body })} />
      <SessionDialog open={dialog === "session"} busy={busy} disciplines={disciplines} onOpenChange={(open) => !open && setDialog(null)} onSubmit={(body) => mutate("/api/sessions", body)} />
      <NotesDialog open={dialog === "notes"} busy={busy} topic={selectedTopic} onOpenChange={(open) => !open && setDialog(null)} onSubmit={(notes) => selectedTopic && mutate(`/api/topics/${selectedTopic.id}`, { notes }, "PATCH")} />
    </main>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${compact ? "" : "mb-10 px-2"}`}>
      <div className="grid size-10 place-items-center rounded-xl bg-cyan-400 text-[#071322]"><Target className="size-5" strokeWidth={2.5} /></div>
      <div>
        <p className={`font-semibold tracking-tight ${compact ? "text-foreground" : "text-white"}`}>Rumo à Aprovação</p>
        {!compact && <p className="text-xs text-slate-400">Seu plano de estudos</p>}
      </div>
    </div>
  );
}

function NavButton({ active, icon, onClick, children }: { active: boolean; icon: ReactNode; onClick: () => void; children: ReactNode }) {
  return (
    <button className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${active ? "bg-white/10 font-medium text-white" : "text-slate-300 hover:bg-white/6"} [&_svg]:size-4`} onClick={onClick}>
      <span className={active ? "text-cyan-300" : ""}>{icon}</span>{children}
    </button>
  );
}

function MetricCard({ icon, label, value, helper }: { icon: ReactNode; label: string; value: string; helper: string }) {
  return (
    <article className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="grid size-10 place-items-center rounded-xl bg-cyan-50 text-cyan-700 [&_svg]:size-5">{icon}</span>
        <span className="text-xs font-medium text-muted-foreground">{helper}</span>
      </div>
      <p className="mt-5 text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-bold tracking-tight">{value}</p>
    </article>
  );
}

function EmptyState({ icon, title, text, action, onAction }: { icon: ReactNode; title: string; text: string; action: string; onAction: () => void }) {
  return (
    <div className="grid min-h-[420px] place-items-center rounded-2xl border border-dashed bg-white p-8 text-center">
      <div>
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-cyan-50 text-cyan-700 [&_svg]:size-6">{icon}</span>
        <h2 className="mt-5 text-xl font-semibold">{title}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{text}</p>
        <Button className="mt-6 rounded-xl" onClick={onAction}><Plus /> {action}</Button>
      </div>
    </div>
  );
}

function SmallEmpty({ text }: { text: string }) {
  return <p className="px-5 py-8 text-center text-sm text-muted-foreground">{text}</p>;
}

function ChartCard({ title, empty, children }: { title: string; empty: boolean; children: ReactNode }) {
  return (
    <article className="rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
      <h3 className="font-semibold">{title}</h3>
      {empty ? <SmallEmpty text="Registre algumas sessões para visualizar este gráfico." /> : <div className="mt-4">{children}</div>}
    </article>
  );
}

function DialogShell({ open, onOpenChange, title, description, children, busy }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; children: ReactNode; busy: boolean }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        {busy && <div className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-white/75"><Loader2 className="size-7 animate-spin text-cyan-600" /></div>}
      </DialogContent>
    </Dialog>
  );
}

function ContestDialog({ open, onOpenChange, onSubmit, busy }: { open: boolean; onOpenChange: (open: boolean) => void; onSubmit: (body: Record<string, unknown>) => void; busy: boolean }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit(Object.fromEntries(form.entries()));
  }
  return (
    <DialogShell open={open} onOpenChange={onOpenChange} title="Novo concurso" description="Cadastre o concurso, a vaga desejada e a banca organizadora." busy={busy}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Concurso" name="title" placeholder="Ex.: Tribunal Regional do Trabalho" required />
        <Field label="Vaga" name="position" placeholder="Ex.: Analista de TI" required />
        <Field label="Banca" name="board" placeholder="Ex.: FCC" required />
        <Field label="Data da prova (opcional)" name="examDate" type="date" />
        <DialogFooter><Button type="submit" className="rounded-xl">Cadastrar concurso</Button></DialogFooter>
      </form>
    </DialogShell>
  );
}

function DisciplineDialog({ open, onOpenChange, onSubmit, busy }: { open: boolean; onOpenChange: (open: boolean) => void; onSubmit: (name: string) => void; busy: boolean }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(String(new FormData(event.currentTarget).get("name") ?? ""));
  }
  return (
    <DialogShell open={open} onOpenChange={onOpenChange} title="Nova disciplina" description="Crie livremente uma área do edital." busy={busy}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nome da disciplina" name="name" placeholder="Ex.: Engenharia de Software" required />
        <DialogFooter><Button type="submit" className="rounded-xl">Adicionar disciplina</Button></DialogFooter>
      </form>
    </DialogShell>
  );
}

function TopicDialog({ open, onOpenChange, onSubmit, busy }: { open: boolean; onOpenChange: (open: boolean) => void; onSubmit: (body: Record<string, unknown>) => void; busy: boolean }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(Object.fromEntries(new FormData(event.currentTarget).entries()));
  }
  return (
    <DialogShell open={open} onOpenChange={onOpenChange} title="Novo tópico" description="Adicione um item do conteúdo e, se quiser, suas primeiras anotações." busy={busy}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Tópico ou subtópico" name="title" placeholder="Ex.: Modelos de desenvolvimento de software" required />
        <div className="space-y-2"><Label htmlFor="topic-notes">Anotações</Label><Textarea id="topic-notes" name="notes" className="min-h-32" placeholder="Escreva sua explicação, resumo ou pontos importantes…" /></div>
        <DialogFooter><Button type="submit" className="rounded-xl">Adicionar tópico</Button></DialogFooter>
      </form>
    </DialogShell>
  );
}

function SessionDialog({ open, onOpenChange, onSubmit, busy, disciplines }: { open: boolean; onOpenChange: (open: boolean) => void; onSubmit: (body: Record<string, unknown>) => void; busy: boolean; disciplines: Discipline[] }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(Object.fromEntries(new FormData(event.currentTarget).entries()));
  }
  return (
    <DialogShell open={open} onOpenChange={onOpenChange} title="Registrar questões" description="Informe o resultado de uma sessão feita fora do sistema." busy={busy}>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="session-discipline">Disciplina</Label>
          <NativeSelect id="session-discipline" name="disciplineId" className="w-full" required>
            <NativeSelectOption value="">Selecione</NativeSelectOption>
            {disciplines.map((discipline) => <NativeSelectOption key={discipline.id} value={discipline.id}>{discipline.name}</NativeSelectOption>)}
          </NativeSelect>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Questões feitas" name="questions" type="number" min="1" required />
          <Field label="Acertos" name="correct" type="number" min="0" required />
        </div>
        <Field label="Data" name="sessionDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
        <div className="space-y-2"><Label htmlFor="session-notes">Observação (opcional)</Label><Textarea id="session-notes" name="notes" placeholder="Ex.: Simulado da banca FCC" /></div>
        <DialogFooter><Button type="submit" className="rounded-xl">Salvar resultado</Button></DialogFooter>
      </form>
    </DialogShell>
  );
}

function NotesDialog({ open, onOpenChange, onSubmit, busy, topic }: { open: boolean; onOpenChange: (open: boolean) => void; onSubmit: (notes: string) => void; busy: boolean; topic: Topic | null }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(String(new FormData(event.currentTarget).get("notes") ?? ""));
  }
  return (
    <DialogShell open={open} onOpenChange={onOpenChange} title={topic?.title ?? "Anotações"} description="Use este espaço para explicações longas, resumos e pontos de revisão." busy={busy}>
      <form onSubmit={submit} className="space-y-4">
        <Textarea key={topic?.id} name="notes" defaultValue={topic?.notes ?? ""} className="min-h-72 leading-6" placeholder="Digite suas anotações…" />
        <DialogFooter><Button type="submit" className="rounded-xl">Salvar anotações</Button></DialogFooter>
      </form>
    </DialogShell>
  );
}

function Field({ label, name, ...props }: { label: string; name: string } & React.ComponentProps<typeof Input>) {
  const id = `field-${name}`;
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Input id={id} name={name} className="h-11 rounded-xl" {...props} /></div>;
}

function formatDate(value: string, short = false) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("pt-BR", short ? { day: "2-digit", month: "2-digit" } : { dateStyle: "short" }).format(new Date(year, month - 1, day));
}
