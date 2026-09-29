"use server";

import { requireSession } from "@/lib/auth";
import { testBotWebhook, updateBotWebhook } from "@/lib/data";
import { revalidateAfterWebhookChange } from "@/lib/revalidate";
import type { ActionResult } from "@/lib/types";

export async function updateBotWebhookAction(formData: FormData): Promise<ActionResult> {
  await requireSession();

  const botId = String(formData.get("botId") ?? "");
  const webhookUrl = String(formData.get("webhookUrl") ?? "");
  const webhookSecret = String(formData.get("webhookSecret") ?? "");
  const webhookHeaderName = String(formData.get("webhookHeaderName") ?? "");
  const clearSecret = String(formData.get("clearWebhookSecret") ?? "") === "1";
  if (!botId) {
    return { ok: false, error: "Falta el bot." };
  }

  try {
    await updateBotWebhook(botId, {
      webhookUrl,
      webhookSecret: webhookSecret || undefined,
      clearSecret,
      webhookHeaderName: webhookHeaderName || undefined,
    });
    revalidateAfterWebhookChange();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo guardar el webhook." };
  }
}

export async function testBotWebhookAction(botId: string): Promise<ActionResult> {
  await requireSession();

  if (!botId) {
    return { ok: false, error: "Falta el bot." };
  }

  try {
    const result = await testBotWebhook(botId);
    revalidateAfterWebhookChange();
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    return { ok: true, httpStatus: result.httpStatus };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "No se pudo probar el webhook.",
    };
  }
}
