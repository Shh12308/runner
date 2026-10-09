"use client";

import Editor from "@monaco-editor/react";
import {
  Activity, ChevronDown, ChevronRight, Code2, Command, FileCode2, FileJson,
  FilePlus2, Folder, FolderOpen, FolderPlus, Monitor, MoreHorizontal,
  Play, Plus, RefreshCw, Search, Smartphone, SquareTerminal, Upload,
  X, Download, Save, PanelLeftClose, Terminal, CircleHelp
} from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useState } from "react";

type ProjectFile = { path: string; content: string };
type FileNode = { name: string; path: string; children?: FileNode[] };

const starterFiles: ProjectFile[] = [
  {
    path: "App.tsx",
    content: `import React from 'react';\nimport { SafeAreaView, Text, View, StyleSheet } from 'react-native';\n\nexport default function App() {\n  return (\n    <SafeAreaView style={styles.container}>\n      <View style={styles.card}>\n        <Text style={styles.eyebrow}>YOUR MOBILE WORKSPACE</Text>\n        <Text style={styles.title}>Hello, world.</Text>\n        <Text style={styles.body}>Edit this file and start building your app.</Text>\n      </View>\n    </SafeAreaView>\n  );\n}\n\nconst styles = StyleSheet.create({\n  container: { flex: 1, backgroundColor: '#f4f6fb', justifyContent: 'center', padding: 24 },\n  card: { backgroundColor: 'white', borderRadius: 24, padding: 24, gap: 12 },\n  eyebrow: { color: '#6366f1', fontSize: 11, fontWeight: '700', letterSpacing: 1.4 },\n  title: { color: '#172033', fontSize: 30, fontWeight: '800' },\n  body: { color: '#657087', fontSize: 15, lineHeight: 22 }\n});`
  },
  { path: "package.json", content: `{\n  "name": "my-mobile-app",\n  "version": "1.0.0",\n  "private": true,\n  "scripts": {\n    "start": "expo start",\n    "web": "expo start --web",\n    "android": "expo run:android"\n  },\n  "dependencies": {\n    "expo": "~52.0.0",\n    "react": "18.3.1",\n    "react-native": "0.76.5"\n  }\n}` },
  { path: "README.md", content: "# My mobile app\n\nA starter React Native / Expo project.\n\n## Commands\n\n- `npm install`\n- `npm run web` for browser preview (requires compatible web dependencies)\n- `npm start` for the Expo development server\n- `npm run android` for a local Android build (requires Android tooling)\n" }
];

function buildTree(files: ProjectFile[]): FileNode[] {
  const root: FileNode[] = [];
  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let current = root;
    let path = "";
    parts.forEach((part, index) => {
      path = path ? `${path}/${part}` : part;
      let node = current.find((n) => n.name === part);
      if (!node) {
        node = { name: part, path, ...(index < parts.length - 1 ? { children: [] } : {}) };
        current.push(node);
      }
      if (index < parts.length - 1) current = node.children!;
    });
  }
  const sort = (nodes: FileNode[]) => {
    nodes.sort((a, b) => Number(!!b.children) - Number(!!a.children) || a.name.localeCompare(b.name));
    nodes.forEach((n) => n.children && sort(n.children));
  };
  sort(root);
  return root;
}

function languageFor(path: string) {
  const ext = path.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    json: "json", dart: "dart", md: "markdown", yaml: "yaml", yml: "yaml",
    xml: "xml", gradle: "groovy", kt: "kotlin", swift: "swift", css: "css"
  };
  return map[ext || ""] || "plaintext";
}

function IconForFile({ name }: { name: string }) {
  if (name.endsWith(".json")) return <FileJson size={15} className="file-icon json" />;
  if (/\.(tsx?|jsx?|dart)$/.test(name)) return <FileCode2 size={15} className="file-icon code" />;
  return <FileCode2 size={15} className="file-icon" />;
}

export default function Home() {
  const [files, setFiles] = useState<ProjectFile[]>(starterFiles);
  const [activePath, setActivePath] = useState("App.tsx");
  const [openTabs, setOpenTabs] = useState<string[]>(["App.tsx", "package.json"]);
  const [expanded, setExpanded] = useState<string[]>([""]);
  const [projectName, setProjectName] = useState("my-mobile-app");
  const [framework, setFramework] = useState<"React Native" | "Flutter">("React Native");
  const [previewMode, setPreviewMode] = useState<"Browser" | "Native">("Browser");
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [terminalLines, setTerminalLines] = useState<string[]>([
    "Mobile IDE local workspace ready.",
    "Upload a project ZIP or edit the starter files.",
    "Browser preview requires a compatible web project."
  ]);
  const [query, setQuery] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewStatus, setPreviewStatus] = useState("Preview not started");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverBacked, setServerBacked] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);

  const activeFile = files.find((f) => f.path === activePath);
  const tree = useMemo(() => buildTree(files), [files]);

  useEffect(() => {
    fetch("/api/health").then((r) => r.ok && setServerBacked(true)).catch(() => setServerBacked(false));
  }, []);

  async function createProjectFromFiles(nextFiles: ProjectFile[], name: string) {
    const response = await fetch("/api/projects", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, files: nextFiles })
    });
    if (!response.ok) throw new Error((await response.json()).error || "Could not save project");
    const data = await response.json();
    setProjectId(data.id);
    setFiles(nextFiles);
    setProjectName(data.name);
    setActivePath(nextFiles[0]?.path || "");
    setOpenTabs(nextFiles[0] ? [nextFiles[0].path] : []);
    setDirty(false);
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setTerminalLines((l) => [...l, "Upload a .zip archive of your project."]);
      return;
    }
    setBusy(true);
    setTerminalLines((l) => [...l, `Importing ${file.name}...`]);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/projects/import", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Import failed");
      setProjectId(data.id);
      setProjectName(data.name);
      setFiles(data.files);
      setActivePath(data.files[0]?.path || "");
      setOpenTabs(data.files[0] ? [data.files[0].path] : []);
      setFramework(data.framework === "flutter" ? "Flutter" : "React Native");
      setDirty(false);
      setTerminalLines((l) => [...l, `Imported ${data.name} (${data.files.length} text files).`, "Project files are saved in ./projects."]);
    } catch (error) {
      setTerminalLines((l) => [...l, `Import error: ${error instanceof Error ? error.message : String(error)}`]);
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  async function saveActiveFile() {
    if (!activeFile) return;
    try {
      if (projectId) {
        const response = await fetch(`/api/projects/${projectId}/files`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: activePath, content: activeFile.content })
        });
        if (!response.ok) throw new Error((await response.json()).error || "Save failed");
      } else {
        const response = await fetch("/api/projects", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: projectName, files })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Save failed");
        setProjectId(data.id);
      }
      setDirty(false);
      setTerminalLines((l) => [...l, `Saved ${activePath}`]);
    } catch (error) {
      setTerminalLines((l) => [...l, `Save error: ${error instanceof Error ? error.message : String(error)}`]);
    }
  }

  async function runPreview() {
    if (!projectId) {
      setTerminalLines((l) => [...l, "Save or import the project before starting preview."]);
      return;
    }
    setBusy(true);
    setPreviewStatus("Starting...");
    setTerminalLines((l) => [...l, `Starting ${previewMode.toLowerCase()} preview...`]);
    try {
      const response = await fetch(`/api/projects/${projectId}/preview`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: previewMode.toLowerCase(), framework: framework.toLowerCase() })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Preview failed");
      setPreviewUrl(data.url || "");
      setPreviewStatus(data.status || "Started");
      setTerminalLines((l) => [...l, ...(data.logs || [])]);
      if (data.url) setTerminalLines((l) => [...l, `Preview URL: ${data.url}`]);
    } catch (error) {
      setPreviewStatus("Not running");
      setTerminalLines((l) => [...l, `Preview error: ${error instanceof Error ? error.message : String(error)}`]);
    } finally {
      setBusy(false);
    }
  }

  async function exportProject() {
    if (!projectId) {
      const blob = new Blob([JSON.stringify({ name: projectName, files }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `${projectName || "project"}.json`; a.click();
      URL.revokeObjectURL(url);
      return;
    }
    window.location.href = `/api/projects/${projectId}/export`;
  }

  function updateEditor(value?: string) {
    if (!activePath) return;
    setFiles((old) => old.map((f) => f.path === activePath ? { ...f, content: value || "" } : f));
    setDirty(true);
  }

  function addFile() {
    const path = window.prompt("New file path (for example src/screens/Home.tsx)");
    if (!path) return;
    if (files.some((f) => f.path === path)) return;
    setFiles((old) => [...old, { path, content: "" }]);
    setActivePath(path);
    setOpenTabs((old) => [...old, path]);
    setDirty(true);
  }

  function openFile(path: string) {
    if (files.some((f) => f.path === path)) {
      setActivePath(path);
      setOpenTabs((old) => old.includes(path) ? old : [...old, path]);
    }
  }

  function renderTree(nodes: FileNode[], depth = 0): React.ReactNode {
    return nodes.map((node) => {
      const isExpanded = expanded.includes(node.path);
      const isFolder = !!node.children;
      if (query && !node.path.toLowerCase().includes(query.toLowerCase()) && !node.children?.some((c) => c.path.toLowerCase().includes(query.toLowerCase()))) return null;
      return (
        <div key={node.path}>
          <button
            className={`tree-row ${activePath === node.path ? "selected" : ""}`}
            style={{ paddingLeft: 10 + depth * 14 }}
            onClick={() => isFolder ? setExpanded((old) => isExpanded ? old.filter((p) => p !== node.path) : [...old, node.path]) : openFile(node.path)}
          >
            {isFolder ? (isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <span className="tree-spacer" />}
            {isFolder ? (isExpanded ? <FolderOpen size={15} className="folder-icon" /> : <Folder size={15} className="folder-icon" />) : <IconForFile name={node.name} />}
            <span>{node.name}</span>
          </button>
          {isFolder && isExpanded && renderTree(node.children!, depth + 1)}
        </div>
      );
    });
  }

  return (
    <main className="ide-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><Code2 size={19} /></div><span>mobile<span className="brand-muted">studio</span></span><span className="local-pill"><span className="green-dot" />LOCAL</span></div>
        <div className="top-project"><Folder size={15} /><span>{projectName}</span><ChevronDown size={14} /></div>
        <div className="top-actions">
          <span className="save-state">{dirty ? "Unsaved changes" : "All changes saved"}</span>
          <button className="icon-button" title="Save file" onClick={saveActiveFile}><Save size={16} /></button>
          <button className="secondary-button" onClick={exportProject}><Download size={15} /> Export</button>
          <button className="run-button" onClick={runPreview} disabled={busy}><Play size={15} fill="currentColor" /> {busy ? "Working…" : "Run preview"}</button>
        </div>
      </header>

      <div className="workspace">
        <aside className="activitybar">
          <button className="activity active" title="Explorer"><FolderOpen size={20} /></button>
          <button className="activity" title="Search"><Search size={20} /></button>
          <button className="activity" title="Extensions"><Command size={20} /></button>
          <div className="activity-spacer" />
          <button className="activity" title="Help"><CircleHelp size={19} /></button>
        </aside>

        <aside className="sidebar">
          <div className="sidebar-heading"><span>EXPLORER</span><div className="heading-actions"><button title="New file" onClick={addFile}><FilePlus2 size={15} /></button><button title="Upload project"><label className="upload-label"><Upload size={15} /><input type="file" accept=".zip" onChange={handleUpload} /></label></button><button title="More"><MoreHorizontal size={16} /></button></div></div>
          <div className="project-root"><ChevronDown size={14} /><strong>{projectName.toUpperCase()}</strong></div>
          <div className="file-search"><Search size={14} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a file..." /></div>
          <div className="tree">{renderTree(tree)}</div>
          <div className="sidebar-bottom"><span className="green-dot" /> Local workspace <span className="sidebar-version">v1</span></div>
        </aside>

        <section className="editor-area">
          <div className="tabs">
            {openTabs.map((path) => <button key={path} className={`tab ${activePath === path ? "active" : ""}`} onClick={() => setActivePath(path)}><IconForFile name={path} /><span>{path.split("/").pop()}</span>{activePath === path && dirty && <span className="dirty-dot" />}<span className="tab-close" onClick={(e) => { e.stopPropagation(); setOpenTabs((old) => old.filter((p) => p !== path)); if (activePath === path) setActivePath(openTabs.find((p) => p !== path) || ""); }}><X size={12} /></span></button>)}
            <button className="new-tab" title="New file" onClick={addFile}><Plus size={16} /></button>
            <div className="tabs-spacer" />
            <button className="icon-button small" title="Hide explorer"><PanelLeftClose size={15} /></button>
          </div>
          <div className="breadcrumb"><span>{projectName}</span><ChevronRight size={13} /><span>{activePath.split("/").slice(0, -1).join("/")}</span>{activePath && <><ChevronRight size={13} /><strong>{activePath.split("/").pop()}</strong></>}</div>
          <div className="editor-wrap">
            {activeFile ? <Editor
              height="100%"
              path={activePath}
              language={languageFor(activePath)}
              value={activeFile.content}
              onChange={updateEditor}
              theme="vs-dark"
              options={{
                minimap: { enabled: false }, fontSize: 13, lineHeight: 22,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                padding: { top: 16 }, scrollBeyondLastLine: false,
                automaticLayout: true, tabSize: 2, wordWrap: "on",
                smoothScrolling: true, renderLineHighlight: "all",
                bracketPairColorization: { enabled: true }
              }}
            /> : <div className="empty-editor">Select a file to start editing.</div>}
          </div>
          <div className="statusbar"><span><Code2 size={13} /> {framework}</span><span>{activeFile ? languageFor(activePath) : "Plain Text"}</span><span>UTF-8</span><span>Spaces: 2</span><div className="status-spacer" /><span>{dirty ? "Modified" : "Ready"}</span><span>Local workspace</span></div>
        </section>

        <section className="preview-area">
          <div className="preview-toolbar"><div className="preview-title"><Smartphone size={16} /><strong>PREVIEW</strong><span className={`status-indicator ${previewUrl ? "live" : ""}`} /></div><div className="preview-controls"><button className={previewMode === "Browser" ? "mode active" : "mode"} onClick={() => setPreviewMode("Browser")}><Monitor size={14} /> Web</button><button className={previewMode === "Native" ? "mode active" : "mode"} onClick={() => setPreviewMode("Native")}><Smartphone size={14} /> Native</button><button className="icon-button small" onClick={runPreview} title="Refresh preview"><RefreshCw size={14} /></button></div></div>
          <div className="preview-stage">
            {previewUrl && previewMode === "Browser" ? <iframe className="preview-iframe" src={previewUrl} title="App preview" sandbox="allow-scripts allow-forms allow-same-origin allow-pointer-lock" /> : (
              <div className="device-frame">
                <div className="device-side-button side-one" /><div className="device-side-button side-two" />
                <div className="device-screen">
                  <div className="device-island" />
                  <div className="device-status"><span>9:41</span><span>●●●  ▰</span></div>
                  {previewUrl && previewMode === "Native" ? <div className="native-notice"><Smartphone size={30} /><strong>Native preview started</strong><p>Open the emulator or device shown by your local runtime.</p><a href={previewUrl} target="_blank" rel="noreferrer">Open runtime</a></div> : <div className="mock-app"><div className="mock-label">YOUR MOBILE WORKSPACE</div><h2>Hello, world.</h2><p>Your real app preview will appear here when a compatible runtime is running.</p><div className="mock-card"><div className="mock-avatar">M</div><div><strong>My project</strong><span>Ready to build</span></div><span className="mock-chevron">›</span></div><button className="mock-cta" onClick={runPreview}><Play size={14} fill="currentColor" /> Run your app</button><div className="mock-bottom"><span>⌂</span><span>◇</span><span>○</span><span>◉</span></div></div>}
                  <div className="device-home" />
                </div>
              </div>
            )}
          </div>
          <div className="preview-footer"><span><span className={`green-dot ${previewUrl ? "" : "muted-dot"}`} /> {previewStatus}</span><span>{previewMode === "Browser" ? "Browser runtime" : "Native runtime"}</span></div>
        </section>
      </div>

      <section className={`terminal-panel ${terminalOpen ? "open" : "closed"}`}>
        <div className="terminal-header"><div className="terminal-tabs"><button className="terminal-tab active" onClick={() => setTerminalOpen(true)}><SquareTerminal size={14} /> TERMINAL</button><button className="terminal-tab" onClick={() => setTerminalLines((l) => [...l, "No build problems reported by the IDE UI."]) }><Activity size={14} /> OUTPUT</button><button className="terminal-tab" onClick={() => setTerminalLines((l) => [...l, "No diagnostics provider configured yet."]) }><Activity size={14} /> PROBLEMS</button></div><div className="terminal-actions"><button title="Clear terminal" onClick={() => setTerminalLines([])}>Clear</button><button title="Toggle terminal" onClick={() => setTerminalOpen((v) => !v)}>{terminalOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button></div></div>
        {terminalOpen && <div className="terminal-content"><div className="terminal-lines">{terminalLines.map((line, i) => <div key={i} className="terminal-line"><span className="terminal-prompt">›</span><span>{line}</span></div>)}</div><div className="terminal-command"><span>❯</span><input placeholder="Commands run in the local workspace server (not an OS shell yet)" onKeyDown={(e) => { if (e.key === "Enter") { setTerminalLines((l) => [...l, `$ ${e.currentTarget.value}`, "Use the Preview button to start a configured runtime."]); e.currentTarget.value = ""; } }} /></div></div>}
      </section>
      <footer className="bottom-bar"><span>Mobile Studio</span><span><span className="green-dot" /> {serverBacked ? "Local server connected" : "UI mode"} </span><span>Flutter + React Native</span></footer>
    </main>
  );
}
