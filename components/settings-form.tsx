"use client";

import { toast } from "sonner";

import { updateBotWebhookAction } from "@/app/actions/bots";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Bot, Project } from "@/lib/types";

function secretHint(bot: Bot) {
  if (bot.webhook_secret_last4) {
    return `Configurada · ···${bot.webhook_secret_last4}`;
  }
  return "Sin configurar";
}

export function SettingsForm({ bots }: { bots: (Bot & { project: Project })[] }) {
  async function onSubmit(formData: FormData) {
    const result = await updateBotWebhookAction(formData);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Webhook guardado");
  }

  return (
    <div className="grid gap-4">
      {bots.map((bot) => (
        <form
          key={bot.id}
          action={onSubmit}
          className="grid gap-3 rounded-2xl bg-background p-4 ring-1 ring-foreground/10"
        >
          <input type="hidden" name="botId" value={bot.id} />
          <div>
            <p className="font-medium">{bot.name}</p>
            <p className="text-sm text-muted-foreground">
              {bot.project.name} · <span className="font-mono text-xs">{bot.id}</span>
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`webhook-${bot.id}`}>URL de webhook</Label>
            <Input
              id={`webhook-${bot.id}`}
              name="webhookUrl"
              type="url"
              defaultValue={bot.webhook_url ?? ""}
              placeholder="https://…"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`secret-${bot.id}`}>Secreto (sender key)</Label>
            <p className="text-xs text-muted-foreground">{secretHint(bot)}</p>
            <Input
              id={`secret-${bot.id}`}
              name="webhookSecret"
              type="password"
              autoComplete="new-password"
              placeholder="Dejar vacío para no cambiar"
            />
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" name="clearWebhookSecret" value="1" />
              Quitar secreto
            </label>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`header-${bot.id}`}>Header del secreto</Label>
            <Input
              id={`header-${bot.id}`}
              name="webhookHeaderName"
              defaultValue={bot.webhook_header_name ?? "Authorization"}
              placeholder="Authorization"
            />
            <p className="text-xs text-muted-foreground">
              <code>Authorization</code> envía <code>Bearer &lt;secreto&gt;</code>. Otro nombre
              envía el secreto en crudo.
            </p>
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant="outline">
              Guardar
            </Button>
          </div>
        </form>
      ))}
    </div>
  );
}
