# Research workflow

## Separate public work from private inputs

Keep this public repository focused on original tools, independently written
notes, and synthetic test fixtures. A suggested ignored local layout is:

```text
local-data/
  originals/       Untouched, legally obtained inputs
  working/         Disposable copies for local experiments
  reports/         Fingerprints and inspection output
  analysis/        Private debugger/disassembler projects and decompiler output
  saves/          Backups made before local testing
```

Do not move existing downloads into public source directories. The supplied
download includes notes referring to a crack; it is not a trustworthy reference
build. Do not run or redistribute that replacement executable as part of this
workflow. Obtain a legitimate baseline before making claims about the original
game's behavior.

## Establish a baseline

1. Record the edition, language, release source, patch level, and local
   installation environment privately. Do not publish receipts or product keys.
2. Distinguish distribution installers from installed executables. A wrapper
   installer does not necessarily have the architecture of the game it installs.
3. Fingerprint relevant files with the inspector. Recheck hashes after any
   experiment to distinguish original and modified builds.
4. Record the OS or compatibility-layer version, observed launch behavior,
   and a small repeatable gameplay scenario using your legitimate installation.
5. Back up saves and use a separate working copy. Static analysis does not
   require launching an executable; do not launch untrusted inputs to identify them.

The current inspector reads MZ and PE signatures, COFF machine and section
count fields, and the PE32/PE32+ optional-header magic. These are identification
signals only, not a complete PE validation, safety scan, or engine detector.
Malformed or truncated fields that it reads cause an explicit error.

## Investigate one question at a time

Record the question, input fingerprint, method, observation, and confidence
before drawing a conclusion. Label hypotheses separately from confirmed facts.
Useful first questions include:

- Which installed files are opened during a specific scene transition?
- Which files change after saving or changing an option?
- Which resource signatures or script structures recur across several samples?
- What minimum behavior must an original parser or replacement component match?

Disassemblers and decompilers such as Ghidra can support private analysis where
permitted. Their output is not original project source and should remain in
the ignored analysis directory. Never treat decompiler pseudocode as verified
source; corroborate interpretations with independent observations.

## Tool and mod development

- Prefer read-only inspection before writing or repacking resources.
- Use synthetic fixtures and original examples in committed tests.
- Validate lengths, offsets, encodings, and unsupported versions explicitly.
- Write generated output under ignored local directories, not over originals.
- Preserve a reproducible rollback path and test save compatibility.
- Keep project source under `src/` and original mod work under `mods/` when
  those surfaces are needed; neither has an implementation yet.
- Review the rights and contents of every distributable independently. Do not
  bundle game assets, extracted scripts, modified executables, or bypass tools.

## Before publishing

Run checks and tests. Inspect staged changes, not just filenames. Exclude
private paths, screenshots containing game assets, memory dumps, extracted
strings containing game dialogue, proprietary code, credentials, and saves.
Document reproduction steps using symbolic paths and hashes rather than
uploading the original input.
