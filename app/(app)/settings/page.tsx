import { Suspense } from "react";

import { CardsSkeleton } from "@/components/board-skeleton";
import { ConfigNotice } from "@/components/config-notice";
import { SettingsForm } from "@/components/settings-form";
import { listBots } from "@/lib/data";
import { logSettingsPage, measureAsync } from "@/lib/perf";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function loadSettings() {
  try {
    const loaded = await measureAsync("bots", () => listBots());
    logSettingsPage({
      botCount: loaded.value.length,
      queryCount: 1,
      timingsMs: { total: loaded.ms },
    });
    return { ok: true as const, bots: loaded.value };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Error desconocido",
    };
  }
}

async function SettingsFormLoader() {
  const result = await loadSettings();
  if (!result.ok) {
    return <ConfigNotice title="No se pudieron cargar los bots" detail={result.error} />;
  }

  return <SettingsForm bots={result.bots} />;
}

export default function SettingsPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="grid gap-4">
        <h1 className="text-2xl font-medium tracking-tight">Ajustes</h1>
        <ConfigNotice />
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Bots</p>
        <h1 className="text-2xl font-medium tracking-tight">Webhooks</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Cuando una tarea pasa a <strong>En curso</strong> y el asignado es un bot, do.it
          hace POST JSON a esta URL. Si falla, la tarea se queda en En curso y verás el
          error en la tarjeta.
        </p>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Las llamadas de bots a la API usan el secreto <code>BOT_API_TOKEN</code> en
          Vercel. No se muestra aquí.
        </p>
      </div>
      <Suspense fallback={<CardsSkeleton />}>
        <SettingsFormLoader />
      </Suspense>
    </div>
  );
}
