import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getBot, listDoingTasksForBot } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  const { id } = await context.params;
  const bot = await getBot(id);
  if (!bot) {
    return NextResponse.json({ error: "Bot not found" }, { status: 404 });
  }

  // Read-only: bots cannot change status through this endpoint.
  const tasks = await listDoingTasksForBot(id);

  return NextResponse.json({
    bot: {
      id: bot.id,
      name: bot.name,
      project_id: bot.project_id,
      project: {
        id: bot.project.id,
        slug: bot.project.slug,
        name: bot.project.name,
      },
    },
    tasks,
  });
}
