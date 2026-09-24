"use server";

import { requireSession } from "@/lib/auth";
import { updateBotWebhook } from "@/lib/data";
import { revalidateAfterWebhookChange } from "@/lib/revalidate";
import type { ActionResult } from "@/lib/types";

export async function updateBotWebhookAction(formData: FormData): Promise<ActionResult> {
  await requireSession();

  const botId = String(formData.get("botId") ?? "");
  const webhookUrl = String(formData.get("webhookUrl") ?? "");
  if (!botId) {
    return { ok: false, error: "Falta el bot." };
  }

  try {
    await updateBotWebhook(botId, webhookUrl);
    revalidateAfterWebhookChange();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo guardar el webhook." };
  }
}
