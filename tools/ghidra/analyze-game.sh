#!/usr/bin/env bash
# Headless Ghidra automated project runner for Nancy Drew Game.exe
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

GHIDRA_HOME="${GHIDRA_HOME:-}"
if [ -z "${GHIDRA_HOME}" ]; then
  if command -v analyzeHeadless >/dev/null 2>&1; then
    ANALYZE_HEADLESS="$(command -v analyzeHeadless)"
  else
    echo "Error: GHIDRA_HOME is not set and analyzeHeadless is not in PATH."
    echo "Please set GHIDRA_HOME=/path/to/ghidra or install Ghidra (JDK 17+ recommended)."
    exit 1
  fi
else
  ANALYZE_HEADLESS="${GHIDRA_HOME}/support/analyzeHeadless"
fi

PROJECT_DIR="${ROOT_DIR}/local-data/analysis/ghidra"
PROJECT_NAME="NancyDrew13"
TARGET_EXE="${ROOT_DIR}/local-data/working/game/game.exe"

if [ ! -f "${TARGET_EXE}" ]; then
  TARGET_EXE="${ROOT_DIR}/Nancy Drew 13 - Last Train to Blue Moon Canyon (2005)/No Disc Needed/Game.exe"
fi

if [ ! -f "${TARGET_EXE}" ]; then
  echo "Error: Target executable not found."
  echo "Expected local executable at ${TARGET_EXE}"
  exit 1
fi

mkdir -p "${PROJECT_DIR}"

echo "=== Running Headless Ghidra Analysis ==="
echo "Project Directory: ${PROJECT_DIR}"
echo "Project Name:      ${PROJECT_NAME}"
echo "Target Executable: ${TARGET_EXE}"
echo "Script Path:       ${SCRIPT_DIR}"

"${ANALYZE_HEADLESS}" "${PROJECT_DIR}" "${PROJECT_NAME}" \
  -import "${TARGET_EXE}" \
  -overwrite \
  -scriptPath "${SCRIPT_DIR}" \
  -postScript IdentifyEngineStrings.java

echo "=== Ghidra Analysis Complete ==="
