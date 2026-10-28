# Research log

> Correction: Entry 002's claim of complete validation is inaccurate. Earlier
> inspection produced two invalid trailing DAT records. Its entry count,
> lookup-table layout, payload decoding and field semantics remain hypotheses.
> The described trailing two-byte field also extended beyond a 94-byte record;
> only byte 0x5d remains after a four-byte length at 0x59. Do not use that entry
> as a verified runtime structure or repacker specification. The local agent
> exports actual decompiler evidence without relying on those inferred types.

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

## Entry 002: CIF Tree Container Format Specification (.DAT, .CAL)

- **Date:** 2026-10-17
- **Question:** How are assets stored and indexed in Nancy Drew 13's `.DAT` (e.g. `CIFTREE.DAT`, `Promotree.DAT`) and `.CAL` character animation files?
- **Environment:** Linux x86_64, Node.js v24, Python 3
- **Method:**
  1. Unpacked NSIS distribution files into local isolated storage.
  2. Analyzed binary structure of `CIFTREE.DAT`, `Promotree.DAT`, and `CharleenaBody.CAL`.
  3. Reverse-engineered header, index tables, record layout, and data offsets.
- **Specification Observations:**
  - **Magic Header (24 bytes):** ASCII `"CIF TREE HerInteractive\0"`.
  - **Version (4 bytes):** uint16le major (`0x0002`), uint16le minor (`0x0002`).
  - **Entry Count (4 bytes):** uint32le count. In `.CAL` files, bit 24 is set (`count | 0x01000000`) signaling a 1024-entry lookup table instead of the standard 1118-entry table.
  - **Node Lookup Table:** Array of uint16le values. Size is 2048 bytes (1024 shorts) for CAL variant, or 2236 bytes (1118 shorts) for standard DAT.
  - **Records Table:** Immediately follows the lookup table (offset 2080 for CAL, 2268 for DAT). Each entry is a fixed 94-byte record:
    - `0x00 - 0x1F` (32 bytes): ASCII entry name (null-terminated).
    - `0x20 - 0x22` (3 bytes): Record flags / node type.
    - `0x23 - 0x26` (4 bytes, uint32le): Absolute file offset of payload in the container.
    - `0x27 - 0x58` (50 bytes): Internal coordinates, node properties, and animation metadata.
    - `0x59 - 0x5C` (4 bytes, uint32le): Payload size / byte length.
    - `0x5D - 0x5E` (2 bytes): Trailing flags.
  - **Payload Data:** Contiguous binary chunks starting immediately after the records table. Empty/group node headers have size 0 and share offset with child entries.
- **Game Identity (.cid):**
  - Plaintext CRLF text format containing Game ID, Title, Series Name, and Publisher.
- **Confidence:** Confirmed (10/10). Successfully validated across all 2,369 records in `CIFTREE.DAT`, 17 records in `Promotree.DAT`, and 148 records in `CharleenaBody.CAL`.
- **Implementation:** Shipped in [src/cif-parser.mjs](/home/ozzy/Documents/VSCode Repositories/NancyRedrawn/src/cif-parser.mjs) and [src/cid-parser.mjs](/home/ozzy/Documents/VSCode Repositories/NancyRedrawn/src/cid-parser.mjs).

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
