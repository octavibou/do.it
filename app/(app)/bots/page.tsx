import Link from "next/link";

import { AssigneeBadge } from "@/components/assignee-badge";
import { ConfigNotice } from "@/components/config-notice";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { listAllDoingBotTasks, listBots } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

async function loadBotsPage() {
  try {
    const [bots, doing] = await Promise.all([listBots(), listAllDoingBotTasks()]);
    return { ok: true as const, bots, doing };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Error desconocido",
    };
  }
}

export default async function BotsPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="grid gap-4">
        <h1 className="text-2xl font-medium tracking-tight">Bots</h1>
        <ConfigNotice />
      </div>
    );
  }

  const result = await loadBotsPage();
  if (!result.ok) {
    return (
      <div className="grid gap-4">
        <h1 className="text-2xl font-medium tracking-tight">Bots</h1>
        <ConfigNotice title="No se pudo leer el trabajo de los bots" detail={result.error} />
      </div>
    );
  }

  return <BotsWorkView bots={result.bots} doing={result.doing} />;
}

function BotsWorkView({
  bots,
  doing,
}: {
  bots: Awaited<ReturnType<typeof listBots>>;
  doing: Awaited<ReturnType<typeof listAllDoingBotTasks>>;
}) {
  return (
    <div className="grid gap-6">
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Trabajo</p>
        <h1 className="text-2xl font-medium tracking-tight">Qué hace cada bot</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tareas en curso asignadas a un bot. API: <code>GET /api/bots/:id/current</code>
        </p>
      </div>
      <div className="grid gap-3">
        {bots.map((bot) => {
          const tasks = doing.filter((task) => task.bot_id === bot.id);
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
    </div>
  );
}
