import Link from "next/link";

import { ConfigNotice } from "@/components/config-notice";
import { Badge } from "@/components/ui/badge";
import { listProjects } from "@/lib/data";
import { STATUS_LABELS } from "@/lib/labels";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { TaskStatus } from "@/lib/types";

async function loadCounts(projectIds: string[]) {
  if (projectIds.length === 0) {
    return {};
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("project_id, status, archived_at")
    .in("project_id", projectIds);

  if (error) {
    throw error;
  }

  const counts: Record<string, Record<TaskStatus, number>> = {};
  for (const row of data ?? []) {
    if (row.archived_at) {
      continue;
    }
    const projectId = row.project_id as string;
    const status = row.status as TaskStatus;
    counts[projectId] ??= { inbox: 0, doing: 0, review: 0, done: 0 };
    counts[projectId][status] += 1;
  }
  return counts;
}

async function loadPage() {
  try {
    const projects = await listProjects();
    const counts = await loadCounts(projects.map((project) => project.id));
    return { ok: true as const, projects, counts };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Error desconocido",
    };
  }
}

export default async function ProjectsPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="grid gap-4">
        <h1 className="text-2xl font-medium tracking-tight">Proyectos</h1>
        <ConfigNotice />
      </div>
    );
  }

  const result = await loadPage();
  if (!result.ok) {
    return (
      <div className="grid gap-4">
        <h1 className="text-2xl font-medium tracking-tight">Proyectos</h1>
        <ConfigNotice
          title="No se pudo leer Supabase"
          detail={`Aplica supabase/migrations/001_init.sql y 002_v2_must_have.sql. Detalle: ${result.error}`}
        />
      </div>
    );
  }

  return <ProjectGrid projects={result.projects} counts={result.counts} />;
}

function ProjectGrid({
  projects,
  counts,
}: {
  projects: Awaited<ReturnType<typeof listProjects>>;
  counts: Record<string, Record<TaskStatus, number>>;
}) {
  return (
    <div className="grid gap-6">
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Backlog</p>
        <h1 className="text-2xl font-medium tracking-tight">Proyectos</h1>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {projects.map((project) => {
          const bot = project.bots[0];
          const tally = counts[project.id] ?? { inbox: 0, doing: 0, review: 0, done: 0 };
          return (
            <Link
              key={project.id}
              href={`/projects/${project.slug}`}
              className="rounded-2xl bg-background p-4 ring-1 ring-foreground/10 transition hover:ring-foreground/30"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-medium">{project.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {bot ? `Bot ${bot.name}` : "Sin bot"}
                  </p>
                </div>
                <Badge variant="outline">{tally.doing} en curso</Badge>
              </div>
              <dl className="mt-4 grid grid-cols-4 gap-2 text-xs text-muted-foreground">
                {(Object.keys(STATUS_LABELS) as TaskStatus[]).map((status) => (
                  <div key={status}>
                    <dt>{STATUS_LABELS[status]}</dt>
                    <dd className="text-sm text-foreground">{tally[status]}</dd>
                  </div>
                ))}
              </dl>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
