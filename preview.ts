import "server-only";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import { getProjectSummary } from "./projects";

const running = new Map<string, { pid: number | undefined; port: number; command: string }>();

function commandExists(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("sh", ["-lc", `command -v ${command}`], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
}
function wait(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }

export async function startProjectPreview(id: string, mode: string, framework: string) {
  const project = await getProjectSummary(id);
  if (mode === "native") {
    const hint = framework === "flutter"
      ? "Run `flutter pub get` then `flutter run -d <device>` in the project folder."
      : "Run `npm install` then `npx expo start` or `npx react-native run-android` in the project folder.";
    return {
      status: "native tooling required",
      url: "",
      logs: [
        "Native preview requires locally installed framework tooling and a connected emulator/device.",
        `Project folder: ${project.dir}`,
        hint,
        "This starter does not yet stream an emulator into the browser."
      ]
    };
  }

  if (framework === "flutter") {
    if (!(await commandExists("flutter"))) throw new Error("Flutter SDK not found on PATH. Install Flutter to enable Flutter Web preview.");
    const pubspec = path.join(project.dir, "pubspec.yaml");
    try { await fs.access(pubspec); } catch { throw new Error("This project does not contain pubspec.yaml."); }
    const result = await runCommand("flutter", ["pub", "get"], project.dir, 120000);
    if (result.code !== 0) throw new Error(`flutter pub get failed:\n${result.output}`);
    const build = await runCommand("flutter", ["build", "web"], project.dir, 180000);
    if (build.code !== 0) throw new Error(`flutter build web failed:\n${build.output}`);
    return {
      status: "build complete",
      url: "",
      logs: [build.output, `Web output created at ${path.join(project.dir, "build", "web")}.`, "A static preview server is the next runtime step for this project."]
    };
  }

  const pkgPath = path.join(project.dir, "package.json");
  let pkg: any;
  try { pkg = JSON.parse(await fs.readFile(pkgPath, "utf8")); } catch { throw new Error("No valid package.json found in the project."); }
  const hasWeb = Boolean(pkg.dependencies?.["react-native-web"] || pkg.devDependencies?.["react-native-web"] || pkg.dependencies?.expo || pkg.devDependencies?.expo);
  if (!hasWeb) throw new Error("This React Native project does not appear browser-compatible. Use an Expo/web-enabled project or choose Native preview.");
  const npm = await commandExists("npm");
  if (!npm) throw new Error("npm was not found on PATH.");
  const port = await getFreePort();
  const command = pkg.dependencies?.expo || pkg.devDependencies?.expo ? "npx" : "npm";
  const args = command === "npx" ? ["expo", "start", "--web", "--port", String(port)] : ["run", "web", "--", "--port", String(port)];
  const child = spawn(command, args, { cwd: project.dir, env: { ...process.env, PORT: String(port), BROWSER: "none" }, stdio: "ignore", detached: true });
  child.unref();
  running.set(id, { pid: child.pid, port, command });
  await wait(1200);
  return {
    status: "starting",
    url: `http://localhost:${port}`,
    logs: [`Started ${command} ${args.join(" ")}.`, `Project: ${project.dir}`, "If the preview does not load, check whether dependencies are installed and whether the project's web script is configured."]
  };
}
function runCommand(command: string, args: string[], cwd: string, timeout: number) {
  return new Promise<{ code: number | null; output: string }>((resolve) => {
    const child = spawn(command, args, { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const timer = setTimeout(() => { child.kill("SIGTERM"); output += "\nCommand timed out."; }, timeout);
    child.stdout.on("data", d => output += d.toString());
    child.stderr.on("data", d => output += d.toString());
    child.on("error", err => { clearTimeout(timer); resolve({ code: 1, output: `${output}\n${err.message}` }); });
    child.on("close", code => { clearTimeout(timer); resolve({ code, output }); });
  });
}
async function getFreePort(): Promise<number> {
  const net = await import("node:net");
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(err => err ? reject(err) : resolve(port));
    });
  });
}
