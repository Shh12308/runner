# Mobile Studio — local Flutter & React Native IDE

A local-first IDE prototype: no authentication, accounts, database, or cloud services. Project files are stored under `./projects`.

## Requirements

- Node.js 20.9 or newer
- `unzip` and `zip` command-line tools
- Optional: Flutter SDK for Flutter commands
- Optional: Android Studio, Android SDK, and an emulator for native Android work

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## What works in this starter

- Monaco code editor and file explorer
- ZIP import to local `projects/` storage
- File edits saved to disk
- ZIP export
- Basic browser-preview startup for Expo/web-enabled React Native projects
- Flutter Web build attempt when Flutter is installed
- Native-preview guidance for Android tooling

## Important limitations

- This is a local development tool. Do not expose it to the public internet as-is: there is no authentication and project commands execute with your OS user privileges.
- Only text files are loaded into the editor tree. Large files, binary assets, dependency folders and generated build output are intentionally omitted from the UI listing.
- ZIP import validates traversal-style paths but is a starter importer, not a hardened hostile-archive sandbox. Use only projects you trust.
- Browser preview is best-effort and depends on the project's dependencies and scripts. Some bare React Native apps and Flutter plugins cannot run in a browser.
- Flutter preview currently runs `flutter pub get` and `flutter build web`, but does not yet launch a static preview server.
- Native preview is not an emulator-streaming implementation. Run Android tooling locally from the project directory.
- Terminal input is a UI placeholder, not a real interactive shell.

## Build

```bash
npm run typecheck
npm run build
```

## Where projects live

Imported projects are placed in `./projects/<project-name>-<id>/`. Each project has a `.mobile-ide-project.json` metadata file. Back up this folder to preserve projects.

## Next implementation steps

1. Add a real PTY-backed terminal using `node-pty`.
2. Add process lifecycle tracking, preview stop/restart, and readiness checks.
3. Add a static file server for Flutter `build/web`.
4. Add framework-specific native launch flows and emulator streaming.
5. Harden archive extraction and command execution before using with untrusted projects.
