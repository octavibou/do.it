import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
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
  const result = await handleGetBotCurrent({
    botId: id,
    bearerOk: verifyBotBearer(request.headers.get("authorization")),
    sessionOk: await getSession(),
    deps: { isSupabaseConfigured, getBot, listDoingTasksForBot },
  });
  return NextResponse.json(result.body, { status: result.status });
}
