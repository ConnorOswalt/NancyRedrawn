import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  approvalFor, digest, integer, loadJson, modelIdentity, ollamaHost, propose,
  requestJson, saveJson, validateEvidence, validateProposal,
} from '../tools/agent/core.mjs';

const source = dirname(fileURLToPath(new URL('../tools/agent/cli.mjs', import.meta.url)));
const fn = {
  address: '00401000', name: 'FUN_00401000', comment: '', code: 'void f(int *p) { *p = 0; }',
  bodySha256: 'b'.repeat(64),
  decompileError: '', strings: [], callers: [], callees: [],
};
const evidence = { schemaVersion: 1, programName: 'fixture', programSha256: 'a'.repeat(64), functions: [fn] };
const proposal = {
  suggestedName: 'clear_value', summary: 'Writes zero through a pointer.', confidence: 0.8,
  evidence: ['Assignment *p = 0'], uncertainties: ['The actual pointee type is unknown.'],
};

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'nancy-agent-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

async function mockOllama(t, handler) {
  const server = createServer(handler);
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise((done) => {
    server.closeAllConnections();
    server.close(done);
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

function cli(script, args, env = {}) {
  return new Promise((done, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      env: { ...process.env, GHIDRA_HOME: '', OLLAMA_HOST: '', ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', (code) => done({ code, stdout, stderr }));
  });
}

test('agent validates evidence, addresses, proposals and endpoint origins', () => {
  assert.equal(validateEvidence(evidence), evidence);
  assert.equal(validateProposal(proposal), proposal);
  assert.throws(() => validateEvidence({ ...evidence, functions: [fn, fn] }), /duplicate/);
  assert.throws(() => validateEvidence({ ...evidence, functions: [] }), /1..100/);
  assert.throws(() => validateEvidence({ ...evidence, programSha256: 'bad' }), /SHA-256/);
  assert.throws(() => validateEvidence({ ...evidence, functions: [{ ...fn, code: 'x'.repeat(24001) }] }), /oversized/);
  for (const value of [
    { ...proposal, suggestedName: 'run();' }, { ...proposal, confidence: 2 },
    { ...proposal, confidence: '0.9' }, { ...proposal, evidence: [] },
    { ...proposal, command: 'curl' }, { ...proposal, summary: '' },
  ]) assert.throws(() => validateProposal(value));
  assert.equal(integer('10', 1, 100, 'limit'), 10);
  for (const value of ['NaN', '1.2', '-1', '101']) assert.throws(() => integer(value, 1, 100, 'limit'));
  assert.equal(ollamaHost('http://mentat:11484'), 'http://mentat:11484');
  for (const value of ['file:///tmp/x', 'http://user:pass@mentat', 'http://mentat/api/chat']) {
    assert.throws(() => ollamaHost(value));
  }
});

test('approval binds a successful proposal to exact function evidence', () => {
  const hash = digest(evidence);
  const record = { status: 'succeeded', evidenceHash: hash, functionHash: digest(fn), proposal };
  const approval = approvalFor(evidence, hash, fn, record);
  assert.equal(approval.originalName, fn.name);
  assert.equal(approval.proposalHash, digest(record));
  assert.match(approval.comment, /not verified/);
  assert.throws(() => approvalFor(evidence, hash, { ...fn, name: 'changed' }, record), /current/);
  assert.throws(() => approvalFor(evidence, hash, fn, { ...record, status: 'failed' }), /current/);
});

test('Ollama HTTP requests use structured output, bounded options and explicit failures', async (t) => {
  let mode = 'ok';
  const host = await mockOllama(t, async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : null;
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/tags') {
      res.end(JSON.stringify({ models: [{ name: 'test:14b', digest: 'model-digest' }] }));
    } else if (mode === 'redirect') {
      res.writeHead(302, { Location: '/elsewhere' }).end();
    } else if (mode === 'http') {
      res.writeHead(503).end('{}');
    } else if (mode === 'large') {
      res.end('x'.repeat(1024 * 1024 + 1));
    } else {
      assert.equal(body.stream, false);
      assert.equal(body.options.temperature, 0);
      assert.equal(body.format.type, 'object');
      const context = JSON.parse(body.messages[1].content);
      assert.equal(context.code, fn.code);
      assert.equal(context.contextLimited, true);
      res.end(JSON.stringify({
        done: true, done_reason: mode === 'truncated' ? 'length' : 'stop',
        message: { content: mode === 'invalid' ? '{}' : JSON.stringify(proposal) },
      }));
    }
  });
  assert.equal(await modelIdentity(host, 'test:14b'), 'model-digest');
  await assert.rejects(modelIdentity(host, 'missing'), /not installed/);
  assert.deepEqual(await propose(host, 'test:14b', fn), proposal);
  for (const failing of ['invalid', 'http', 'redirect', 'truncated', 'large']) {
    mode = failing;
    await assert.rejects(propose(host, 'test:14b', fn));
  }
  await assert.rejects(propose(host, 'test', { ...fn, decompileError: 'timeout' }), /successful/);
});

test('Ollama request deadline aborts an unresponsive server', async (t) => {
  const host = await mockOllama(t, () => {});
  await assert.rejects(requestJson(host, '/api/tags', undefined, 25), /abort|timeout/i);
});

test('CLI resumes, logs failures, locks state and requires explicit approval/apply', async (t) => {
  const dir = await fixture(t);
  const tools = join(dir, 'tools/agent');
  await mkdir(tools, { recursive: true });
  await cp(join(source, 'core.mjs'), join(tools, 'core.mjs'));
  await cp(join(source, 'cli.mjs'), join(tools, 'cli.mjs'));
  const script = join(tools, 'cli.mjs');
  const state = join(dir, 'local-data/analysis/agent');
  await saveJson(join(state, 'evidence.json'), evidence);
  let calls = 0;
  let invalid = true;
  const host = await mockOllama(t, async (req, res) => {
    for await (const chunk of req) { void chunk; }
    if (req.url === '/api/tags') {
      res.end(JSON.stringify({ models: [{ name: 'test', digest: 'id' }] }));
    } else {
      calls++;
      res.end(JSON.stringify({ done: true, message: { content: JSON.stringify(invalid ? {} : proposal) } }));
    }
  });
  const args = ['analyze', '--host', host, '--model', 'test', '--limit', '1'];
  let result = await cli(script, args);
  assert.equal(result.code, 1, result.stderr);
  assert.match(result.stderr, /Unexpected proposal/);
  result = await cli(script, args);
  assert.equal(result.code, 1, result.stderr);
  assert.match(result.stderr, /Unresolved/);
  assert.equal(calls, 1);
  invalid = false;
  result = await cli(script, [...args, '--retry-failed']);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(calls, 2);
  result = await cli(script, args);
  assert.equal(result.code, 0);
  assert.equal(calls, 2);
  result = await cli(script, ['approve', '--address', fn.address]);
  assert.equal(result.code, 0, result.stderr);
  const manifest = await loadJson(join(state, 'approvals.json'));
  assert.equal(manifest.approvals.length, 1);
  result = await cli(script, ['analyze', '--host', host, '--model', 'test', '--limit', '0']);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /integer from 1 to 100/);
  const metaPath = join(state, 'runs', digest(evidence), 'run.json');
  const metadata = await loadJson(metaPath);
  metadata.modelDigest = 'changed-digest';
  await saveJson(metaPath, metadata);
  result = await cli(script, args);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /identity changed/);
  result = await cli(script, ['apply']);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /confirm-apply/);
  manifest.approvals[0].suggestedName = 'tampered';
  await saveJson(join(state, 'approvals.json'), manifest);
  result = await cli(script, ['apply', '--confirm-apply']);
  assert.match(result.stderr, /no longer matches/);
  await saveJson(join(state, 'worker.lock'), { pid: 123 });
  result = await cli(script, ['status']);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /locked/);
  assert.ok(await readFile(join(state, 'worker.lock')));
});
