# Research log

This log records verified architectural findings and format observations.
All proprietary data and private paths remain local and untracked.

## Entry 001: Initial Binary Architecture & Executable Fingerprints

- **Date:** 2026-10-17
- **Question:** What are the architectures, file formats, and dependencies of the supplied game package and runtime executable?
- **Builds & Fingerprints:**
  - Distribution package (`Nancy_Drew_Train_game.exe`):
    - Size: 859,725,127 bytes (~820 MiB)
    - SHA-256: `07cf74b4002015051fdd6bee04a2eeefe545a99fa14c406b78b22af165292a5e`
    - Subsystem: PE32 (x86 32-bit GUI), NSIS self-extracting archive (NSIS-2.25)
  - Game executable (`Game.exe`):
    - Size: 1,306,624 bytes (~1.25 MiB)
    - SHA-256: `bf232e79eab0fe19077fdb972694e8519829904ecff5ae2266ee0b0eaea59784`
    - Subsystem: PE32 (x86 32-bit GUI), 4 sections
- **Environment:** Linux x86_64, `tools/inspect-executable.mjs`, `file`, `objdump`, `strings`
- **Method:**
  1. Ran read-only header inspector `tools/inspect-executable.mjs` against both files.
  2. Identified package format using `file`.
  3. Inspected dynamic imports using `objdump -p`.
  4. Searched referenced asset extensions using `strings`.
- **Observations:**
  - The distribution package is a Nullsoft Scriptable Install System (NSIS) wrapper containing compressed game assets.
  - The runtime executable is a 32-bit x86 Win32 binary.
  - Core subsystem dependencies: DirectDraw (`DDRAW.dll`), DirectSound (`DSOUND.dll`), Bink Video (`binkw32.dll`), GDI+ (`gdiplus.dll`).
  - Key asset extensions identified in binary strings:
    - `.CIF` / `.CID`: Her Interactive container archive and index files
    - `.AVF`: Audio Visual Format (proprietary video/cutscene stream)
    - `.BIK`: RAD Game Tools Bink Video
    - `.CAL`: Script / animation data
    - `.his`: Her Interactive Sound archive
    - `.PAX`: Picture / sprite archive
    - `.DAT`: Game configuration and state
- **Conclusion & Confidence:** High confidence (10/10) on architecture (32-bit x86 Win32) and primary media subsystems (DirectDraw / DirectSound / Bink).
- **Next steps:** Extract game data files cleanly into an isolated local directory to analyze the CIF/CID container structure and implement a read-only CIF unpacker in `src/`.

---

## Finding template

- **Date:**
- **Question:**
- **Build/edition and SHA-256:** No personal paths or keys.
- **Environment:** OS, compatibility layer, analysis tool version.
- **Method:** Reproducible steps with symbolic input paths.
- **Observation:** Independently written description; no copied game code.
- **Conclusion and confidence:** Separate confirmed facts from hypotheses.
- **Limitations:** Alternative explanations or untested builds.
- **Next experiment:**
