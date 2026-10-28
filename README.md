# NancyRedrawn

An independent research and modding workspace for **Nancy Drew: Last Train to
Blue Moon Canyon (2005)**, the thirteenth Nancy Drew game.

The long-term goal is to understand the game's executable, resource formats,
scripts, and runtime well enough to build original tools and modifications,
and eventually explore new content. This repository starts with project
infrastructure, a read-only executable inspector, and a reproducible research
process. It does **not** yet contain a decompiler, extracted game code, a
replacement engine, or a working mod.

The [local AI analysis framework](docs/local-agent.md) connects bounded Ghidra
exports to your homelab Ollama server. It keeps a resumable proposal ledger and
applies only explicitly approved function renames/comments. Ghidra supplies the
decompiler; model output is a hypothesis, not recovered original source.

## Scope and boundaries

- Use a legally obtained copy and check the laws and license terms that apply
  to your work. Age and online availability do not make a game public domain.
- Keep installers, executables, resource archives, extracted assets, saves,
  disassembly databases, and decompiler output local and untracked.
- Do not publish cracks, DRM-bypass instructions, keys, or proprietary game
  code or assets. This workspace does not implement DRM removal.
- Publish original tooling, independently written format documentation, and
  original mod content only when you have the necessary rights. Review any
  patch distribution separately; a patch is not automatically safe to share.
- This project is unofficial and is not affiliated with or endorsed by the
  game's rights holders.

## Quick start

Requires **Node.js 22 or newer** and Git. The tooling has no external
dependencies; no package installation is needed.

```sh
npm run check
npm test
npm run inspect:exe -- "/absolute/path/to/your/legally-obtained/Game.exe"
npm run inspect:cif -- "/absolute/path/to/your/CIFTREE.DAT"
```

The inspector reads the supplied file without executing or modifying it. It
prints JSON containing its size, SHA-256 fingerprint, and basic executable
header metadata. It cannot establish ownership, authenticity, safety, or
whether a file has been modified.

Use `node tools/inspect-executable.mjs` directly when redirecting output to
a private JSON file, so npm's status text is not included:

```sh
mkdir -p local-data/reports
node tools/inspect-executable.mjs "/absolute/path/to/Game.exe" \
  > local-data/reports/executable.json
```

An inspection error prints to stderr and exits nonzero; remove any empty
redirected report before relying on it. Do not inspect a file while another
process is modifying it.

In VS Code, use **Terminal > Run Task** for checks, tests, or interactive
executable inspection.

## Workspace layout

```text
.github/workflows/   Checks for original project tooling
.vscode/tasks.json  Local development tasks
docs/               Public workflow and independently written research notes
tools/              Original read-only inspection utilities
tests/              Tests using synthetic inputs, never game binaries
local-data/         Private inputs, reports, and analysis output (ignored)
```

The existing game-download folder is ignored in its entirety and is not used
automatically by any tool or task. Nothing here runs the installer or either
executable.

The root ignore rules intentionally allow only named project surfaces.
When adding a new public root file or directory, explicitly allow it in
`.gitignore`. This is an accident-prevention measure, not a content or legal
review: copied game content inside an allowed directory can still be staged.

## Research roadmap

1. Establish provenance and fingerprint a legally obtained installed baseline;
   distinguish the installer from the installed game executable.
2. Identify executable architecture and collect reproducible runtime
   observations. Do not assume an engine or resource format from the title.
3. Document resource and script formats using original notes and synthetic
   examples; implement small read-only parsers with bounds checks and tests.
4. Determine supported modification points, then test reversible local changes
   on a disposable working copy.
5. Explore original content and expansion tooling after formats, runtime
   behavior, and distribution boundaries are understood.

See [the research workflow](docs/research-workflow.md) and
[the research log](docs/research-log.md).

## Local AI quick start

```sh
export GHIDRA_HOME="$HOME/Downloads/ghidra_12.1.4_PUBLIC"
export OLLAMA_HOST="http://mentat:11484"
export OLLAMA_MODEL="qwen2.5-coder:14b"
npm run agent -- doctor
```

Follow [the full guide](docs/local-agent.md) to import once, export a bounded
function slice, analyze, review and explicitly approve database annotations.
The homelab model must already be installed. No game binaries or decompiled
content are uploaded to Git or a cloud inference service by these commands.
The existing CIF parser is experimental; its table/count interpretation is not
yet a verified foundation for automatic typing or repacking.

## Preparing the first GitHub commit

This directory is its own Git repository on `main`. No remote, commit, or push
is configured by the setup.

```sh
git rev-parse --show-toplevel
npm run check
npm test
git status --short --untracked-files=all
git add .gitignore .gitattributes .editorconfig LICENSE README.md package.json \
  .vscode/tasks.json .github/workflows/checks.yml docs tools tests src
git diff --cached --stat
git diff --cached
```

Confirm that the repository root is this project and review **every staged
file** for proprietary content, secrets, absolute personal paths, and generated
analysis output before committing. Ignore rules do not protect files already
tracked or added with `git add -f`.

After that review:

```sh
git commit -m "Initialize NancyRedrawn research workspace"
git remote add origin https://github.com/YOUR-USERNAME/NancyRedrawn.git
git push -u origin main
```

## Licensing

Original tooling, documentation, and code in this repository are licensed under
the [MIT License](LICENSE). No license or permission for the game, its code, its
assets, or its trademarks is granted by this repository.
