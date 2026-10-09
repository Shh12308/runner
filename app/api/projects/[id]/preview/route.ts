import { NextResponse } from "next/server";
import { startProjectPreview } from "@/server/preview";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const mode = body.mode === "native" ? "native" : "browser";
    const framework = body.framework === "flutter" ? "flutter" : "react native";
    const result = await startProjectPreview(id, mode, framework);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Preview could not start" }, { status: 400 });
  }
}
