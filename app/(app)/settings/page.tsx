import { ConfigNotice } from "@/components/config-notice";
import { SettingsForm } from "@/components/settings-form";
import { listBots } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

async function loadSettings() {
  try {
    const bots = await listBots();
    return { ok: true as const, bots };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Error desconocido",
    };
  }
}

export default async function SettingsPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="grid gap-4">
        <h1 className="text-2xl font-medium tracking-tight">Ajustes</h1>
        <ConfigNotice />
      </div>
    );
  }

  const result = await loadSettings();
  if (!result.ok) {
    return (
      <div className="grid gap-4">
        <h1 className="text-2xl font-medium tracking-tight">Ajustes</h1>
        <ConfigNotice title="No se pudieron cargar los bots" detail={result.error} />
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
      </div>
      <SettingsForm bots={result.bots} />
    </div>
  );
}
