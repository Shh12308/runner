import { NextResponse } from "next/server";
import { createProject } from "@/server/projects";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name : "my-mobile-app";
    const files = Array.isArray(body.files) ? body.files : [];
    const project = await createProject(name, files);
    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create project" }, { status: 400 });
  }
}
