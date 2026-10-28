import { spawn } from 'node:child_process';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  ANALYSIS_VERSION, DEFAULT_HOST, DEFAULT_MODEL, MAX_FUNCTIONS, approvalFor, digest, integer, loadJson,
  modelIdentity, ollamaHost, propose, saveJson, validateEvidence,
} from './core.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const stateDir = join(root, 'local-data/analysis/agent');
const evidencePath = join(stateDir, 'evidence.json');
const approvalsPath = join(stateDir, 'approvals.json');
const bridge = join(root, 'tools/ghidra');

async function optionalJson(path, fallback) {
  try {
    return await loadJson(path);
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function withLock(action) {
  await mkdir(stateDir, { recursive: true });
  const lock = join(stateDir, 'worker.lock');
  try {
    await writeFile(lock, `PID ${process.pid}\n`, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Agent is locked: ${lock}. Check the recorded PID before removing a stale lock.`);
    throw error;
  }
  try {
    return await action();
  } finally {
    await rm(lock);
  }
}

function headless() {
  if (!process.env.GHIDRA_HOME) throw new Error('Set GHIDRA_HOME to an installed Ghidra directory.');
  return join(process.env.GHIDRA_HOME, 'support/analyzeHeadless');
}

async function runHeadless(args) {
  await access(headless());
  await new Promise((done, reject) => {
    const child = spawn(headless(), args, { stdio: 'inherit', shell: false });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? done() :
      reject(new Error(`Ghidra failed (exit ${code}, signal ${signal}).`)));
  });
}

const options = {
  host: { type: 'string' }, model: { type: 'string' },
  limit: { type: 'string' }, timeout: { type: 'string' },
  seed: { type: 'string' }, address: { type: 'string' },
  'retry-failed': { type: 'boolean' }, 'confirm-apply': { type: 'boolean' },
};
const allowed = {
  doctor: ['host', 'model'],
  export: ['limit', 'seed'],
  analyze: ['host', 'model', 'limit', 'timeout', 'retry-failed'],
  status: [],
  approve: ['address'],
  apply: ['confirm-apply'],
};

async function main() {
  const { values, positionals } = parseArgs({ options, allowPositionals: true });
  const command = positionals[0];
  if (positionals.length !== 1 || !Object.hasOwn(allowed, command)) {
    throw new Error('Usage: node tools/agent/cli.mjs <doctor|export|analyze|status|approve|apply> [options]. See docs/local-agent.md.');
  }
  for (const key of Object.keys(values)) {
    if (!allowed[command].includes(key)) throw new Error(`--${key} is not valid for ${command}.`);
  }
  const host = ollamaHost(values.host ?? (process.env.OLLAMA_HOST || DEFAULT_HOST));
  const model = values.model ?? (process.env.OLLAMA_MODEL || DEFAULT_MODEL);
  if (command === 'doctor') {
    const checks = await Promise.allSettled([
      Promise.resolve().then(() => access(headless())).then(() => `Ghidra launcher: ${headless()}`),
      modelIdentity(host, model).then((id) => `Ollama: ${host}, model: ${model}, digest: ${id}`),
    ]);
    for (const check of checks) {
      if (check.status === 'fulfilled') console.log(check.value);
      else console.error(`Prerequisite check failed (${host}): ${check.reason.message}` +
        (check.reason.cause?.code ? ` (${check.reason.cause.code})` : ''));
    }
    if (checks.some((c) => c.status === 'rejected')) process.exitCode = 1;
    return;
  }

  await withLock(async () => {
    const projectDir = join(root, 'local-data/analysis/ghidra');
    const projectName = 'NancyDrew13';
    const program = process.env.GHIDRA_PROGRAM ?? 'game.exe';
    if (!/^[A-Za-z0-9_.-]+$/.test(program)) throw new Error('GHIDRA_PROGRAM must be a literal program basename, not a wildcard.');
    const base = [projectDir, projectName, '-process', program, '-noanalysis', '-scriptPath', bridge];

    if (command === 'export') {
      const limit = integer(values.limit ?? 20, 1, MAX_FUNCTIONS, 'limit');
      const seed = values.seed ?? '-';
      if (seed !== '-' && !/^[a-fA-F0-9]{1,16}$/.test(seed)) throw new Error('seed must be a hexadecimal entry address without 0x.');
      const temporary = join(stateDir, 'export.pending.json');
      await rm(temporary, { force: true });
      await runHeadless([...base, '-readOnly', '-postScript', 'AgentBridge.java',
        'export', temporary, String(limit), seed]);
      const evidence = validateEvidence(await loadJson(temporary));
      if (evidence.functions.length === 0) throw new Error('Ghidra exported no functions.');
      await saveJson(evidencePath, evidence);
      await rm(temporary);
      console.log(`Exported ${evidence.functions.length} functions. Evidence SHA-256: ${digest(evidence)}`);
      return;
    }

    const evidence = validateEvidence(await loadJson(evidencePath));
    const evidenceHash = digest(evidence);
    const runDir = join(stateDir, 'runs', evidenceHash);
    const recordPath = (address) => join(runDir, `${address}.json`);
    if (command === 'analyze') {
      const limit = integer(values.limit ?? 10, 1, MAX_FUNCTIONS, 'limit');
      const timeout = integer(values.timeout ?? 180, 1, 600, 'timeout') * 1000;
      const modelDigest = await modelIdentity(host, model);
      const identity = { evidenceHash, host, model, modelDigest, analysisVersion: ANALYSIS_VERSION, context: 8192, prediction: 1536 };
      const metaPath = join(runDir, 'run.json');
      const prior = await optionalJson(metaPath, null);
      if (prior && digest(prior) !== digest(identity)) {
        throw new Error('Run identity changed. Export fresh evidence or use the original host/model/digest; do not mix proposals.');
      }
      await saveJson(metaPath, identity);
      await saveJson(join(runDir, 'evidence.json'), evidence);
      let attempted = 0;
      let failed = 0;
      for (const fn of evidence.functions) {
        const previous = await optionalJson(recordPath(fn.address), null);
        if (previous && (previous.status === 'succeeded' || !values['retry-failed'])) continue;
        if (attempted >= limit) break;
        attempted++;
        const record = {
          address: fn.address, evidenceHash, functionHash: digest(fn), ...identity,
          attempts: (previous?.attempts ?? 0) + 1, status: 'pending',
        };
        await saveJson(recordPath(fn.address), record);
        try {
          record.proposal = await propose(host, model, fn, timeout);
          record.status = 'succeeded';
          console.log(`${fn.address} ${fn.name} -> ${record.proposal.suggestedName} (hypothesis)`);
        } catch (error) {
          record.status = 'failed';
          record.error = error.message;
          failed++;
          console.error(`${fn.address}: ${error.message}`);
        }
        await saveJson(recordPath(fn.address), record);
      }
      console.log(`${attempted} functions attempted; ${failed} failed. Records: ${runDir}`);
      const remainingFailures = [];
      for (const fn of evidence.functions) {
        const record = await optionalJson(recordPath(fn.address), null);
        if (record && record.status !== 'succeeded') remainingFailures.push(fn.address);
      }
      if (remainingFailures.length) {
        console.error(`Unresolved failed/interrupted records: ${remainingFailures.join(', ')}. Review errors and use --retry-failed.`);
        process.exitCode = 1;
      }
      return;
    }
    if (command === 'status') {
      for (const fn of evidence.functions) {
        const record = await optionalJson(recordPath(fn.address), null);
        console.log(`${fn.address} ${record?.status ?? 'queued'} ${fn.name}` +
          (record?.proposal ? ` -> ${record.proposal.suggestedName}` : '') +
          (record?.error ? ` ERROR: ${record.error}` : ''));
      }
      console.log(`Review full evidence and proposal JSON under ${runDir} before approving.`);
      return;
    }
    if (command === 'approve') {
      const fn = evidence.functions.find((f) => f.address === values.address);
      if (!fn) throw new Error('--address must exactly match an exported function address.');
      const approval = approvalFor(evidence, evidenceHash, fn, await loadJson(recordPath(fn.address)));
      const manifest = await optionalJson(approvalsPath, {
        schemaVersion: 1, evidenceHash, programSha256: evidence.programSha256, approvals: [],
      });
      if (manifest.evidenceHash !== evidenceHash) throw new Error('Approvals belong to different evidence. Archive them before approving this export.');
      if (manifest.approvals.some((a) => a.address === fn.address)) throw new Error('Function is already approved.');
      manifest.approvals.push(approval);
      await saveJson(approvalsPath, manifest);
      console.log(`Approved ${fn.address} -> ${approval.suggestedName}. No Ghidra changes yet.`);
      return;
    }
    if (!values['confirm-apply']) throw new Error('apply requires --confirm-apply. Close Ghidra and back up its closed project first.');
    const manifest = await loadJson(approvalsPath);
    if (manifest.schemaVersion !== 1 || manifest.evidenceHash !== evidenceHash ||
      manifest.programSha256 !== evidence.programSha256 || !Array.isArray(manifest.approvals) ||
      manifest.approvals.length === 0) throw new Error('Missing, empty or stale approvals.');
    for (const approval of manifest.approvals) {
      const fn = evidence.functions.find((f) => f.address === approval.address);
      if (!fn || digest(approval) !== digest(approvalFor(evidence, evidenceHash, fn, await loadJson(recordPath(fn.address))))) {
        throw new Error('Approval no longer matches its evidence and proposal.');
      }
    }
    const receiptPath = join(stateDir, 'apply-receipt.json');
    const stagedPath = join(stateDir, 'apply-staged.json');
    await rm(receiptPath, { force: true });
    await rm(stagedPath, { force: true });
    await runHeadless([...base, '-postScript', 'AgentBridge.java', 'apply', approvalsPath, stagedPath]);
    if ((await loadJson(stagedPath)).status !== 'staged') throw new Error('Ghidra did not stage the changes.');
    await runHeadless([...base, '-readOnly', '-postScript', 'AgentBridge.java', 'verify', approvalsPath, receiptPath]);
    const receipt = await loadJson(receiptPath);
    if (receipt.status !== 'applied' || receipt.evidenceHash !== evidenceHash ||
      receipt.count !== manifest.approvals.length) throw new Error('Missing or mismatched apply receipt; inspect Ghidra logs.');
    console.log(`Applied ${receipt.count} approved hypotheses. Export fresh evidence before further analysis.`);
  });
}

main().catch((error) => {
  console.error(`Agent error: ${error.message}`);
  process.exitCode = 1;
});
