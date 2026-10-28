import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { loadJson, saveJson, validateEvidence } from './core.mjs';

async function run(command, args) {
  await new Promise((done, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: false });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? done() : reject(new Error(`${command} exited ${code}`)));
  });
}

try {
  if (!process.env.GHIDRA_HOME) throw new Error('Set GHIDRA_HOME to validate the actual Ghidra bridge.');
  const launcher = join(process.env.GHIDRA_HOME, 'support/analyzeHeadless');
  await access(launcher);
  const parent = resolve('local-data/analysis/agent-validation');
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, 'fixture-'));
  const binary = join(directory, 'agent-probe');
  const evidencePath = join(directory, 'evidence.json');
  const bridge = resolve('tools/ghidra');
  await run('cc', ['-O0', '-o', binary, 'tests/fixtures/agent-probe.c']);
  await run(launcher, [
    directory, 'AgentFixture', '-import', binary, '-scriptPath', bridge,
    '-postScript', 'IdentifyEngineStrings.java',
    '-postScript', 'AgentBridge.java', 'export', evidencePath, '30', '-',
  ]);
  const evidence = validateEvidence(await loadJson(evidencePath));
  const fn = evidence.functions.find((f) => f.name === 'probe_reset');
  assert.ok(fn, 'Synthetic probe function must be exported.');
  assert.equal(fn.decompileError, '');
  assert.match(fn.code, /value|param/);
  const approvals = join(directory, 'approvals.json');
  const receipt = join(directory, 'receipt.json');
  await saveJson(approvals, {
    schemaVersion: 1, programSha256: evidence.programSha256, evidenceHash: 'synthetic-validation',
    approvals: [{
      address: fn.address, originalName: fn.name, originalComment: fn.comment,
      bodySha256: fn.bodySha256,
      suggestedName: 'approved_probe_reset', programSha256: evidence.programSha256,
      comment: '[NancyRedrawn AI hypothesis; human-approved, not verified]\nSynthetic fixture annotation.',
    }],
  });
  const base = [directory, 'AgentFixture', '-process', 'agent-probe', '-noanalysis', '-scriptPath', bridge];
  const invalidPath = join(directory, 'invalid-approvals.json');
  const invalid = await loadJson(approvals);
  invalid.approvals.push({ ...invalid.approvals[0], address: '1', suggestedName: 'invalid_second_target' });
  await saveJson(invalidPath, invalid);
  const invalidReceipt = join(directory, 'invalid-receipt.json');
  await run(launcher, [...base, '-postScript', 'AgentBridge.java', 'apply', invalidPath, invalidReceipt]);
  await assert.rejects(access(invalidReceipt), { code: 'ENOENT' });
  const unchangedPath = join(directory, 'unchanged.json');
  await run(launcher, [...base, '-readOnly', '-postScript', 'AgentBridge.java', 'export', unchangedPath, '1', fn.address]);
  const unchanged = validateEvidence(await loadJson(unchangedPath)).functions[0];
  assert.equal(unchanged.name, fn.name, 'Invalid second change must not partially apply the first.');
  assert.equal(unchanged.comment, fn.comment);
  await run(launcher, [...base, '-postScript', 'AgentBridge.java', 'apply', approvals, receipt]);
  assert.equal((await loadJson(receipt)).status, 'staged');
  const verifiedReceipt = join(directory, 'verified-receipt.json');
  await run(launcher, [...base, '-readOnly', '-postScript', 'AgentBridge.java', 'verify', approvals, verifiedReceipt]);
  assert.equal((await loadJson(verifiedReceipt)).status, 'applied');
  const afterPath = join(directory, 'after.json');
  await run(launcher, [...base, '-readOnly', '-postScript', 'AgentBridge.java', 'export', afterPath, '1', fn.address]);
  const after = validateEvidence(await loadJson(afterPath)).functions[0];
  assert.equal(after.name, 'approved_probe_reset');
  assert.match(after.comment, /Synthetic fixture annotation/);
  const staleReceipt = join(directory, 'stale-receipt.json');
  await run(launcher, [...base, '-postScript', 'AgentBridge.java', 'apply', approvals, staleReceipt]);
  await assert.rejects(access(staleReceipt), { code: 'ENOENT' });
  console.log(`Ghidra export, persistent approved apply, and stale-change rejection verified: ${directory}`);
} catch (error) {
  console.error(`Ghidra validation failed: ${error.message}`);
  process.exitCode = 1;
}
