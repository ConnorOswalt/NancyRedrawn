# Ghidra Reverse-Engineering Setup for Nancy Drew 13

This guide details how to import, analyze, and reverse-engineer `game.exe` (Nancy Drew 13: Last Train to Blue Moon Canyon) using NSA Ghidra.

## Prerequisites

- **Ghidra 11+** (requires JDK 17 or newer)
- Target executable:
  - `local-data/working/game/game.exe` (extracted from the game package) or
  - `Nancy Drew 13 - Last Train to Blue Moon Canyon (2005)/No Disc Needed/Game.exe`

*Note: All Ghidra project files (`*.gpr`, `*.rep/`) and private databases reside under `local-data/analysis/ghidra/` and are strictly ignored by git.*

## Binary Specifications

- **Format:** PE32 (Portable Executable 32-bit Windows GUI)
- **Architecture:** x86 (Intel 32-bit Little-Endian)
- **Compiler Spec:** Visual Studio C++ (`windows:x86:32:default`)
- **Key Subsystems:** DirectDraw 7, DirectSound, Bink Video (`binkw32.dll`), GDI+

## Option A: Automated Headless Analysis

Run the provided automation script:

```bash
# Optional: Set GHIDRA_HOME if not in PATH
export GHIDRA_HOME=/path/to/ghidra_11.x_PUBLIC

./tools/ghidra/analyze-game.sh
```

This will:
1. Create a non-shared Ghidra project at `local-data/analysis/ghidra/NancyDrew13`.
2. Import `game.exe`.
3. Run Ghidra's complete standard auto-analysis pipeline (decompiler parameter ID, ASCII string identification, reference propagation).
4. Execute `tools/ghidra/IdentifyEngineStrings.java` to automatically bookmark all `CIF TREE`, `Game.ini`, and format parser functions.

## Option B: Interactive GUI Analysis

1. Launch Ghidra GUI:
   ```bash
   ghidraRun
   ```
2. Create a new non-shared project:
   - **Project Directory:** `/home/ozzy/Documents/VSCode Repositories/NancyRedrawn/local-data/analysis/ghidra`
   - **Project Name:** `NancyDrew13`
3. Drag and drop `game.exe` into the project window:
   - Verify format is detected as **PE (Portable Executable)**, **x86:LE:32:default**.
4. Open `game.exe` in the **CodeBrowser**.
5. When prompted *"game.exe has not been analyzed. Would you like to analyze it now?"*, click **Yes**.
6. Select standard analyzers:
   - Ensure **Decompiler Parameter ID**, **Windows PE x86**, and **ASCII Strings** are checked.
   - Click **Analyze**.
7. In the CodeBrowser, open the **Script Manager** (`Window > Script Manager`):
   - Add the script path: `/home/ozzy/Documents/VSCode Repositories/NancyRedrawn/tools/ghidra`
   - Run `IdentifyEngineStrings.java`.
   - Check the **Bookmarks** window for `NancyRedrawn` bookmarks to jump directly to key engine routines.

## Key Engine Functions to Investigate

1. **CIF Tree Resource Loader:**
   - Look for references to the literal string `"CIF TREE HerInteractive"`.
   - The referencing function opens `CIFTREE.DAT` and populates the in-memory scene dictionary.
2. **Configuration Loader:**
   - Look for references to `"Nancy Data"` and `"ExternalCifFileChecking"`.
   - Reads `Game.ini` using standard Win32 profile functions (`GetPrivateProfileIntA`, `GetPrivateProfileStringA`).
3. **DirectDraw Initialization:**
   - Dynamic import of `DirectDrawCreate` from `DDRAW.dll`.
   - Sets up display mode (640x480 16-bit/32-bit color).
4. **Window Procedure:**
   - Locate the `RegisterClassExA` call to find the main game `WndProc` dispatching mouse clicks and keyboard events to the scene graph.
