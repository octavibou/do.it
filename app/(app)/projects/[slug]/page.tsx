import { notFound } from "next/navigation";

import { KanbanBoard } from "@/components/kanban-board";
import { ConfigNotice } from "@/components/config-notice";
import { getProjectBySlug, listTasksForProject } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

export default async function ProjectPage({
  params,
}: PageProps<"/projects/[slug]">) {
  const { slug } = await params;

  if (!isSupabaseConfigured()) {
    return <ConfigNotice />;
  }

  try {
    const project = await getProjectBySlug(slug);
    if (!project) {
      notFound();
    }

    const tasks = await listTasksForProject(project.id);

    return (
      <KanbanBoard
        slug={project.slug}
        projectId={project.id}
        projectName={project.name}
        bots={project.bots}
        tasks={tasks}
      />
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return (
      <ConfigNotice
        title="No se pudo abrir el tablero"
        detail={message}
      />
    );
  }
}
