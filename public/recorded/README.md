# Static Recorded Carbon Review Asset Contract

This directory holds the optional post-correction recorded `gemini-4-carbon` review artifact used by the credential-free static GitHub Pages build (`npm run build:static` -> `dist-static/`).

## Expected Asset Path & Relative Fetch URL

- **Source file before `npm run build:static`:** `public/recorded/carbon-review-R01.json`
- **Built static bundle path:** `dist-static/recorded/carbon-review-R01.json` (and `dist/recorded/carbon-review-R01.json`)
- **Relative browser fetch URL:** `./recorded/carbon-review-R01.json`
- **Current verified `3.0.0` artifact:** Genuine `gemini-4-carbon` loopback runtime export for `CAMP-SYNTH-R01` (`originalRuntimeTimestamp: "2026-11-14T12:41:37.031Z"`, `exportedAt: "2026-11-14T12:41:37.117Z"`, `returnedModelVersion: "gemini-4-carbon"`, `SHA-256: b9e76479f3ba828225dea51a0ea9b2f790c5107f69a34729932be1afdbc5c051`).

No fabricated or simulated recording file is ever permitted here. If `carbon-review-R01.json` is removed or absent, clicking **"Load recorded Carbon review"** reports an honest `RECORDED_REVIEW_UNAVAILABLE` state while keeping frozen packet inspection, deterministic checks, the benign `1UBQ` topology schematic, campaign stage gates, and offline JSON packet export fully functional. Simulated `[TEST FIXTURE]` payloads and pre-correction `2.0.0` exports are strictly rejected.

## Required Schema & Verification Rules (`3.0.0`)

`verifyAndImportRecordedReview` in `src/domain/recordedReview.ts` verifies all of the following before rendering any recorded output:

1. **Schema version:** `exportSchemaVersion: "3.0.0"` (`ExportReviewPacket` downloaded via **Export Packet** after a live `gemini-4-carbon` run on `CAMP-SYNTH-R01`) or `envelopeSchemaVersion: "3.0.0"` (`ModelReviewEnvelope` returned by the local review endpoint).
2. **Application & campaign binding:** `application === "GammaFold"` for new exports; the preserved original recording retains the accepted legacy application name, `campaign.campaignId === "CAMP-SYNTH-R01"`, and `sourceIntegrity.packetId === "SYNTH-PKT-R01"`.
3. **Immutable SHA-256 lock:** `sourceIntegrity.evidenceHash`, `sourceIntegrity.recomputedEvidenceHash`, and the recomputed SHA-256 of the embedded `sourcePacket` must all equal `cdb881a51245d8065c2b22a14e6c9cc8ee21d2375f8e0c0c0be2ccc7a7494bff`.
4. **Verified Carbon provenance:** `requestedModel === "gemini-4-carbon"`, `returnedModelVersion` verified as Carbon (`verifyReturnedModelIdentity`), original `runtimeAccessProven: true` (or `originalRecordedRuntimeAccessProven: true`), valid ISO-8601 `originalRuntimeTimestamp` (and `exportedAt`), and zero `[TEST FIXTURE]` / `isSimulatedTestFixture` markers.
5. **Full deterministic re-validation:** `modelOutput` (`ReviewOutput`) is re-run through `validateReviewOutput` (`3.0.0` structured `FactAssertion` verification, citation check, 4-slot budget check, `AUDIT-CLAIM-01` refutation check, and narrative screening). Any mismatch quarantines the artifact (`responseStatus: "validation_failed"`, `review: null`).

## Permanent project name

The current project is **GammaFold**. The original November 14 recording remains byte-for-byte unchanged, including the historical application identifier, because it is runtime evidence. Loading and re-exporting it uses the current name while preserving the original model-result and source-export timestamps.
