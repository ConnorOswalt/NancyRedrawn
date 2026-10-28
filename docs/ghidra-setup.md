# Ghidra setup

Use a legally obtained executable, a current Ghidra distribution and the JDK
required by that specific release. Ghidra 12.1.4 requires Java 21 or newer.
Decompilation produces approximate pseudocode, not original source.

## Headless workflow

See [the local-agent guide](local-agent.md) for configuration, safe import,
bounded exports, Ollama analysis, human approvals and verified database writes.

The runner [analyze-game.sh](../tools/ghidra/analyze-game.sh) imports once into the
ignored `local-data/analysis/ghidra/NancyDrew13` project. It refuses to overwrite
an existing database. It never runs the imported executable.

## GUI workflow

1. Launch `ghidraRun` from your Ghidra installation.
2. Create a non-shared project named `NancyDrew13` under the project's
   `local-data/analysis/ghidra/` directory, or open the existing project there.
3. Import your legitimate executable and verify Ghidra's detected PE format,
   architecture and compiler specification. Do not force a compiler based only
   on the game's age or title.
4. Open CodeBrowser and run the default auto-analysis. Analysis duration depends
   on the executable and environment; it does not map every function perfectly.
5. Add `tools/ghidra/` to Script Manager's script directories and run
   [IdentifyEngineStrings.java](../tools/ghidra/IdentifyEngineStrings.java).
   It bookmarks keyword matches and existing references, not proven engine roles.
6. Inspect strings, references, imports, callers and callees. Use provisional
   names and document the instructions supporting each interpretation.

References to configuration keys or archive signatures are useful starting
points, but do not necessarily identify the file loader directly. Follow the
actual data flow before assigning names or types. Imported DirectDraw or Bink
APIs alone do not establish rendering settings or a particular engine version.

Only import [engine_types.h](../tools/ghidra/engine_types.h) as experimental
on-disk observations; do not automatically apply these to runtime parameters.
Unknown fields and the archive count/table layout still need verification.

Close the GUI project before using headless export or apply. Keep databases,
decompiler output and raw game excerpts in ignored local storage.
