import { NextResponse } from "next/server";

import { sessionOkIfNeeded } from "@/lib/auth";
import { verifyBotBearer } from "@/lib/auth-token";
import { handleGetBotCurrent } from "@/lib/bot-api";
import { getBot, listDoingTasksForBot } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const bearerOk = verifyBotBearer(request.headers.get("authorization"));
  const result = await handleGetBotCurrent({
    botId: id,
    bearerOk,
    sessionOk: await sessionOkIfNeeded(bearerOk),
    deps: { isSupabaseConfigured, getBot, listDoingTasksForBot },
  });
  return NextResponse.json(result.body, { status: result.status });
}
