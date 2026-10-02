"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  BookOpenCheck,
  CalendarDays,
  ChevronRight,
  CircleCheck,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Loader2,
  LogOut,
  Pencil,
  Plus,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  topicId: string | null;
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

const colors = ["#0aa6b5", "#2563eb", "#14b8a6", "#6366f1", "#0891b2", "#64748b"];

function naturalCompare(left: string, right: string) {
  return left.localeCompare(right, "pt-BR", { numeric: true, sensitivity: "base" });
}

export function StudyDashboard({ displayName }: { displayName: string }) {
  const [data, setData] = useState<DashboardData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [activeContestId, setActiveContestId] = useState("");
  const [tab, setTab] = useState("visao");
  const [dialog, setDialog] = useState<"contest" | "discipline" | "topic" | "session" | null>(null);
  const [selectedDiscipline, setSelectedDiscipline] = useState<Discipline | null>(null);
  const [selectedDisciplineId, setSelectedDisciplineId] = useState("");
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [selectedSession, setSelectedSession] = useState<StudySession | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "discipline" | "topic" | "session"; id: string; label: string } | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

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
  const disciplines = data.disciplines
    .filter((discipline) => discipline.contestId === activeContestId)
    .sort((left, right) => naturalCompare(left.name, right.name));
  const disciplineIds = useMemo(() => new Set(disciplines.map((discipline) => discipline.id)), [disciplines]);
  const topics = data.topics
    .filter((topic) => disciplineIds.has(topic.disciplineId))
    .sort((left, right) => naturalCompare(left.title, right.title));
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

  async function removeItem() {
    if (!deleteTarget) return;
    setBusy(true);
    setError("");
    try {
      const path = deleteTarget.type === "discipline"
        ? `/api/disciplines/${deleteTarget.id}`
        : deleteTarget.type === "topic"
          ? `/api/topics/${deleteTarget.id}`
          : `/api/sessions/${deleteTarget.id}`;
      const response = await fetch(path, {
        method: "DELETE",
        ...(deleteTarget.type === "discipline" ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmation: deleteConfirmation }),
        } : {}),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Não foi possível excluir.");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível excluir.");
    } finally {
      setBusy(false);
      setDeleteTarget(null);
      setDeleteConfirmation("");
    }
  }

  function requestDelete(target: { type: "discipline" | "topic" | "session"; id: string; label: string }) {
    setDeleteConfirmation("");
    setDeleteTarget(target);
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
    setSelectedTopic(null);
    setDialog("topic");
  }

  function openDisciplineDialog(discipline: Discipline | null = null) {
    setSelectedDiscipline(discipline);
    setDialog("discipline");
  }

  function openSessionDialog(topic: Topic | null = null) {
    setSelectedSession(null);
    setSelectedTopic(topic);
    setSelectedDisciplineId(topic?.disciplineId ?? "");
    setDialog("session");
  }

  function editSession(session: StudySession) {
    setSelectedSession(session);
    setSelectedTopic(data.topics.find((topic) => topic.id === session.topicId) ?? null);
    setSelectedDisciplineId(session.disciplineId);
    setDialog("session");
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
          topicId: { type: "string", description: "ID opcional do subtópico estudado." },
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

    register({
      name: "import_syllabus_topics",
      title: "Importar tópicos do edital",
      description: "Cria ou atualiza uma lista numerada de tópicos em uma disciplina existente, sem duplicar itens com o mesmo número.",
      inputSchema: {
        type: "object",
        properties: {
          disciplineName: { type: "string", description: "Nome exato da disciplina de destino." },
          items: {
            type: "array",
            minItems: 1,
            maxItems: 100,
            items: {
              type: "object",
              properties: {
                title: { type: "string", description: "Título numerado do tópico." },
                notes: { type: "string", description: "Detalhamento ou subtópicos relacionados." },
              },
              required: ["title"],
              additionalProperties: false,
            },
          },
        },
        required: ["disciplineName", "items"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input) {
        const body = input as { disciplineName?: string; items?: Array<{ title: string; notes?: string }> };
        const discipline = data.disciplines.find((item) => naturalCompare(item.name, body.disciplineName ?? "") === 0);
        if (!discipline) throw new Error("Disciplina não encontrada.");
        const response = await fetch("/api/topics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ disciplineId: discipline.id, items: body.items }),
        });
        if (!response.ok) throw new Error((await response.json()).error || "Não foi possível importar.");
        const result = await response.json();
        await refresh();
        return result;
      },
    });

    return () => lifecycle.abort();
  }, [data.disciplines, refresh]);

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
    <main className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_76%_-20%,rgba(34,211,238,0.14),transparent_58%)]" />

      <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 overflow-hidden border-r border-white/10 bg-[#07182d] text-white lg:flex">
        <div aria-hidden="true" className="absolute -left-24 top-20 size-72 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative flex h-full w-full flex-col px-5 py-6">
          <Brand />
          <p className="mb-3 px-3 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-slate-500">Organização</p>
          <nav className="space-y-1.5" aria-label="Navegação principal">
            <NavButton active={tab === "visao"} icon={<LayoutDashboard />} onClick={() => setTab("visao")}>Visão geral</NavButton>
            <NavButton active={tab === "conteudo"} icon={<BookOpenCheck />} onClick={() => setTab("conteudo")}>Meu conteúdo</NavButton>
            <NavButton active={tab === "metricas"} icon={<BarChart3 />} onClick={() => setTab("metricas")}>Métricas</NavButton>
          </nav>
          <div className="mt-auto rounded-[1.35rem] border border-white/10 bg-white/[0.06] p-3.5 shadow-2xl shadow-black/10 backdrop-blur">
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-cyan-300/15 text-sm font-bold text-cyan-200">{firstName.slice(0, 1).toUpperCase()}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{displayName}</p>
                <p className="text-xs text-slate-400">Plano de estudos</p>
              </div>
            </div>
            <a className="mt-3 flex items-center justify-between rounded-xl px-2.5 py-2 text-sm text-slate-400 hover:bg-white/[0.06] hover:text-white" href="/signout-with-chatgpt?return_to=/">
              <span className="flex items-center gap-2"><LogOut className="size-4" /> Sair</span>
              <ChevronRight className="size-4" />
            </a>
          </div>
        </div>
      </aside>

      <section className="relative mx-auto max-w-[1480px] px-4 pb-10 pt-4 sm:px-6 lg:ml-72 lg:px-10 lg:pb-14 lg:pt-9 xl:px-12">
        <div className="mb-6 flex items-center justify-between rounded-2xl border bg-card/90 p-3 shadow-[0_10px_30px_rgba(15,36,58,0.06)] backdrop-blur lg:hidden">
          <Brand compact />
          <a className="grid size-10 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground" href="/signout-with-chatgpt?return_to=/" aria-label="Sair">
            <LogOut className="size-4" />
          </a>
        </div>

        <header className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-2"><CalendarDays className="size-4 text-cyan-600" /> {new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" }).format(new Date())}</span>
              <span className="hidden h-1 w-1 rounded-full bg-slate-300 sm:block" />
              <span className="hidden items-center gap-1.5 text-cyan-700 sm:flex"><Sparkles className="size-3.5" /> Seu progresso em foco</span>
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-[-0.035em] sm:text-4xl">Olá, {firstName}. Vamos avançar?</h1>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Button variant="outline" className="h-11 rounded-xl border-border/80 bg-card px-4 shadow-sm hover:-translate-y-0.5 hover:bg-card hover:shadow-md" onClick={() => setDialog("contest")}>
              <Plus /> Concurso
            </Button>
            <Button
              className="h-11 rounded-xl bg-[#0a9ba9] px-5 font-semibold text-white shadow-[0_8px_22px_rgba(10,155,169,0.24)] hover:-translate-y-0.5 hover:bg-[#078b98] hover:shadow-[0_10px_26px_rgba(10,155,169,0.3)]"
              disabled={!disciplines.length}
              onClick={() => openSessionDialog()}
            >
              <Plus /> Registrar questões
            </Button>
          </div>
        </header>

        {error && (
          <div role="alert" className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3.5 text-sm text-rose-700 shadow-sm">
            {error}
          </div>
        )}

        {data.contests.length > 0 && (
          <div className="mt-7 flex flex-wrap items-center gap-3 rounded-[1.35rem] border bg-card/95 p-2.5 shadow-[0_12px_35px_rgba(15,36,58,0.07)] backdrop-blur">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-300"><GraduationCap className="size-5" /></span>
            <div className="min-w-[12rem] flex-1">
              <p className="px-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Concurso ativo</p>
              <div className="mt-0.5 flex min-w-0 items-center gap-2">
                <NativeSelect
                  wrapperClassName="w-1/2 max-w-48"
                  className="h-9 w-full min-w-0 border-0 bg-transparent py-0 pl-3 pr-9 text-sm font-semibold shadow-none"
                  aria-label="Concurso ativo"
                  value={activeContestId}
                  onChange={(event) => setActiveContestId(event.target.value)}
                >
                  {data.contests.map((contest) => (
                    <NativeSelectOption key={contest.id} value={contest.id}>{contest.title}</NativeSelectOption>
                  ))}
                </NativeSelect>
                {activeContest && <span className="min-w-0 flex-1 break-words text-sm font-semibold leading-5 text-muted-foreground">— {activeContest.position}</span>}
              </div>
            </div>
            {activeContest && (
              <div className="flex w-full min-w-0 flex-col gap-2 text-sm sm:flex-row sm:items-center">
                <span className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 rounded-xl bg-muted/55 px-3 py-2 sm:max-w-72">
                  <span className="shrink-0 text-muted-foreground">Banca</span>
                  <strong className="min-w-0 break-words font-semibold leading-5 text-foreground">{activeContest.board}</strong>
                </span>
                <span className="flex items-center gap-2 rounded-xl bg-muted/55 px-3 py-2 text-muted-foreground">
                  <Target className="size-4 shrink-0 text-cyan-600" />
                  <span>Acertos</span>
                  <strong className="whitespace-nowrap font-semibold text-foreground">{totalCorrect}/{totalQuestions}</strong>
                </span>
                {activeContest.examDate && (
                  <span className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/55 px-3 py-2 text-muted-foreground">
                    <span className="flex items-center gap-1.5 whitespace-nowrap"><CalendarDays className="size-4 shrink-0 text-cyan-600" /> Prova em {formatDate(activeContest.examDate)}</span>
                    <strong className="whitespace-nowrap rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-300">{examCountdown(activeContest.examDate)}</strong>
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        <Tabs value={tab} onValueChange={setTab} className="mt-5">
          <TabsList variant="line" className="grid h-auto w-full grid-cols-3 rounded-2xl border bg-card p-1 shadow-sm lg:hidden">
            <TabsTrigger value="visao" className="rounded-xl px-3 py-2.5 text-sm">Visão geral</TabsTrigger>
            <TabsTrigger value="conteudo" className="rounded-xl px-3 py-2.5 text-sm">Conteúdo</TabsTrigger>
            <TabsTrigger value="metricas" className="rounded-xl px-3 py-2.5 text-sm">Métricas</TabsTrigger>
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
                  <MetricCard tone="cyan" icon={<CircleCheck />} label="Questões realizadas" value={String(totalQuestions)} helper={sessions.length ? `${sessions.length} sessões` : "Comece registrando"} />
                  <MetricCard tone="blue" icon={<Target />} label="Taxa de acerto" value={`${accuracy}%`} helper={totalQuestions ? `${totalCorrect} acertos` : "Sem resultados"} />
                  <MetricCard tone="teal" icon={<BookOpenCheck />} label="Conteúdo concluído" value={`${progress}%`} helper={topics.length ? `${completedTopics} de ${topics.length} tópicos` : "Adicione tópicos"} />
                </section>

                <section className="mt-5 grid gap-5 xl:grid-cols-[1.45fr_0.8fr]">
                  <article className="rounded-[1.5rem] border bg-card p-5 shadow-[0_14px_40px_rgba(15,36,58,0.07)] sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-300">Seu edital</p>
                        <h2 className="mt-2 text-xl font-bold tracking-tight">{activeContest.title} — {activeContest.position}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">Banca {activeContest.board} · {disciplines.length} disciplinas · {topics.length} tópicos</p>
                      </div>
                      <Button variant="outline" className="rounded-xl bg-card shadow-sm" onClick={() => openDisciplineDialog()}>
                        <Plus /> Disciplina
                      </Button>
                    </div>
                    {disciplines.length ? (
                      <div className="mt-6 space-y-2">
                        {disciplines.map((discipline, index) => {
                          const ownTopics = topics.filter((topic) => topic.disciplineId === discipline.id);
                          const ownSessions = sessions.filter((session) => session.disciplineId === discipline.id);
                          const done = ownTopics.filter((topic) => Boolean(topic.completed)).length;
                          const subjectProgress = ownTopics.length ? Math.round((done / ownTopics.length) * 100) : 0;
                          const subjectQuestions = ownSessions.reduce((sum, session) => sum + Number(session.questions), 0);
                          const subjectCorrect = ownSessions.reduce((sum, session) => sum + Number(session.correct), 0);
                          const subjectAccuracy = subjectQuestions ? Math.round((subjectCorrect / subjectQuestions) * 100) : 0;
                          return (
                            <button key={discipline.id} className="group block w-full rounded-2xl p-3 text-left hover:bg-muted/55" onClick={() => setTab("conteudo")}>
                              <div className="mb-2.5 flex items-end justify-between gap-4">
                                <div className="flex min-w-0 items-center gap-3">
                                  <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: colors[index % colors.length] }} />
                                  <div className="min-w-0">
                                    <p className="truncate font-semibold">{discipline.name}</p>
                                    <p className="text-xs text-muted-foreground">{subjectQuestions ? `${subjectCorrect}/${subjectQuestions} acertos · ${subjectAccuracy}%` : "0/0 acertos"}</p>
                                  </div>
                                </div>
                                <span className="flex items-center gap-1 text-sm font-semibold">{subjectProgress}% <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></span>
                              </div>
                              <Progress value={subjectProgress} className="h-2 bg-muted [&_[data-slot=progress-indicator]]:bg-cyan-500" />
                              <span className="sr-only">Abrir conteúdo de {discipline.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <SmallEmpty text="Adicione as disciplinas do edital para começar a organizar o conteúdo." />
                    )}
                  </article>

                  <article className="relative overflow-hidden rounded-[1.5rem] border border-white/10 bg-[linear-gradient(145deg,#07182d_0%,#0b2940_100%)] p-6 text-white shadow-[0_18px_42px_rgba(7,24,45,0.22)]">
                    <div aria-hidden="true" className="absolute -right-16 -top-20 size-56 rounded-full bg-cyan-300/15 blur-3xl" />
                    <div className="relative">
                      <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-slate-300"><Sparkles className="size-3.5 text-cyan-300" /> Última sessão</p>
                      {sessions.length ? (
                        (() => {
                          const last = sessions[sessions.length - 1];
                          const discipline = disciplines.find((item) => item.id === last.disciplineId);
                          const percent = Math.round((Number(last.correct) / Number(last.questions)) * 100);
                          return (
                            <>
                              <h2 className="mt-5 text-xl font-semibold">{discipline?.name}</h2>
                              <div className="mt-7 flex items-end gap-2">
                                <strong className="text-6xl font-bold tracking-[-0.06em] text-cyan-300">{last.correct}</strong>
                                <span className="pb-2 text-slate-400">acertos de {last.questions}</span>
                              </div>
                              <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
                                <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-teal-300" style={{ width: `${percent}%` }} />
                              </div>
                              <p className="mt-3 text-sm text-slate-300">{percent}% de aproveitamento · {formatDate(last.sessionDate)}</p>
                              <Button variant="ghost" className="mt-6 w-full rounded-xl border border-white/10 bg-white/[0.04] text-white hover:bg-white/10 hover:text-white" onClick={() => setTab("metricas")}>
                                Ver histórico completo <ChevronRight className="size-4" />
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
                    </div>
                  </article>
                </section>
              </>
            )}
          </TabsContent>

          <TabsContent value="conteudo" className="pt-5">
            {!activeContest ? (
              <EmptyState icon={<BookOpenCheck />} title="Nenhum conteúdo ainda" text="Cadastre um concurso antes de organizar suas disciplinas." action="Cadastrar concurso" onAction={() => setDialog("contest")} />
            ) : (
              <section className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Conteúdo do edital</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Marque cada tópico concluído e guarde suas anotações.</p>
                  </div>
                  <Button className="rounded-xl bg-[#0a9ba9] text-white shadow-[0_8px_20px_rgba(10,155,169,0.2)] hover:bg-[#078b98]" onClick={() => openDisciplineDialog()}><Plus /> Nova disciplina</Button>
                </div>
                {disciplines.map((discipline, index) => {
                  const ownTopics = topics.filter((topic) => topic.disciplineId === discipline.id);
                  const ownSessions = sessions.filter((session) => session.disciplineId === discipline.id);
                  const done = ownTopics.filter((topic) => Boolean(topic.completed)).length;
                  const percentage = ownTopics.length ? Math.round((done / ownTopics.length) * 100) : 0;
                  const disciplineQuestions = ownSessions.reduce((sum, session) => sum + Number(session.questions), 0);
                  const disciplineCorrect = ownSessions.reduce((sum, session) => sum + Number(session.correct), 0);
                  return (
                    <article key={discipline.id} className="overflow-hidden rounded-[1.5rem] border bg-card shadow-[0_14px_40px_rgba(15,36,58,0.07)]">
                      <header className="border-b bg-muted/45 p-5 sm:p-6">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="mt-0.5 h-10 w-1.5 shrink-0 rounded-full" style={{ background: colors[index % colors.length] }} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                              <h3 className="break-words font-semibold leading-6">{discipline.name}</h3>
                              <span className="whitespace-nowrap rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-300">{disciplineCorrect}/{disciplineQuestions} acertos</span>
                            </div>
                            <p className="text-sm text-muted-foreground">{done} de {ownTopics.length} subtópicos concluídos</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => openDisciplineDialog(discipline)} aria-label={`Editar disciplina ${discipline.name}`}><Pencil /> <span className="hidden sm:inline">Editar</span></Button>
                            <Button variant="ghost" size="icon-sm" className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-500/10" onClick={() => requestDelete({ type: "discipline", id: discipline.id, label: discipline.name })} aria-label={`Excluir disciplina ${discipline.name}`}><Trash2 /></Button>
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap items-center gap-3 pl-4.5">
                          <div className="flex min-w-36 flex-1 items-center gap-3">
                            <Progress value={percentage} className="bg-muted [&_[data-slot=progress-indicator]]:bg-cyan-500" />
                            <span className="w-10 text-right text-sm font-semibold">{percentage}%</span>
                          </div>
                          <Button variant="outline" size="sm" className="rounded-xl bg-card shadow-sm" onClick={() => openTopicDialog(discipline.id)}><Plus /> Subtópico</Button>
                        </div>
                      </header>
                      {ownTopics.length ? (
                        <div className="divide-y">
                          {ownTopics.map((topic) => {
                            const topicSessions = sessions.filter((session) => session.topicId === topic.id);
                            const topicQuestions = topicSessions.reduce((sum, session) => sum + Number(session.questions), 0);
                            return (
                              <div key={topic.id} className="flex items-start gap-3 px-5 py-4 hover:bg-muted/35 sm:px-6">
                                <Checkbox checked={Boolean(topic.completed)} onCheckedChange={() => toggleTopic(topic)} aria-label={`Marcar ${topic.title} como concluído`} className="mt-1 size-5" />
                                <button
                                  className="min-w-0 flex-1 text-left"
                                  onClick={() => { setSelectedTopic(topic); setDialog("topic"); }}
                                >
                                  <p className={`font-medium ${topic.completed ? "text-muted-foreground line-through" : ""}`}>{topic.title}</p>
                                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{topic.notes || "Sem anotações. Clique para editar."}</p>
                                  <p className="mt-2 text-xs font-medium text-cyan-700 dark:text-cyan-300">{topicQuestions ? `${topicQuestions} questões em ${topicSessions.length} sessões` : "Nenhuma questão vinculada"}</p>
                                </button>
                                <div className="flex shrink-0 items-center gap-1">
                                  <Button variant="ghost" size="icon-sm" onClick={() => openSessionDialog(topic)} aria-label={`Adicionar questões a ${topic.title}`}><Plus /></Button>
                                  <Button variant="ghost" size="icon-sm" onClick={() => { setSelectedTopic(topic); setDialog("topic"); }} aria-label={`Editar ${topic.title}`}><Pencil /></Button>
                                  <Button variant="ghost" size="icon-sm" className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-500/10" onClick={() => requestDelete({ type: "topic", id: topic.id, label: topic.title })} aria-label={`Excluir ${topic.title}`}><Trash2 /></Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <SmallEmpty text="Esta disciplina ainda não tem tópicos." />
                      )}
                    </article>
                  );
                })}
                {!disciplines.length && <EmptyState icon={<FileText />} title="Adicione uma disciplina" text="Crie as disciplinas do seu edital e organize seus subtópicos." action="Nova disciplina" onAction={() => openDisciplineDialog()} />}
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
                    <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Seu desempenho</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Resultados das questões feitas fora do sistema.</p>
                  </div>
                  <Button className="rounded-xl bg-[#0a9ba9] text-white shadow-[0_8px_20px_rgba(10,155,169,0.2)] hover:bg-[#078b98]" disabled={!disciplines.length} onClick={() => openSessionDialog()}><Plus /> Registrar sessão</Button>
                </div>
                <div className="mt-5 grid gap-5 xl:grid-cols-2">
                  <ChartCard title="Evolução dos acertos" empty={!evolution.length}>
                    <ChartContainer config={{ accuracy: { label: "Acertos", color: "#0aa6b5" } }} className="h-64 w-full">
                      <LineChart data={evolution} accessibilityLayer margin={{ left: -15, right: 12, top: 12 }}>
                        <CartesianGrid vertical={false} strokeDasharray="4 4" />
                        <XAxis dataKey="date" tickLine={false} axisLine={false} />
                        <YAxis domain={[0, 100]} tickLine={false} axisLine={false} unit="%" />
                        <ChartTooltip content={<ChartTooltipContent formatter={(value) => <span className="font-semibold">{Number(value)}%</span>} />} />
                        <Line dataKey="accuracy" type="monotone" stroke="var(--color-accuracy)" strokeWidth={3} dot={{ r: 4, fill: "#0aa6b5" }} activeDot={{ r: 6, fill: "#0aa6b5" }} />
                      </LineChart>
                    </ChartContainer>
                  </ChartCard>
                  <ChartCard title="Acertos por disciplina" empty={!chartByDiscipline.length}>
                    <ChartContainer config={{ accuracy: { label: "Acertos", color: "#2563eb" } }} className="h-64 w-full">
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
                <article className="mt-5 overflow-hidden rounded-[1.5rem] border bg-card p-5 shadow-[0_14px_40px_rgba(15,36,58,0.07)] sm:p-6">
                  <h3 className="font-semibold">Histórico de sessões</h3>
                  {sessions.length ? (
                    <Table className="mt-4">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Disciplina</TableHead>
                          <TableHead>Subtópico</TableHead>
                          <TableHead>Resultado</TableHead>
                          <TableHead className="text-right">Aproveitamento</TableHead>
                          <TableHead className="w-24 text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...sessions].reverse().map((session) => (
                          <TableRow key={session.id}>
                            <TableCell>{formatDate(session.sessionDate)}</TableCell>
                            <TableCell>{disciplines.find((item) => item.id === session.disciplineId)?.name}</TableCell>
                            <TableCell>{topics.find((item) => item.id === session.topicId)?.title ?? "—"}</TableCell>
                            <TableCell>{session.correct} de {session.questions}</TableCell>
                            <TableCell className="text-right font-semibold">{Math.round((Number(session.correct) / Number(session.questions)) * 100)}%</TableCell>
                            <TableCell>
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="icon-sm" onClick={() => editSession(session)} aria-label="Editar registro de questões"><Pencil /></Button>
                                <Button variant="ghost" size="icon-sm" className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-500/10" onClick={() => requestDelete({ type: "session", id: session.id, label: `${session.questions} questões de ${formatDate(session.sessionDate)}` })} aria-label="Excluir registro de questões"><Trash2 /></Button>
                              </div>
                            </TableCell>
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
      <DisciplineDialog open={dialog === "discipline"} busy={busy} discipline={selectedDiscipline} onOpenChange={(open) => !open && setDialog(null)} onSubmit={(name) => selectedDiscipline ? mutate(`/api/disciplines/${selectedDiscipline.id}`, { name }, "PATCH") : mutate("/api/disciplines", { contestId: activeContestId, name })} />
      <TopicDialog open={dialog === "topic"} busy={busy} topic={selectedTopic} onOpenChange={(open) => !open && setDialog(null)} onSubmit={(body) => selectedTopic ? mutate(`/api/topics/${selectedTopic.id}`, body, "PATCH") : mutate("/api/topics", { disciplineId: selectedDisciplineId, ...body })} />
      <SessionDialog open={dialog === "session"} busy={busy} disciplines={disciplines} topics={topics} topic={selectedTopic} session={selectedSession} onOpenChange={(open) => !open && setDialog(null)} onSubmit={(body) => selectedSession ? mutate(`/api/sessions/${selectedSession.id}`, body, "PATCH") : mutate("/api/sessions", body)} />

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => {
        if (!open) {
          setDeleteTarget(null);
          setDeleteConfirmation("");
        }
      }}>
        <AlertDialogContent className="rounded-[1.5rem]">
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteTarget?.type === "discipline" ? "Excluir disciplina?" : deleteTarget?.type === "topic" ? "Excluir subtópico?" : "Excluir registro de questões?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === "discipline"
                ? `A disciplina “${deleteTarget.label}” será apagada junto com todos os seus subtópicos e registros de questões. Essa ação não pode ser desfeita.`
                : deleteTarget?.type === "topic"
                ? `“${deleteTarget.label}” será removido. As sessões de questões já registradas serão preservadas, mas ficarão sem subtópico.`
                : `“${deleteTarget?.label}” será removido permanentemente das métricas.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteTarget?.type === "discipline" && (
            <div className="space-y-2">
              <Label htmlFor="discipline-delete-confirmation">Digite <strong>123</strong> para confirmar</Label>
              <Input
                id="discipline-delete-confirmation"
                inputMode="numeric"
                autoComplete="off"
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                placeholder="123"
                className="h-11 rounded-xl"
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={busy || (deleteTarget?.type === "discipline" && deleteConfirmation !== "123")} onClick={() => void removeItem()}>{busy ? "Excluindo…" : "Excluir"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${compact ? "" : "mb-10 px-2"}`}>
      <div className="grid size-11 place-items-center rounded-[0.9rem] border border-cyan-200/50 bg-gradient-to-br from-cyan-300 to-teal-400 text-[#06202c] shadow-[0_8px_24px_rgba(34,211,238,0.2)]"><Target className="size-5" strokeWidth={2.7} /></div>
      <div>
        <p className={`font-bold tracking-[-0.02em] ${compact ? "text-foreground" : "text-white"}`}>Rumo à Aprovação</p>
        {!compact && <p className="mt-0.5 text-xs text-slate-400">Seu plano de estudos</p>}
      </div>
    </div>
  );
}

function NavButton({ active, icon, onClick, children }: { active: boolean; icon: ReactNode; onClick: () => void; children: ReactNode }) {
  return (
    <button className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-xl px-3 py-3 text-sm ${active ? "bg-white/10 font-semibold text-white shadow-inner shadow-white/[0.03]" : "text-slate-300 hover:bg-white/[0.06] hover:text-white"} [&_svg]:size-[1.1rem]`} onClick={onClick}>
      {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-cyan-300" />}
      <span className={active ? "text-cyan-300" : "text-slate-400 group-hover:text-cyan-200"}>{icon}</span>{children}
    </button>
  );
}

type MetricTone = "cyan" | "blue" | "teal";

const metricToneStyles: Record<MetricTone, { icon: string; line: string }> = {
  cyan: { icon: "bg-cyan-50 text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-300", line: "from-cyan-400 to-cyan-500" },
  blue: { icon: "bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300", line: "from-blue-500 to-cyan-400" },
  teal: { icon: "bg-teal-50 text-teal-700 dark:bg-teal-400/10 dark:text-teal-300", line: "from-teal-400 to-cyan-400" },
};

function MetricCard({ icon, label, value, helper, tone }: { icon: ReactNode; label: string; value: string; helper: string; tone: MetricTone }) {
  const styles = metricToneStyles[tone];
  return (
    <article className="group relative overflow-hidden rounded-[1.35rem] border bg-card p-5 shadow-[0_12px_34px_rgba(15,36,58,0.06)] hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(15,36,58,0.1)]">
      <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${styles.line}`} />
      <div className="flex items-center justify-between gap-3">
        <span className={`grid size-11 shrink-0 place-items-center rounded-xl [&_svg]:size-5 ${styles.icon}`}>{icon}</span>
        <span className="rounded-full bg-muted/65 px-2.5 py-1 text-xs font-medium text-muted-foreground">{helper}</span>
      </div>
      <p className="mt-5 text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-bold tracking-[-0.04em] sm:text-[2rem]">{value}</p>
    </article>
  );
}

function EmptyState({ icon, title, text, action, onAction }: { icon: ReactNode; title: string; text: string; action: string; onAction: () => void }) {
  return (
    <div className="grid min-h-[420px] place-items-center rounded-[1.5rem] border border-dashed bg-card p-8 text-center shadow-[0_14px_40px_rgba(15,36,58,0.05)]">
      <div>
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-cyan-50 text-cyan-700 shadow-inner dark:bg-cyan-400/10 dark:text-cyan-300 [&_svg]:size-6">{icon}</span>
        <h2 className="mt-5 text-xl font-semibold tracking-tight">{title}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{text}</p>
        <Button className="mt-6 rounded-xl bg-[#0a9ba9] text-white shadow-[0_8px_20px_rgba(10,155,169,0.2)] hover:bg-[#078b98]" onClick={onAction}><Plus /> {action}</Button>
      </div>
    </div>
  );
}

function SmallEmpty({ text }: { text: string }) {
  return <p className="px-5 py-9 text-center text-sm text-muted-foreground">{text}</p>;
}

function ChartCard({ title, empty, children }: { title: string; empty: boolean; children: ReactNode }) {
  return (
    <article className="rounded-[1.5rem] border bg-card p-5 shadow-[0_14px_40px_rgba(15,36,58,0.07)] sm:p-6">
      <div className="flex items-center gap-2.5">
        <span className="h-5 w-1 rounded-full bg-cyan-500" />
        <h3 className="font-semibold">{title}</h3>
      </div>
      {empty ? <SmallEmpty text="Registre algumas sessões para visualizar este gráfico." /> : <div className="mt-4">{children}</div>}
    </article>
  );
}

function DialogShell({ open, onOpenChange, title, description, children, busy }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; children: ReactNode; busy: boolean }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[1.5rem] border bg-card shadow-[0_24px_70px_rgba(7,24,45,0.24)] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="tracking-tight">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        {busy && <div className="absolute inset-0 z-10 grid place-items-center rounded-[1.5rem] bg-card/80 backdrop-blur-sm"><Loader2 className="size-7 animate-spin text-cyan-600" /></div>}
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

function DisciplineDialog({ open, onOpenChange, onSubmit, busy, discipline }: { open: boolean; onOpenChange: (open: boolean) => void; onSubmit: (name: string) => void; busy: boolean; discipline: Discipline | null }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(String(new FormData(event.currentTarget).get("name") ?? ""));
  }
  return (
    <DialogShell open={open} onOpenChange={onOpenChange} title={discipline ? "Editar disciplina" : "Nova disciplina"} description={discipline ? "Atualize o nome desta disciplina." : "Crie uma disciplina do edital para organizar seus subtópicos."} busy={busy}>
      <form key={discipline?.id ?? "new-discipline"} onSubmit={submit} className="space-y-4">
        <Field label="Nome da disciplina" name="name" defaultValue={discipline?.name ?? ""} placeholder="Ex.: Engenharia de Software" required />
        <DialogFooter><Button type="submit" className="rounded-xl">{discipline ? "Salvar alterações" : "Adicionar disciplina"}</Button></DialogFooter>
      </form>
    </DialogShell>
  );
}

function TopicDialog({ open, onOpenChange, onSubmit, busy, topic }: { open: boolean; onOpenChange: (open: boolean) => void; onSubmit: (body: Record<string, unknown>) => void; busy: boolean; topic: Topic | null }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(Object.fromEntries(new FormData(event.currentTarget).entries()));
  }
  return (
    <DialogShell open={open} onOpenChange={onOpenChange} title={topic ? "Editar subtópico" : "Novo subtópico"} description={topic ? "Atualize o nome e as anotações deste item." : "Adicione um item do conteúdo e, se quiser, suas primeiras anotações."} busy={busy}>
      <form key={topic?.id ?? "new-topic"} onSubmit={submit} className="space-y-4">
        <Field label="Tópico ou subtópico" name="title" defaultValue={topic?.title ?? ""} placeholder="Ex.: Modelos de desenvolvimento de software" required />
        <div className="space-y-2"><Label htmlFor="topic-notes">Anotações</Label><Textarea id="topic-notes" name="notes" defaultValue={topic?.notes ?? ""} className="min-h-32" placeholder="Escreva sua explicação, resumo ou pontos importantes…" /></div>
        <DialogFooter><Button type="submit" className="rounded-xl">{topic ? "Salvar alterações" : "Adicionar subtópico"}</Button></DialogFooter>
      </form>
    </DialogShell>
  );
}

function SessionDialog({ open, onOpenChange, onSubmit, busy, disciplines, topics, topic, session }: { open: boolean; onOpenChange: (open: boolean) => void; onSubmit: (body: Record<string, unknown>) => void; busy: boolean; disciplines: Discipline[]; topics: Topic[]; topic: Topic | null; session: StudySession | null }) {
  const [disciplineId, setDisciplineId] = useState("");
  const [topicId, setTopicId] = useState("");

  useEffect(() => {
    if (!open) return;
    setDisciplineId(session?.disciplineId ?? topic?.disciplineId ?? "");
    setTopicId(session?.topicId ?? topic?.id ?? "");
  }, [open, session, topic]);

  const availableTopics = topics.filter((item) => item.disciplineId === disciplineId);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(Object.fromEntries(new FormData(event.currentTarget).entries()));
  }
  return (
    <DialogShell open={open} onOpenChange={onOpenChange} title={session ? "Editar questões" : "Registrar questões"} description="Vincule o resultado à disciplina e, quando desejar, a um subtópico específico." busy={busy}>
      <form key={session?.id ?? topic?.id ?? "new-session"} onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="session-discipline">Disciplina</Label>
          <NativeSelect id="session-discipline" name="disciplineId" className="w-full" value={disciplineId} onChange={(event) => { setDisciplineId(event.target.value); setTopicId(""); }} required>
            <NativeSelectOption value="">Selecione</NativeSelectOption>
            {disciplines.map((discipline) => <NativeSelectOption key={discipline.id} value={discipline.id}>{discipline.name}</NativeSelectOption>)}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="session-topic">Subtópico (opcional)</Label>
          <NativeSelect id="session-topic" name="topicId" className="w-full" value={topicId} onChange={(event) => setTopicId(event.target.value)} disabled={!disciplineId}>
            <NativeSelectOption value="">Sem subtópico</NativeSelectOption>
            {availableTopics.map((item) => <NativeSelectOption key={item.id} value={item.id}>{item.title}</NativeSelectOption>)}
          </NativeSelect>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Questões feitas" name="questions" type="number" min="1" defaultValue={session?.questions} required />
          <Field label="Acertos" name="correct" type="number" min="0" defaultValue={session?.correct} required />
        </div>
        <Field label="Data" name="sessionDate" type="date" defaultValue={session?.sessionDate ?? new Date().toISOString().slice(0, 10)} required />
        <div className="space-y-2"><Label htmlFor="session-notes">Observação (opcional)</Label><Textarea id="session-notes" name="notes" defaultValue={session?.notes ?? ""} placeholder="Ex.: Simulado da banca FCC" /></div>
        <DialogFooter><Button type="submit" className="rounded-xl">{session ? "Salvar alterações" : "Salvar resultado"}</Button></DialogFooter>
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

function examCountdown(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return "";
  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const examUtc = Date.UTC(year, month - 1, day);
  const days = Math.round((examUtc - todayUtc) / 86_400_000);
  if (days < 0) return "Prova realizada";
  if (days === 0) return "É hoje";
  if (days === 1) return "Falta 1 dia";
  return `Faltam ${days} dias`;
}
