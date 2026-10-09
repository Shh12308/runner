import { NextResponse } from "next/server";
import { importProjectZip } from "@/server/projects";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Missing ZIP file" }, { status: 400 });
    if (!file.name.toLowerCase().endsWith(".zip")) return NextResponse.json({ error: "Please upload a .zip archive" }, { status: 400 });
    if (file.size > 100 * 1024 * 1024) return NextResponse.json({ error: "ZIP must be smaller than 100 MB" }, { status: 413 });
    const buffer = Buffer.from(await file.arrayBuffer());
    const project = await importProjectZip(file.name, buffer);
    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Import failed" }, { status: 400 });
  }
}
