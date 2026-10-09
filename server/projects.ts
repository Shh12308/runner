import "server-only";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import { spawn } from "node:child_process";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";

const execFileAsync = promisify(execFile);
const ROOT = path.join(process.cwd(), "projects");
const META = ".mobile-ide-project.json";
const MAX_TEXT_FILE = 2 * 1024 * 1024;
const MAX_FILES = 15000;

export type ProjectFile = { path: string; content: string };
export type ProjectInfo = { id: string; name: string; framework: string; files: ProjectFile[] };

function cleanName(value: string) {
  const name = path.basename(value, path.extname(value)).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
  return name || "mobile-project";
}
function safeRelative(input: string) {
  const normalized = input.replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = normalized.split("/");
  if (!normalized || parts.some((p) => p === ".." || p === "." || p === "") || normalized.includes("\0")) {
    throw new Error(`Unsafe project path: ${input}`);
  }
  return normalized;
}
function frameworkFromPaths(paths: string[]) {
  if (paths.some((p) => p.endsWith("pubspec.yaml"))) return "flutter";
  if (paths.some((p) => /(^|\/)(package.json|app.json|app.config.js|app.config.ts)$/.test(p))) return "react_native";
  return "unknown";
}
async function ensureRoot() { await fs.mkdir(ROOT, { recursive: true }); }
async function writeMeta(dir: string, info: Omit<ProjectInfo, "files">) {
  await fs.writeFile(path.join(dir, META), JSON.stringify(info, null, 2), "utf8");
}
async function readMeta(dir: string): Promise<Omit<ProjectInfo, "files">> {
  const value = JSON.parse(await fs.readFile(path.join(dir, META), "utf8"));
  if (!value.id || !value.name) throw new Error("Invalid project metadata");
  return value;
}
async function collectTextFiles(dir: string): Promise<ProjectFile[]> {
  const out: ProjectFile[] = [];
  const skip = new Set(["node_modules", ".git", ".dart_tool", "build", ".next", ".gradle", "Pods", "DerivedData"]);
  async function walk(current: string, rel: string) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      if (entry.name === META || skip.has(entry.name)) continue;
      const full = path.join(current, entry.name);
      const relative = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) { await walk(full, relative); continue; }
      if (!entry.isFile()) continue;
      if (out.length >= MAX_FILES) throw new Error(`Project contains more than ${MAX_FILES} files`);
      const stat = await fs.stat(full);
      if (stat.size > MAX_TEXT_FILE) continue;
      const buffer = await fs.readFile(full);
      if (buffer.includes(0)) continue;
      const content = buffer.toString("utf8");
      if (content.includes("\uFFFD")) continue;
      out.push({ path: relative, content });
    }
  }
  await walk(dir, "");
  return out.sort((a, b) => a.path.localeCompare(b.path));
}
export async function createProject(name: string, files: ProjectFile[]) {
  await ensureRoot();
  if (!Array.isArray(files) || files.length > MAX_FILES) throw new Error("Invalid file list");
  const id = crypto.randomUUID();
  const safeName = cleanName(name);
  const dir = path.join(ROOT, `${safeName}-${id.slice(0, 8)}`);
  await fs.mkdir(dir, { recursive: true });
  const normalized: ProjectFile[] = [];
  try {
    for (const file of files) {
      if (!file || typeof file.path !== "string" || typeof file.content !== "string") continue;
      const rel = safeRelative(file.path);
      if (Buffer.byteLength(file.content, "utf8") > MAX_TEXT_FILE) continue;
      const full = path.resolve(dir, rel);
      if (!full.startsWith(dir + path.sep)) throw new Error("Unsafe path");
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, file.content, "utf8");
      normalized.push({ path: rel, content: file.content });
    }
    const info = { id, name: safeName, framework: frameworkFromPaths(normalized.map(f => f.path)), directory: path.basename(dir) };
    await writeMeta(dir, info);
    return { ...info, files: normalized };
  } catch (error) {
    await fs.rm(dir, { recursive: true, force: true });
    throw error;
  }
}
export async function getProject(id: string) {
  await ensureRoot();
  const dirs = await fs.readdir(ROOT, { withFileTypes: true });
  for (const entry of dirs) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(ROOT, entry.name);
    try {
      const info = await readMeta(dir);
      if (info.id === id) return { dir, info };
    } catch {}
  }
  throw new Error("Project not found");
}
export async function saveProjectFile(id: string, filePath: string, content: string) {
  if (Buffer.byteLength(content, "utf8") > MAX_TEXT_FILE) throw new Error("File is too large");
  const { dir } = await getProject(id);
  const rel = safeRelative(filePath);
  const full = path.resolve(dir, rel);
  if (!full.startsWith(dir + path.sep)) throw new Error("Unsafe path");
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, "utf8");
}
export async function importProjectZip(filename: string, zipBuffer: Buffer) {
  await ensureRoot();
  const id = crypto.randomUUID();
  const safeName = cleanName(filename);
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "mobile-ide-"));
  const dest = path.join(ROOT, `${safeName}-${id.slice(0, 8)}`);
  try {
    const zipPath = path.join(temp, "upload.zip");
    await fs.writeFile(zipPath, zipBuffer);
    // Use system unzip only after listing entries and rejecting traversal/symlink entries.
    const { stdout: listing } = await execFileAsync("unzip", ["-Z", "-1", zipPath], { maxBuffer: 5 * 1024 * 1024 });
    const entries = listing.split(/\r?\n/).filter(Boolean);
    if (entries.length > MAX_FILES) throw new Error(`ZIP has too many entries (maximum ${MAX_FILES})`);
    for (const entry of entries) {
      const normalized = entry.replace(/\\/g, "/");
      if (normalized.startsWith("/") || normalized.split("/").some(p => p === "..") || normalized.includes("\0")) {
        throw new Error("ZIP contains an unsafe path");
      }
    }
    await fs.mkdir(dest, { recursive: true });
    await execFileAsync("unzip", ["-q", zipPath, "-d", dest], { maxBuffer: 2 * 1024 * 1024 });
    // Handle archives containing a single top-level folder.
    let sourceDir = dest;
    const top = await fs.readdir(dest, { withFileTypes: true });
    if (top.length === 1 && top[0].isDirectory()) sourceDir = path.join(dest, top[0].name);
    const files = await collectTextFiles(sourceDir);
    if (!files.length) throw new Error("No readable text files found in the ZIP");
    const framework = frameworkFromPaths(files.map(f => f.path));
    if (sourceDir !== dest) {
      const staged = path.join(ROOT, `${safeName}-${id.slice(0, 8)}-staged`);
      await fs.rename(sourceDir, staged);
      await fs.rm(dest, { recursive: true, force: true });
      await fs.rename(staged, dest);
    }
    const info = { id, name: safeName, framework, directory: path.basename(dest) };
    await writeMeta(dest, info);
    return { ...info, files };
  } catch (error) {
    await fs.rm(dest, { recursive: true, force: true });
    throw error;
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}
export async function exportProjectZip(id: string) {
  const { dir } = await getProject(id);
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "mobile-ide-export-"));
  const output = path.join(tmp, "project.zip");
  try {
    await execFileAsync("zip", ["-qr", output, "."], { cwd: dir, maxBuffer: 2 * 1024 * 1024 });
    return await fs.readFile(output);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}
export async function getProjectDirectory(id: string) {
  return (await getProject(id)).dir;
}
export async function getProjectSummary(id: string) {
  const { dir, info } = await getProject(id);
  return { ...info, dir };
}
