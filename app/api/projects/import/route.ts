
import { NextResponse } from "next/server";
import { importProjectZip } from "@/server/projects";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'Missing upload. Expected form field "file".' },
        { status: 400 }
      );
    }

    if (!file.name.toLowerCase().endsWith(".zip")) {
      return NextResponse.json(
        { error: "Please upload a ZIP archive." },
        { status: 400 }
      );
    }

    const maxSize = 100 * 1024 * 1024;

    if (file.size === 0) {
      return NextResponse.json(
        { error: "The uploaded ZIP is empty." },
        { status: 400 }
      );
    }

    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "ZIP must be smaller than 100 MB." },
        { status: 413 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const project = await importProjectZip(file.name, buffer);

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown import error";

    console.error("[project-import]", error);

    return NextResponse.json(
      { error: `Import failed: ${message}` },
      { status: 500 }
    );
  }
}
