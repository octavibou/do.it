import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { verifyBotBearer } from "@/lib/auth-token";
import { handleGetBotTasks, handlePostBotTask, parseJsonBody } from "@/lib/bot-api";
import { createBotProjectTask, getBot, listProjectTasks } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const result = await handleGetBotTasks({
    botId: id,
    searchParams: new URL(request.url).searchParams,
    bearerOk: verifyBotBearer(request.headers.get("authorization")),
    sessionOk: await getSession(),
    deps: { isSupabaseConfigured, getBot, listProjectTasks },
  });
  return NextResponse.json(result.body, { status: result.status });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const bearerOk = verifyBotBearer(request.headers.get("authorization"));
  const parsed = parseJsonBody(await request.text());
  if (!("ok" in parsed)) {
    return NextResponse.json(parsed.body, { status: parsed.status });
  }

  const result = await handlePostBotTask({
    botId: id,
    body: parsed.body,
    bearerOk,
    sessionOk: await getSession(),
    deps: { isSupabaseConfigured, getBot, createBotProjectTask },
  });
  return NextResponse.json(result.body, { status: result.status });
}
