import { Suspense } from "react";
import Link from "next/link";

import { AssigneeBadge } from "@/components/assignee-badge";
import { CardsSkeleton } from "@/components/board-skeleton";
import { ConfigNotice } from "@/components/config-notice";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { listBots, listDoingBotWork, type DoingBotWork } from "@/lib/data";
import { logBotsPage, measureAsync } from "@/lib/perf";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function loadBotsPage() {
  try {
    const total = await measureAsync("total", async () => {
      const [bots, doing] = await Promise.all([listBots(), listDoingBotWork()]);
      return { bots, doing };
    });
    logBotsPage({
      botCount: total.value.bots.length,
      doingCount: total.value.doing.length,
      queryCount: 2,
      timingsMs: { total: total.ms },
    });
    return { ok: true as const, ...total.value };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Error desconocido",
    };
  }
}

async function BotsWorkLoader() {
  const result = await loadBotsPage();
  if (!result.ok) {
    return <ConfigNotice title="No se pudo leer el trabajo de los bots" detail={result.error} />;
  }

  return <BotsWorkView bots={result.bots} doing={result.doing} />;
}

export default function BotsPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="grid gap-4">
        <h1 className="text-2xl font-medium tracking-tight">Bots</h1>
        <ConfigNotice />
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Trabajo</p>
        <h1 className="text-2xl font-medium tracking-tight">Qué hace cada bot</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tareas en curso asignadas a un bot. API: <code>GET /api/bots/:id/current</code>
        </p>
      </div>
      <Suspense fallback={<CardsSkeleton />}>
        <BotsWorkLoader />
      </Suspense>
    </div>
  );
}

function BotsWorkView({
  bots,
  doing,
}: {
  bots: Awaited<ReturnType<typeof listBots>>;
  doing: DoingBotWork[];
}) {
  const byBot = new Map<string, DoingBotWork[]>();
  for (const task of doing) {
    if (!task.bot_id) {
      continue;
    }
    const list = byBot.get(task.bot_id);
    if (list) {
      list.push(task);
    } else {
      byBot.set(task.bot_id, [task]);
    }
  }

  return (
    <div className="grid gap-3">
      {bots.map((bot) => {
        const tasks = byBot.get(bot.id) ?? [];
        return (
          <section
            key={bot.id}
            className="rounded-2xl bg-background p-4 ring-1 ring-foreground/10"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-medium">{bot.name}</h2>
                <p className="text-sm text-muted-foreground">{bot.project.name}</p>
              </div>
              <Link
                href={`/projects/${bot.project.slug}`}
                prefetch
                className="text-sm underline-offset-4 hover:underline"
              >
                Abrir tablero
              </Link>
            </div>
            {tasks.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">Nada en curso.</p>
            ) : (
              <ul className="mt-4 grid gap-2">
                {tasks.map((task) => (
                  <li
                    key={task.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/60 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium">{task.title}</p>
                      {task.webhook_error ? (
                        <Alert variant="destructive" className="mt-2">
                          <AlertDescription>{task.webhook_error}</AlertDescription>
                        </Alert>
                      ) : null}
                    </div>
                    <AssigneeBadge type="bot" botName={bot.name} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
