# Local AI analysis framework

This framework runs Ghidra on your Fedora workstation and sends bounded function
evidence to your Ollama homelab at `http://mentat:11484`. It makes resumable
analysis proposals; it does not recover a buildable original source tree or
autonomously prove game behavior.

## Architecture and permissions

```text
Legitimate local executable -> Ghidra database
                                  |
                     read-only bounded Java export
                                  |
             ignored evidence JSON + function/caller/callee queue
                                  |
                    Node.js -> homelab Ollama HTTP API
                                  |
             validated proposals + per-function failure ledger
                                  |
                explicit human approval of each address
                                  |
       transactional Ghidra renames/comments -> reopen and verify save
```

There is no remotely exposed Ghidra server, arbitrary RPC, Python dependency,
or model-controlled shell. Models return a strict JSON schema, not executable
tools. The only implemented database writes are approved function names and
comments. Function types, local-variable types/names, structures, instructions,
binary patches, and DRM behavior are not changed.

## Prerequisites

- Node.js 22+ and Bash. No npm dependencies are required.
- Ghidra with the JDK required by that particular release. The bridge was
  validated against Ghidra 12.1.4, whose configuration requires Java 21+.
  Older advice that all Ghidra 11+ versions use Java 17 was inaccurate.
- A legally obtained executable for your actual game analysis.
- Ollama reachable from this workstation with the exact configured model tag
  installed. The framework never downloads a model or changes server settings.

Example settings for this workstation:

```sh
export GHIDRA_HOME="$HOME/Downloads/ghidra_12.1.4_PUBLIC"
export OLLAMA_HOST="http://mentat:11484"
export OLLAMA_MODEL="qwen2.5-coder:14b"
npm run agent -- doctor
```

`doctor` checks the launcher path and queries `/api/tags`, including the installed
model digest. It does not test GPU placement, Java compatibility or generation;
use the synthetic Ghidra validation and a one-function batch for those checks.

If a model is missing, pull it **on the homelab**, for example
`ollama pull qwen2.5-coder:14b`. Start with a Q4 quantization and one request at
a time on a 16 GB RTX 5070 Ti. Model weights, KV cache, context and other GPU
users all consume VRAM; neither Q8 fit nor a particular speed is guaranteed.
Use `ollama ps` on the server to check actual placement.

Ollama must listen on the homelab LAN interface/port or sit behind a suitable
proxy. Restrict firewall access to trusted clients. Do not expose unauthenticated
Ollama to the public internet. HTTP is unencrypted; use a trusted LAN, VPN or
HTTPS proxy. This tool supports HTTP(S) origins without embedded credentials;
it does not implement proxy authentication.

## 1. Import once; do not overwrite existing work

```sh
bash tools/ghidra/analyze-game.sh "/absolute/path/to/legitimate/game.exe"
```

The runner creates `local-data/analysis/ghidra/NancyDrew13`, analyzes the input
without running the executable, and adds string/xref bookmarks. It refuses to
overwrite an existing project and no longer falls back to the cracked executable.
An extracted installer binary is not automatically a legitimate, original
baseline: establish provenance separately.

If you already imported the binary in the GUI, use that project at the expected
location. Set `GHIDRA_PROGRAM` to the exact project program basename if it is not
`game.exe`, for example `export GHIDRA_PROGRAM="Game.exe"`. Close the GUI project
before any headless command; the agent lock does not replace Ghidra's locks.

## 2. Export a bounded research slice

```sh
npm run agent -- export --limit 20
```

Without a seed, functions containing `NancyRedrawn XREF` bookmarks are queued
first, in address order, followed by callers/callees. If no anchors exist, export
starts with the first internal functions in address order. This fallback is a
starting point, not evidence of relevance. For a specific actual function:

```sh
npm run agent -- export --seed 00401000 --limit 10
```

Replace the example address with a function entry address from your own project;
it is not a known Nancy Drew address. At most 100 functions are exported, with
30-second per-function decompiler deadlines, bounded code, string references
and caller/callee lists. Export uses `-readOnly -noanalysis` and records failed
decompilations explicitly. Code is pseudocode, with potentially incorrect types.

Evidence is written to `local-data/analysis/agent/evidence.json`, including the
imported executable's SHA-256. The model receives a further bounded view:
12,000 code characters, 1,000 comment characters and up to eight entries from
each context list. Character limits are not exact token estimates: inspect
truncation flags and retry smaller functions if the model hits its context limit.

## 3. Analyze, stop, and resume

```sh
npm run agent -- analyze --limit 5 --timeout 180
npm run agent -- status
npm run agent -- analyze --limit 5
```

The worker processes functions sequentially, at most `--limit` requests per
invocation. It uses schema-constrained `/api/chat`, temperature 0, an 8,192-token
context and at most 1,536 output tokens. These are starting defaults, not a
quality or determinism guarantee.

State lives under `local-data/analysis/agent/runs/<evidence-hash>/`:

- `evidence.json`: complete exported context for this run.
- `run.json`: host, model tag/digest, inference settings and evidence identity.
- `<address>.json`: pending, succeeded or failed status, attempts, proposal
  or error. Confidence and evidence claims are model hypotheses, not verified facts.

Successful records are skipped on resume. Failed or interrupted requests require:

```sh
npm run agent -- analyze --retry-failed --limit 5
```

Failed records remain visible and cause a nonzero result until resolved. There
are no infinite retry loops, automatic tool calls or automatic approvals.
Timeouts, missing models, HTTP errors, truncated completions and invalid JSON
are recorded as failures. Model/host/digest changes cannot silently mix with
existing proposals. Archive a run deliberately before starting a replacement
model on the same evidence.

Only exported function evidence is sent to the configured Ollama origin, not
the executable or entire database. Treat code and extracted strings as private.
The framework does not use cloud inference or follow HTTP redirects.

## 4. Review and approve individual changes

Inspect each proposal JSON alongside its matching exported code, strings and
cross-references. Check its claims in the Ghidra listing, not only the decompiler.
Do not approve a name merely because confidence is high.

```sh
npm run agent -- approve --address 00401000
```

This explicit command approves the **exact existing proposal** at that address
and adds it to `local-data/analysis/agent/approvals.json`. It does not update
Ghidra. The manifest binds the binary hash, original function name/comment,
evidence hash and proposal hash. Do not edit it to bypass review; incorrect
proposals should remain unapplied.

Close Ghidra and make a backup of the **closed** project (`.gpr` and its matching
`.rep` directory) before applying. Never copy a live database as a backup.

```sh
npm run agent -- apply --confirm-apply
```

All changes are prevalidated before the transaction. Mismatched binary hashes,
stale function bytes/signatures or names/comments, duplicate targets/names, existing function-name conflicts,
thunks, external functions and user-defined names are rejected. Comments are
preserved and the new text is clearly marked as an AI hypothesis. No binary
bytes are changed.

After headless save, a second read-only Ghidra invocation verifies every approved
name/comment from disk before reporting success. Ghidra can log script errors
while returning exit code zero, so receipt validation is mandatory. If saving or
verification fails, inspect the logs/database and restore the closed backup if
needed; do not assume an error means nothing changed. Transactions cover database
edits, not process crashes or disk failures.

After a successful apply, archive the old approvals file, export fresh evidence,
and start the next research slice. Reapplying stale approvals is deliberately
rejected. Already user-defined function names are protected from future agent
renames.

## Validation

```sh
npm run check
npm test
npm run agent:validate-ghidra
```

The first two commands use synthetic inputs and a local mock Ollama server,
not the homelab or game. The last command requires Ghidra and a C compiler
(`cc`); it compiles original synthetic code, imports it into a separate ignored
temporary project, decompiles it, applies a fixture annotation, reopens the
database to verify persistence and checks stale-change rejection. Its diagnostic
projects are retained under `local-data/analysis/agent-validation/` for inspection.
It never imports or sends game code.

Agent state is locked by `local-data/analysis/agent/worker.lock`. If a process
crashes, check the recorded PID before deleting that specific stale lock.
Do not remove locks for a running process or bypass Ghidra project locks.

## Types and next research milestones

The optional [observed headers](../tools/ghidra/engine_types.h) are experimental
on-disk byte layouts, not verified runtime structs. In particular, the earlier
research log overstated the count/lookup-table interpretation: prior inspection
included two invalid final DAT records. Do **not** import those claims into
automatic parameter typing or build repackers from them yet.

First verify the container loader's header reads, actual record count, record
start and stored-vs-decoded sizes against disassembly and multiple files.
Then write synthetic parser regression tests and document evidence-backed
types. Local-variable/type rewriting, automated runtime tests and additional
audio/video/save parsers are separate future capabilities, not implemented by
this agent pipeline.
