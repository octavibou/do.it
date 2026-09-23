import { notFound } from "next/navigation";

import { ConfigNotice } from "@/components/config-notice";
import { KanbanBoard } from "@/components/kanban-board";
import { getProjectBySlug, listTasksForProject } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

async function loadBoard(slug: string) {
  try {
    const project = await getProjectBySlug(slug);
    if (!project) {
      return { ok: true as const, project: null, tasks: [] };
    }
    const tasks = await listTasksForProject(project.id);
    return { ok: true as const, project, tasks };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Error desconocido",
    };
  }
}

export default async function ProjectPage({
  params,
}: PageProps<"/projects/[slug]">) {
  const { slug } = await params;

  if (!isSupabaseConfigured()) {
    return <ConfigNotice />;
  }

  const result = await loadBoard(slug);
  if (!result.ok) {
    return (
      <ConfigNotice
        title="No se pudo abrir el tablero"
        detail={`Si faltan columnas nuevas, aplica supabase/migrations/002_v2_must_have.sql. Detalle: ${result.error}`}
      />
    );
  }
  if (!result.project) {
    notFound();
  }

  return (
    <KanbanBoard
      slug={result.project.slug}
      projectId={result.project.id}
      projectName={result.project.name}
      bots={result.project.bots}
      tasks={result.tasks}
    />
  );
}
