// [TEST SUITE — SIMULATED PROVIDER FIXTURES ONLY; NOT ACTUAL GEMINI-4-CARBON INFERENCE]
// All provider responses in this file use injected test doubles to verify loopback host guards,
// GAMMAFOLD_LIVE_MODE opt-in, session request budget, cooldown, concurrency locks, model identity
// quarantine, non-legacy secret redaction, public error boundaries, and live/static bundle safety.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { assertSafeServerBindHost } from '../server.ts';
import { SYNTHETIC_CAMPAIGNS } from '../src/domain/campaigns.ts';
import {
  FROZEN_R01_EVIDENCE_HASH,
  SYNTHETIC_EVIDENCE_PACKET,
  verifyFrozenPacketIntegrity,
} from '../src/domain/packet.ts';
import { verifyAndImportRecordedReview } from '../src/domain/recordedReview.ts';
import { createValidTestReviewFixture } from '../src/domain/testFixtures.ts';
import type {
  ModelErrorResponse,
  ModelReviewEnvelope,
  ModelStatusSnapshot,
} from '../src/domain/types.ts';
import { createApiApp } from './app.ts';
import { isLoopbackHost, isLoopbackRemoteAddress } from './config.ts';
import { createReviewService, type ReviewServiceDependencies } from './geminiService.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

async function withTestServer<T>(
  deps: ReviewServiceDependencies,
  run: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const reviewService = createReviewService({
    getLiveModeEnabled: () => true,
    cooldownMs: 0,
    maxLiveRequests: 10,
    ...deps,
    isSimulatedTestFixture: deps.isSimulatedTestFixture ?? true,
  });
  const app = createApiApp({ reviewService });
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    return await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test('loopback host & remote socket guards allow 127.0.0.1/::1 and refuse 0.0.0.0 or public interfaces', () => {
  assert.equal(assertSafeServerBindHost(undefined), '127.0.0.1');
  assert.equal(assertSafeServerBindHost('127.0.0.1'), '127.0.0.1');
  assert.equal(assertSafeServerBindHost('localhost'), 'localhost');
  assert.equal(assertSafeServerBindHost('::1'), '::1');
  assert.equal(isLoopbackHost('127.0.0.1'), true);
  assert.equal(isLoopbackHost('::1'), true);

  for (const unsafeHost of ['0.0.0.0', '::', '192.168.1.25', '10.0.0.5', 'gammafold.example.com']) {
    assert.equal(isLoopbackHost(unsafeHost), false);
    assert.throws(
      () => assertSafeServerBindHost(unsafeHost),
      /Refusing non-loopback server bind host/,
    );
  }

  assert.equal(isLoopbackRemoteAddress('127.0.0.1'), true);
  assert.equal(isLoopbackRemoteAddress('::1'), true);
  assert.equal(isLoopbackRemoteAddress('::ffff:127.0.0.1'), true);
  assert.equal(isLoopbackRemoteAddress('203.0.113.9'), false);
  assert.equal(isLoopbackRemoteAddress('::ffff:10.1.2.3'), false);
  assert.equal(isLoopbackRemoteAddress(undefined), false);
});

test('GET /api/packet returns frozen R01 packet, campaigns, and verified SHA-256 hash', async () => {
  await withTestServer({ getApiKey: () => '' }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/packet`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      application: string;
      evidenceHash: string;
      sourceImmutableVerified: boolean;
      campaigns: Array<{ id: string }>;
    };
    assert.equal(body.application, 'GammaFold Final');
    assert.equal(body.evidenceHash, FROZEN_R01_EVIDENCE_HASH);
    assert.equal(body.sourceImmutableVerified, true);
    assert.equal(body.campaigns.length, 2);
  });
});

test('GAMMAFOLD_LIVE_MODE is disabled by default even when GEMINI_API_KEY is present (503 LIVE_MODE_DISABLED, zero calls)', async () => {
  let providerCalled = false;

  await withTestServer(
    {
      getLiveModeEnabled: () => false,
      getApiKey: () => 'evt_test_key_valid_length_123456',
      getEnvModel: () => 'gemini-4-carbon',
      generateReview: async () => {
        providerCalled = true;
        return { text: '{}' };
      },
    },
    async (baseUrl) => {
      const statusRes = await fetch(`${baseUrl}/api/model-status`);
      const statusBody = (await statusRes.json()) as ModelStatusSnapshot;
      assert.equal(statusBody.hasApiKey, true);
      assert.equal(statusBody.liveModeEnabled, false);
      assert.equal(statusBody.listenHostPolicy, 'loopback_only');
      assert.equal(statusBody.runtimeAccessProven, false);

      const revRes = await fetch(`${baseUrl}/api/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: 'CAMP-SYNTH-R01' }),
      });
      assert.equal(revRes.status, 503);
      const errBody = (await revRes.json()) as ModelErrorResponse;
      assert.equal(errBody.errorCode, 'LIVE_MODE_DISABLED');
      assert.equal(providerCalled, false);
    },
  );
});

test('missing or placeholder GEMINI_API_KEY returns honest 503 MISSING_API_KEY without external call', async () => {
  let providerCalled = false;

  await withTestServer(
    {
      getApiKey: () => 'PLACEHOLDER_SERVER_SIDE_GEMINI_API_KEY',
      getEnvModel: () => 'gemini-4-carbon',
      generateReview: async () => {
        providerCalled = true;
        return { text: '{}' };
      },
    },
    async (baseUrl) => {
      const statusRes = await fetch(`${baseUrl}/api/model-status`);
      const statusBody = (await statusRes.json()) as ModelStatusSnapshot;
      assert.equal(statusBody.hasApiKey, false);
      assert.equal(statusBody.liveModeEnabled, true);
      assert.equal(statusBody.requestedModel, 'gemini-4-carbon');
      assert.equal(statusBody.fallbackDisabled, true);
      assert.equal(statusBody.runtimeAccessProven, false);

      const revRes = await fetch(`${baseUrl}/api/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: 'CAMP-SYNTH-R01' }),
      });
      assert.equal(revRes.status, 503);
      const errBody = (await revRes.json()) as ModelErrorResponse;
      assert.equal(errBody.errorCode, 'MISSING_API_KEY');
      assert.equal(errBody.requestedModel, 'gemini-4-carbon');
      assert.equal(providerCalled, false);
    },
  );
});

test('never falls back to Hydrogen/Flash and never echoes arbitrary GEMINI_MODEL env values in public responses', async () => {
  let providerCalled = false;

  await withTestServer(
    {
      getApiKey: () => 'test-fixture-nonsecret-token',
      getEnvModel: () => 'gemini-4-carbon',
      generateReview: async () => {
        providerCalled = true;
        return { text: '{}' };
      },
    },
    async (baseUrl) => {
      const resHydrogen = await fetch(`${baseUrl}/api/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: 'gemini-4-hydrogen' }),
      });
      assert.equal(resHydrogen.status, 400);
      assert.equal(((await resHydrogen.json()) as ModelErrorResponse).errorCode, 'MODEL_POLICY_VIOLATION');

      const resFlash = await fetch(`${baseUrl}/api/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: 'gemini-2.5-flash' }),
      });
      assert.equal(resFlash.status, 400);
      assert.equal(((await resFlash.json()) as ModelErrorResponse).errorCode, 'MODEL_POLICY_VIOLATION');
      assert.equal(providerCalled, false);
    },
  );

  const accidentalSecretInModelEnv = 'gemini-4-hydrogen-secret-token-xyz987';
  await withTestServer(
    {
      getApiKey: () => 'test-fixture-nonsecret-token',
      getEnvModel: () => accidentalSecretInModelEnv,
      generateReview: async () => {
        providerCalled = true;
        return { text: '{}' };
      },
    },
    async (baseUrl) => {
      const statusRes = await fetch(`${baseUrl}/api/model-status`);
      const statusText = await statusRes.text();
      assert.doesNotMatch(statusText, /xyz987/);
      const statusJson = JSON.parse(statusText) as ModelStatusSnapshot;
      assert.equal(statusJson.configuredEnvModel, '[DISALLOWED_MODEL_CONFIG]');

      const res = await fetch(`${baseUrl}/api/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(res.status, 503);
      const rawErrText = await res.text();
      assert.doesNotMatch(rawErrText, /xyz987/);
      const body = JSON.parse(rawErrText) as ModelErrorResponse;
      assert.equal(body.errorCode, 'INVALID_SERVER_MODEL_CONFIG');
      assert.equal(providerCalled, false);
    },
  );
});

test('enforces session request budget (429 SESSION_BUDGET_EXHAUSTED) and cooldown (429 COOLDOWN_ACTIVE)', async () => {
  let clockMs = 1_700_000_000_000;
  let calls = 0;

  await withTestServer(
    {
      getApiKey: () => 'test-fixture-nonsecret-token',
      getEnvModel: () => 'gemini-4-carbon',
      maxLiveRequests: 2,
      cooldownMs: 10_000,
      nowMs: () => clockMs,
      generateReview: async () => {
        calls += 1;
        return {
          text: JSON.stringify(createValidTestReviewFixture()),
          modelVersion: 'gemini-4-carbon',
        };
      },
    },
    async (baseUrl) => {
      // Request #1 succeeds
      const r1 = await fetch(`${baseUrl}/api/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: 'CAMP-SYNTH-R01' }),
      });
      assert.equal(r1.status, 200);
      assert.equal(calls, 1);

      // Immediate request #2 (only 2s elapsed < 10s cooldown) -> 429 COOLDOWN_ACTIVE, zero extra provider call
      clockMs += 2_000;
      const rCooldown = await fetch(`${baseUrl}/api/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: 'CAMP-SYNTH-R01' }),
      });
      assert.equal(rCooldown.status, 429);
      assert.equal(((await rCooldown.json()) as ModelErrorResponse).errorCode, 'COOLDOWN_ACTIVE');
      assert.equal(calls, 1);

      // Advance past cooldown -> Request #2 succeeds
      clockMs += 9_000;
      const r2 = await fetch(`${baseUrl}/api/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: 'CAMP-SYNTH-R01' }),
      });
      assert.equal(r2.status, 200);
      assert.equal(calls, 2);

      // Advance past cooldown again -> Request #3 blocked by maxLiveRequests = 2 -> 429 SESSION_BUDGET_EXHAUSTED
      clockMs += 15_000;
      const r3 = await fetch(`${baseUrl}/api/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: 'CAMP-SYNTH-R01' }),
      });
      assert.equal(r3.status, 429);
      assert.equal(
        ((await r3.json()) as ModelErrorResponse).errorCode,
        'SESSION_BUDGET_EXHAUSTED',
      );
      assert.equal(calls, 2);
    },
  );
});

test('rejects unexpected client fields, oversized payloads, and human-gate proposal campaign', async () => {
  await withTestServer(
    {
      getApiKey: () => 'test-fixture-nonsecret-token',
      getEnvModel: () => 'gemini-4-carbon',
    },
    async (baseUrl) => {
      const extraFieldRes = await fetch(`${baseUrl}/api/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packet: { mutated: true } }),
      });
      assert.equal(extraFieldRes.status, 400);

      const gateCampRes = await fetch(`${baseUrl}/api/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: 'CAMP-SYNTH-R02-GATE' }),
      });
      assert.equal(gateCampRes.status, 400);

      const hugeString = 'x'.repeat(20_000);
      const oversizedRes = await fetch(`${baseUrl}/api/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: hugeString }),
      });
      assert.equal(oversizedRes.status, 413);
    },
  );
});

async function sendRawLocalHttp(args: {
  port: number;
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
}): Promise<{
  status: number;
  headers: http.IncomingHttpHeaders;
  text: string;
}> {
  return await new Promise((resolve, reject) => {
    const payload = args.body !== undefined ? Buffer.from(args.body, 'utf8') : undefined;
    const reqHeaders: Record<string, string> = {
      ...(args.headers ?? {}),
    };
    if (payload !== undefined && reqHeaders['Content-Length'] === undefined) {
      reqHeaders['Content-Length'] = String(payload.byteLength);
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: args.port,
        method: args.method,
        path: args.path,
        headers: reqHeaders,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            text: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.on('error', reject);
    if (payload !== undefined) {
      req.write(payload);
    }
    req.end();
  });
}

test('Regression GF-V3-LOCAL-CROSS-ORIGIN-POST: rejects cross-origin, null-origin, text/plain, empty-body, and unknown/rebinding Host requests with zero fake-service calls while preserving legitimate local JSON requests', async () => {
  let fakeServiceCalls = 0;

  await withTestServer(
    {
      getApiKey: () => 'test-fixture-nonsecret-token',
      getEnvModel: () => 'gemini-4-carbon',
      generateReview: async () => {
        fakeServiceCalls += 1;
        return {
          text: JSON.stringify(createValidTestReviewFixture()),
          modelVersion: 'gemini-4-carbon',
        };
      },
    },
    async (baseUrl) => {
      const port = Number(new URL(baseUrl).port);
      const validHost = `127.0.0.1:${port}`;

      // 1. Exact reviewer probe: cross-origin text/plain body must fail before service invocation (0 calls)
      const exactProbe = await sendRawLocalHttp({
        port,
        method: 'POST',
        path: '/api/review',
        headers: {
          Host: validHost,
          Origin: 'https://unrelated.invalid',
          'Content-Type': 'text/plain',
        },
        body: 'not-json',
      });
      assert.equal(exactProbe.status, 403);
      assert.equal(exactProbe.headers['access-control-allow-origin'], undefined);
      assert.equal((JSON.parse(exactProbe.text) as ModelErrorResponse).errorCode, 'FORBIDDEN_ORIGIN');
      assert.equal(fakeServiceCalls, 0);

      // 2. Cross-origin, null-origin, cross-port origin, mismatched loopback host origin, Sec-Fetch-Site, and Referer
      const rejectedOriginCases: Array<Record<string, string>> = [
        {
          Host: validHost,
          Origin: 'https://unrelated.invalid',
          'Content-Type': 'application/json',
        },
        {
          Host: validHost,
          Origin: 'null',
          'Content-Type': 'application/json',
        },
        {
          Host: validHost,
          Origin: 'http://127.0.0.1:65432',
          'Content-Type': 'application/json',
        },
        {
          Host: validHost,
          Origin: `http://localhost:${port}`,
          'Content-Type': 'application/json',
        },
        {
          Host: validHost,
          'Sec-Fetch-Site': 'cross-site',
          'Content-Type': 'application/json',
        },
        {
          Host: validHost,
          Referer: 'https://unrelated.invalid/attack.html',
          'Content-Type': 'application/json',
        },
      ];

      for (const headers of rejectedOriginCases) {
        const res = await sendRawLocalHttp({
          port,
          method: 'POST',
          path: '/api/review',
          headers,
          body: JSON.stringify({ campaignId: 'CAMP-SYNTH-R01' }),
        });
        assert.equal(res.status, 403);
        assert.equal(res.headers['access-control-allow-origin'], undefined);
        assert.equal((JSON.parse(res.text) as ModelErrorResponse).errorCode, 'FORBIDDEN_ORIGIN');
        assert.doesNotMatch(res.text, /unrelated\.invalid/);
        assert.equal(fakeServiceCalls, 0);
      }

      // 3. CORS preflight OPTIONS grants zero CORS allowance and invokes zero service calls
      const preflight = await sendRawLocalHttp({
        port,
        method: 'OPTIONS',
        path: '/api/review',
        headers: {
          Host: validHost,
          Origin: 'https://unrelated.invalid',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type',
        },
      });
      assert.equal(preflight.status, 403);
      assert.equal(preflight.headers['access-control-allow-origin'], undefined);
      assert.equal(preflight.headers['access-control-allow-methods'], undefined);
      assert.equal(fakeServiceCalls, 0);

      // 4. Unknown / DNS-rebinding Host headers and mismatched Host ports must fail with 403 UNSAFE_HOST_BINDING
      const rejectedHosts = [
        `rebind.attacker.invalid:${port}`,
        'unknown.local',
        `127.0.0.1.nip.io:${port}`,
        `sub.localhost:${port}`,
        '127.0.0.1:65530',
      ];
      for (const badHost of rejectedHosts) {
        const res = await sendRawLocalHttp({
          port,
          method: 'POST',
          path: '/api/review',
          headers: {
            Host: badHost,
            Origin: `http://${badHost}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ campaignId: 'CAMP-SYNTH-R01' }),
        });
        assert.equal(res.status, 403);
        assert.equal((JSON.parse(res.text) as ModelErrorResponse).errorCode, 'UNSAFE_HOST_BINDING');
        assert.doesNotMatch(res.text, /rebind\.attacker|nip\.io/);
        assert.equal(fakeServiceCalls, 0);
      }

      // 5. Non-JSON Content-Type (text/plain, form-urlencoded, missing Content-Type) rejected with 415 and 0 calls
      for (const badContentType of [
        'text/plain',
        'text/plain; charset=utf-8',
        'application/x-www-form-urlencoded',
        'multipart/form-data; boundary=abc',
      ]) {
        const res = await sendRawLocalHttp({
          port,
          method: 'POST',
          path: '/api/review',
          headers: {
            Host: validHost,
            Origin: `http://${validHost}`,
            'Sec-Fetch-Site': 'same-origin',
            'Content-Type': badContentType,
          },
          body: JSON.stringify({ campaignId: 'CAMP-SYNTH-R01' }),
        });
        assert.equal(res.status, 415);
        assert.equal(
          (JSON.parse(res.text) as ModelErrorResponse).errorCode,
          'UNSUPPORTED_MEDIA_TYPE',
        );
        assert.equal(fakeServiceCalls, 0);
      }

      const missingCtRes = await sendRawLocalHttp({
        port,
        method: 'POST',
        path: '/api/review',
        headers: {
          Host: validHost,
        },
        body: JSON.stringify({ campaignId: 'CAMP-SYNTH-R01' }),
      });
      assert.equal(missingCtRes.status, 415);
      assert.equal(fakeServiceCalls, 0);

      // 6. Empty body or non-object JSON with application/json rejected with 400 and 0 calls
      for (const badJsonBody of ['', '   ', 'null', '[]', '"string"', '42']) {
        const res = await sendRawLocalHttp({
          port,
          method: 'POST',
          path: '/api/review',
          headers: {
            Host: validHost,
            'Content-Type': 'application/json',
          },
          body: badJsonBody,
        });
        assert.equal(res.status, 400);
        assert.equal((JSON.parse(res.text) as ModelErrorResponse).errorCode, 'BAD_REQUEST');
        assert.equal(fakeServiceCalls, 0);
      }

      // 7. Legitimate same-origin local frontend POST (127.0.0.1 and localhost) succeeds
      const sameOriginBrowserRes = await sendRawLocalHttp({
        port,
        method: 'POST',
        path: '/api/review',
        headers: {
          Host: validHost,
          Origin: `http://${validHost}`,
          'Sec-Fetch-Site': 'same-origin',
          Referer: `http://${validHost}/`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ campaignId: 'CAMP-SYNTH-R01', modelId: 'gemini-4-carbon' }),
      });
      assert.equal(sameOriginBrowserRes.status, 200);
      assert.equal(fakeServiceCalls, 1);

      const localhostAuthority = `localhost:${port}`;
      const localhostBrowserRes = await sendRawLocalHttp({
        port,
        method: 'POST',
        path: '/api/review',
        headers: {
          Host: localhostAuthority,
          Origin: `http://${localhostAuthority}`,
          'Sec-Fetch-Site': 'same-origin',
          Referer: `http://${localhostAuthority}/`,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({ campaignId: 'CAMP-SYNTH-R01' }),
      });
      assert.equal(localhostBrowserRes.status, 200);
      assert.equal(fakeServiceCalls, 2);

      // 8. Authorized direct local JSON client (no Origin / Sec-Fetch-Site) succeeds
      const directLocalRes = await fetch(`${baseUrl}/api/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: 'CAMP-SYNTH-R01' }),
      });
      assert.equal(directLocalRes.status, 200);
      assert.equal(fakeServiceCalls, 3);
    },
  );
});

test('quarantines non-Carbon returned modelVersion, handles unreported modelVersion honestly, and validates 3.0.0 output', async () => {
  let mode:
    | 'empty'
    | 'bad_json'
    | 'bad_validation'
    | 'non_carbon_version'
    | 'unreported_version'
    | 'verified_carbon_double' = 'empty';

  await withTestServer(
    {
      getApiKey: () => 'test-fixture-nonsecret-token',
      getEnvModel: () => 'gemini-4-carbon',
      isSimulatedTestFixture: false, // Exercise exact runtime receipt & modelIdentityStatus branches using local stub
      generateReview: async () => {
        if (mode === 'empty') return { text: '   ' };
        if (mode === 'bad_json') return { text: '{"summary": "unterminated' };
        if (mode === 'bad_validation') {
          const invalidFixture = createValidTestReviewFixture();
          invalidFixture.proposedActions[0].assaySlots = 4; // total becomes 6 > 4
          invalidFixture.evidenceFindings[0].sourceIds.push('O99');
          invalidFixture.evidenceFindings[1].claim = 'O02 measured 0.55 RFU.';
          return { text: JSON.stringify(invalidFixture), modelVersion: 'gemini-4-carbon' };
        }
        if (mode === 'non_carbon_version') {
          return {
            text: JSON.stringify(createValidTestReviewFixture()),
            modelVersion: 'gemini-4-hydrogen',
          };
        }
        if (mode === 'unreported_version') {
          return {
            text: JSON.stringify(createValidTestReviewFixture()),
            modelVersion: undefined,
          };
        }
        return {
          text: JSON.stringify(createValidTestReviewFixture()),
          modelVersion: 'gemini-4-carbon',
        };
      },
    },
    async (baseUrl) => {
      const resEmpty = await fetch(`${baseUrl}/api/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(resEmpty.status, 502);
      assert.equal(((await resEmpty.json()) as ModelErrorResponse).errorCode, 'MALFORMED_RESPONSE');

      mode = 'bad_json';
      const resBadJson = await fetch(`${baseUrl}/api/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(resBadJson.status, 502);
      assert.equal(((await resBadJson.json()) as ModelErrorResponse).errorCode, 'MALFORMED_RESPONSE');

      mode = 'bad_validation';
      const resInvalid = await fetch(`${baseUrl}/api/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(resInvalid.status, 200);
      const invalidEnv = (await resInvalid.json()) as ModelReviewEnvelope;
      assert.equal(invalidEnv.responseStatus, 'validation_failed');
      assert.equal(invalidEnv.review, null);
      assert.ok(invalidEnv.validation.issues.some((i) => i.code === 'BUDGET_EXCEEDED'));
      assert.ok(invalidEnv.validation.issues.some((i) => i.code === 'UNKNOWN_SOURCE_ID'));
      assert.ok(invalidEnv.validation.issues.some((i) => i.code === 'RECORD_VALUE_MISMATCH'));
      assert.equal(verifyFrozenPacketIntegrity(), true);

      // Non-Carbon returnedModelVersion must be quarantined with review=null and runtimeAccessProven=false
      mode = 'non_carbon_version';
      const resNonCarbon = await fetch(`${baseUrl}/api/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(resNonCarbon.status, 200);
      const nonCarbonEnv = (await resNonCarbon.json()) as ModelReviewEnvelope;
      assert.equal(nonCarbonEnv.responseStatus, 'validation_failed');
      assert.equal(nonCarbonEnv.review, null);
      assert.equal(nonCarbonEnv.returnedModelVersion, 'gemini-4-hydrogen');
      assert.equal(nonCarbonEnv.modelIdentityStatus, 'non_carbon_mismatch');
      assert.equal(nonCarbonEnv.runtimeAccessProven, false);
      assert.equal(nonCarbonEnv.validation.checks.modelIdentityValid, false);
      assert.ok(
        nonCarbonEnv.validation.issues.some((i) => i.code === 'MODEL_IDENTITY_MISMATCH'),
      );

      // Absent modelVersion must keep returnedModelVersion=null and runtimeAccessProven=false
      mode = 'unreported_version';
      const resUnreported = await fetch(`${baseUrl}/api/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(resUnreported.status, 200);
      const unrepEnv = (await resUnreported.json()) as ModelReviewEnvelope;
      assert.equal(unrepEnv.responseStatus, 'validated');
      assert.equal(unrepEnv.returnedModelVersion, null);
      assert.equal(unrepEnv.returnedModelVersionReported, false);
      assert.equal(unrepEnv.modelIdentityStatus, 'unreported');
      assert.equal(unrepEnv.runtimeAccessProven, false);
      assert.ok(unrepEnv.review);

      // Verified Carbon modelVersion sets runtimeAccessProven=true
      mode = 'verified_carbon_double';
      const resVerified = await fetch(`${baseUrl}/api/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(resVerified.status, 200);
      const verEnv = (await resVerified.json()) as ModelReviewEnvelope;
      assert.equal(verEnv.responseStatus, 'validated');
      assert.equal(verEnv.returnedModelVersion, 'gemini-4-carbon');
      assert.equal(verEnv.modelIdentityStatus, 'verified_carbon');
      assert.equal(verEnv.runtimeAccessProven, true);
      assert.ok(verEnv.review);
    },
  );
});

test('withholds raw upstream error strings from public HTTP responses and redacts non-AIza opaque keys in local diagnostics', async () => {
  await withTestServer(
    {
      getApiKey: () => 'test-fixture-nonsecret-token',
      getEnvModel: () => 'gemini-4-carbon',
      timeoutMs: 45,
      generateReview: async ({ abortSignal }) => {
        await new Promise<void>((_resolve, reject) => {
          abortSignal.addEventListener('abort', () => {
            const abortErr = new Error('The operation was aborted');
            abortErr.name = 'AbortError';
            reject(abortErr);
          });
        });
        return { text: '{}' };
      },
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(res.status, 504);
      assert.equal(((await res.json()) as ModelErrorResponse).errorCode, 'TIMEOUT');
    },
  );

  const nonLegacyOpaqueSecret = 'evt_nonlegacy_opaque_secret_9f8e7d6c5b4a';
  const capturedDiagnostics: string[] = [];
  let errorKind: '429' | '403' | '404' | '500_opaque_secret' = '429';

  await withTestServer(
    {
      getApiKey: () => nonLegacyOpaqueSecret,
      getEnvModel: () => 'gemini-4-carbon',
      onLocalDiagnostic: (msg) => capturedDiagnostics.push(msg),
      generateReview: async () => {
        if (errorKind === '429') {
          throw Object.assign(
            new Error(`RESOURCE_EXHAUSTED for credential ${nonLegacyOpaqueSecret}`),
            { status: 429 },
          );
        }
        if (errorKind === '403') {
          throw Object.assign(
            new Error(`PERMISSION_DENIED on token ${nonLegacyOpaqueSecret}`),
            { status: 403 },
          );
        }
        if (errorKind === '404') {
          throw Object.assign(new Error('NOT_FOUND: model gemini-4-carbon not found'), {
            status: 404,
          });
        }
        throw new Error(
          `UpstreamGatewayTrace9912: auth failed for x-goog-api-key=${nonLegacyOpaqueSecret} and encoded=${encodeURIComponent(nonLegacyOpaqueSecret)}`,
        );
      },
    },
    async (baseUrl) => {
      const r429 = await fetch(`${baseUrl}/api/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(r429.status, 429);
      const t429 = await r429.text();
      assert.doesNotMatch(t429, new RegExp(nonLegacyOpaqueSecret));
      assert.equal((JSON.parse(t429) as ModelErrorResponse).errorCode, 'QUOTA_EXCEEDED');

      errorKind = '403';
      const r403 = await fetch(`${baseUrl}/api/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(r403.status, 403);
      const t403 = await r403.text();
      assert.doesNotMatch(t403, new RegExp(nonLegacyOpaqueSecret));
      assert.equal((JSON.parse(t403) as ModelErrorResponse).errorCode, 'PERMISSION_DENIED');

      errorKind = '404';
      const r404 = await fetch(`${baseUrl}/api/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(r404.status, 404);
      assert.equal(((await r404.json()) as ModelErrorResponse).errorCode, 'MODEL_UNAVAILABLE');

      errorKind = '500_opaque_secret';
      const r500 = await fetch(`${baseUrl}/api/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(r500.status, 500);
      const raw500Text = await r500.text();
      // Public response must contain NEITHER the opaque non-AIza secret NOR raw upstream trace text
      assert.doesNotMatch(raw500Text, new RegExp(nonLegacyOpaqueSecret));
      assert.doesNotMatch(raw500Text, /UpstreamGatewayTrace9912/);
      const b500 = JSON.parse(raw500Text) as ModelErrorResponse;
      assert.equal(b500.errorCode, 'INTERNAL_ERROR');

      // Local diagnostics must have redacted the exact configured non-AIza secret
      assert.ok(capturedDiagnostics.length >= 4);
      for (const diag of capturedDiagnostics) {
        assert.doesNotMatch(diag, new RegExp(nonLegacyOpaqueSecret));
      }
      assert.ok(capturedDiagnostics.some((d) => d.includes('[REDACTED_SECRET]')));
    },
  );
});

test('enforces single concurrent request lock (409 REQUEST_IN_FLIGHT) on parallel clicks and releases cleanly', async () => {
  let releaseFirst!: () => void;
  let markEntered!: () => void;
  const enteredPromise = new Promise<void>((resolve) => {
    markEntered = resolve;
  });

  await withTestServer(
    {
      getApiKey: () => 'test-fixture-nonsecret-token',
      getEnvModel: () => 'gemini-4-carbon',
      generateReview: async () => {
        markEntered();
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
        return {
          text: JSON.stringify(createValidTestReviewFixture()),
          modelVersion: 'gemini-4-carbon',
        };
      },
    },
    async (baseUrl) => {
      const firstPromise = fetch(`${baseUrl}/api/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      await enteredPromise;

      const secondRes = await fetch(`${baseUrl}/api/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(secondRes.status, 409);
      const secondBody = (await secondRes.json()) as ModelErrorResponse;
      assert.equal(secondBody.errorCode, 'REQUEST_IN_FLIGHT');

      releaseFirst();
      const firstRes = await firstPromise;
      assert.equal(firstRes.status, 200);

      const thirdPromise = fetch(`${baseUrl}/api/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      await new Promise((r) => setTimeout(r, 15));
      releaseFirst();
      const thirdRes = await thirdPromise;
      assert.equal(thirdRes.status, 200);
    },
  );
});

test('built dist/ and dist-static/ bundles are credential-free, use relative paths, exclude SDK, and reject fabricated recordings', () => {
  const publicRecordingPath = path.join(
    PROJECT_ROOT,
    'public',
    'recorded',
    'carbon-review-R01.json',
  );
  const hasPublicRecording = fs.existsSync(publicRecordingPath);
  if (hasPublicRecording) {
    const rawRecording = fs.readFileSync(publicRecordingPath, 'utf8');
    assert.doesNotMatch(rawRecording, /AIza[0-9A-Za-z_-]{16,}/);
    assert.doesNotMatch(rawRecording, /TEST FIXTURE|SIMULATED/i);
    const verified = verifyAndImportRecordedReview(
      JSON.parse(rawRecording),
      SYNTHETIC_CAMPAIGNS[0],
      SYNTHETIC_EVIDENCE_PACKET,
    );
    assert.equal(
      verified.outcome,
      'loaded',
      'Any bundled public/recorded/carbon-review-R01.json must pass full 3.0.0 Carbon provenance and deterministic validation',
    );
  }

  for (const dirName of ['dist', 'dist-static'] as const) {
    const outDir = path.join(PROJECT_ROOT, dirName);
    if (!fs.existsSync(outDir)) continue;

    const indexHtml = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
    assert.match(indexHtml, /<title>GammaFold Final<\/title>/);
    assert.match(indexHtml, /\.\/assets\//, `${dirName}/index.html must use relative ./assets/ paths`);
    assert.doesNotMatch(
      indexHtml,
      /(?:src|href)="\/assets\//,
      `${dirName}/index.html must not use root-absolute /assets/ paths`,
    );

    const assetsDir = path.join(outDir, 'assets');
    const assetFiles = fs.readdirSync(assetsDir);
    assert.ok(assetFiles.length > 0);

    for (const file of assetFiles) {
      const content = fs.readFileSync(path.join(assetsDir, file), 'utf8');
      assert.doesNotMatch(content, /AIza[0-9A-Za-z_-]{16,}/);
      assert.doesNotMatch(content, /GoogleGenAI/);
      assert.doesNotMatch(content, /PLACEHOLDER_SERVER_SIDE_GEMINI_API_KEY/);
      assert.doesNotMatch(content, /firebase-applet-config/);

      if (dirName === 'dist-static') {
        assert.doesNotMatch(
          content,
          /\/api\/(?:review|model-status|packet)/,
          'dist-static bundle must eliminate all /api/* backend endpoints',
        );
      }
    }

    const builtRecordingPath = path.join(outDir, 'recorded', 'carbon-review-R01.json');
    assert.equal(
      fs.existsSync(builtRecordingPath),
      hasPublicRecording,
      `${dirName}/recorded/carbon-review-R01.json presence must match verified public/recorded/carbon-review-R01.json`,
    );
  }
});
