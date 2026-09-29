"use client";

import { toast } from "sonner";

import { testBotWebhookAction } from "@/app/actions/bots";
import { Button } from "@/components/ui/button";
import type { Bot } from "@/lib/types";

export function formatWebhookDelivery(bot: Bot): string {
  if (!bot.last_webhook_at && !bot.last_webhook_event) {
    return "Sin envíos todavía";
  }

  const when = bot.last_webhook_at ?? "sin fecha";
  const event = bot.last_webhook_event ?? "evento";
  const task = bot.last_webhook_task_id ? ` · tarea ${bot.last_webhook_task_id.slice(0, 8)}` : "";
  if (bot.last_webhook_error) {
    return `${when} · ${event}${task} · ${bot.last_webhook_error}`;
  }
  const status = bot.last_webhook_status != null ? `HTTP ${bot.last_webhook_status}` : "ok";
  return `${when} · ${event}${task} · ${status}`;
}

export function BotWebhookPanel({ bot }: { bot: Bot }) {
  async function onTest() {
    const result = await testBotWebhookAction(bot.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      result.httpStatus != null ? `Webhook OK (HTTP ${result.httpStatus})` : "Webhook OK"
    );
  }

  const secretLabel = bot.webhook_secret_last4
    ? `Secreto configurada · ···${bot.webhook_secret_last4}`
    : "Secreto sin configurar";

  return (
    <div className="mt-4 grid gap-2 rounded-xl bg-muted/50 px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Webhook</p>
          <p className="mt-1 text-sm">{secretLabel}</p>
          <p className="mt-1 text-sm text-muted-foreground">{formatWebhookDelivery(bot)}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onTest}>
          Probar webhook
        </Button>
      </div>
    </div>
  );
}
