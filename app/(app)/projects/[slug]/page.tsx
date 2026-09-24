import { Suspense } from "react";
import { notFound } from "next/navigation";

import { BoardSkeleton } from "@/components/board-skeleton";
import { ConfigNotice } from "@/components/config-notice";
import { KanbanBoard } from "@/components/kanban-board";
import { loadProjectBoard } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function ProjectBoard({ slug }: { slug: string }) {
  let result: Awaited<ReturnType<typeof loadProjectBoard>>;
  try {
    result = await loadProjectBoard(slug);
  } catch (error) {
    return (
      <ConfigNotice
        title="No se pudo abrir el tablero"
        detail={`Si faltan columnas nuevas, aplica supabase/migrations/002_v2_must_have.sql. Detalle: ${error instanceof Error ? error.message : "Error desconocido"}`}
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
      archivedCount={result.archivedCount}
    />
  );
}

export default async function ProjectPage({
  params,
}: PageProps<"/projects/[slug]">) {
  const { slug } = await params;

  if (!isSupabaseConfigured()) {
    return <ConfigNotice />;
  }

  return (
    <Suspense fallback={<BoardSkeleton />}>
      <ProjectBoard slug={slug} />
    </Suspense>
  );
}
