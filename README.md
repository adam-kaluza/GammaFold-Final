# GammaFold

An isolated hackathon prototype for inspecting the evidence behind an AI-written review. It combines a campaign workbench with source-linked Carbon interpretation, explicit uncertainty and exportable review packets.

**Demonstration data is synthetic.** This is not a laboratory result, biological validation or a production DeltaFold feature.

The permanent project name is **GammaFold**. Existing repository and demo URL paths are retained for link compatibility. See [rename and compatibility notes](RENAME.md).

## Demo status

The `docs/` directory contains the built static demonstration for GitHub Pages. It loads a **recorded result from a real `gemini-4-carbon` call** completed on November 14, 2026 at **12:41:37.031 UTC / 04:41:37.031 PST**. Loading that recording does not make a new model request.

- Public repository: <https://github.com/adam-kaluza/GammaFold-Final> — verified accessible while signed out.
- Working demonstration: <https://adam-kaluza.github.io/GammaFold-Final/> — recorded review, citation inspection and JSON export verified while signed out.
- [Two-minute introduction and pitch](https://youtu.be/SoGFYoUQeNk) and [one-minute prototype walkthrough](https://youtu.be/TsCE2Sqa3og) are public, captioned recordings of real application behavior. Both use a genuine recorded model response and make no new live inference claim.
- Competition submission, personal attendance, awards and advancement are separate from publication of this demo.

## Try the workflow

1. Inspect the frozen synthetic packet and open a source record.
2. Compare a valid zero with failed, missing and censored observations; predictions remain separate.
3. Load the recorded Carbon review. Follow a citation to inspect the underlying evidence.
4. Read the unsupported-claim audit and limitations. Proposed actions require human review.
5. Export the review packet with source identity, model information, original response time and validation metadata.

The review checks structured facts against the exact cited record and constrains proposals to four slots. Free-text screening is bounded; it does not guarantee that every interpretation is correct.

## Reproduce locally

Verified runtime: Node.js 24.22.1. Dependencies are pinned by `package-lock.json`.

```text
npm ci
npm run lint
npm run build
npm run build:static
npm test
npm run preview:static -- --host 127.0.0.1
```

Open the local URL printed by the preview command. The static version requires no credentials. The test suite includes bundle checks, so build both versions before running the full suite.

For a local live demonstration, the server requires a separately authorized account that actually has access to `gemini-4-carbon`. Supply credentials through the server environment only; use `.env.example` for configuration names and safe defaults. Live calls require explicit opt-in and are bounded by a session budget, cooldown and concurrency lock. The server binds only to loopback. Do not enable billing or assume that a model name grants access. Temporary event credentials are not included and must not support ongoing commercial workloads.

## Verified software evidence

- Original November 14 automated suite: **28 passed, 0 failed**. Current rename verification is recorded in [RENAME.md](RENAME.md).
- Reported final typecheck and both production builds: passed.
- Actual final runtime: HTTP 200, requested and returned model `gemini-4-carbon`, v3 review validated with no issues.
- Recorded artifact: independently imported successfully; replay retains the original timestamp and does not claim new inference.

Failure tests use simulated responses. They are distinct from the genuine recorded result. Desktop and mobile rendering, campaign isolation, reset, citation inspection and exported replay metadata were checked. The public source and hosted recording were also verified signed out. Video publication and competition submission are separate results.

See [architecture](ARCHITECTURE.md), [limitations and data boundaries](LIMITATIONS.md), [attribution](ATTRIBUTION.md), [sanitized provenance](provenance.json), and [source/build hashes](SOURCE_SHA256.json). The original Hydrogen prototypes and preexisting DeltaFold are disclosed separately from the Carbon-authored integration. No license for the project's original source is added by this preparation; dependency notices retain their own terms.
