"use client";

import { toast } from "sonner";

import { updateBotWebhookAction } from "@/app/actions/bots";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Bot, Project } from "@/lib/types";

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
