import { NextResponse } from "next/server";
import { saveProjectFile } from "@/server/projects";

export const runtime = "nodejs";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    if (typeof body.path !== "string" || typeof body.content !== "string") {
      return NextResponse.json({ error: "path and content are required" }, { status: 400 });
    }
    await saveProjectFile(id, body.path, body.content);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Save failed" }, { status: 400 });
  }
}
