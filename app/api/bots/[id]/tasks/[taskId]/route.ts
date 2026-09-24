import { NextResponse } from "next/server";

import { sessionOkIfNeeded } from "@/lib/auth";
import { verifyBotBearer } from "@/lib/auth-token";
import { handleGetBotTask, handlePatchBotTask, parseJsonBody } from "@/lib/bot-api";
import { getBot, getTask, updateBotProjectTask } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id, taskId } = await context.params;
  const bearerOk = verifyBotBearer(request.headers.get("authorization"));
  const result = await handleGetBotTask({
    botId: id,
    taskId,
    bearerOk,
    sessionOk: await sessionOkIfNeeded(bearerOk),
    deps: { isSupabaseConfigured, getBot, getTask },
  });
  return NextResponse.json(result.body, { status: result.status });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id, taskId } = await context.params;
  const bearerOk = verifyBotBearer(request.headers.get("authorization"));
  const parsed = parseJsonBody(await request.text());
  if (!("ok" in parsed)) {
    return NextResponse.json(parsed.body, { status: parsed.status });
  }

  const result = await handlePatchBotTask({
    botId: id,
    taskId,
    body: parsed.body,
    bearerOk,
    sessionOk: await sessionOkIfNeeded(bearerOk),
    deps: { isSupabaseConfigured, getBot, getTask, updateBotProjectTask },
  });
  return NextResponse.json(result.body, { status: result.status });
}
