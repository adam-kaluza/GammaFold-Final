# Architecture

GammaFold Final provides one path from a synthetic campaign to an inspectable review and export.

```text
Frozen source packet
  -> deterministic source summary and source inspector
  -> local Carbon review OR verified recorded replay
  -> structured-fact, citation, budget and model-identity checks
  -> limitations, claim audit and proposed actions
  -> export with source hash and original model-result time
```

## Evidence and review

`src/domain/packet.ts` contains the immutable `SYNTH-PKT-R01` example. Six fictional candidates have three exact observations, including one valid zero; one failed observation; one missing observation; and one censored bound. Prior predictions remain separate from observations. The canonical packet hash is `cdb881a51245d8065c2b22a14e6c9cc8ee21d2375f8e0c0c0be2ccc7a7494bff`.

The v3 review contract separates structured facts from narrative interpretation. Checks compare record, field, status, qualifier, value and units against the cited source. They also validate identifiers, the required unsupported-claim audit and a four-slot proposal budget. Free-text screening catches specified error patterns and remains limited.

Campaign and packet binding prevent exporting a review under a different campaign or source. Request generations and cancellation discard stale completions when switching or resetting.

## Two execution modes

- **Static replay:** `docs/` is the built GitHub Pages payload. It contains no provider SDK or live `/api/` endpoint. The genuine recorded export is loaded, checked again and labelled recorded. Re-export retains its original runtime and initial-export times separately from the new download time.
- **Local live mode:** an Express server sends only the fixed synthetic packet to `gemini-4-carbon` through the server-side Google Gen AI SDK. Live operation is off by default, uses a separately supplied authorized credential and binds to loopback. Host/origin/media-type checks precede dispatch. A session request cap, cooldown and single-request lock bound use. The application does not silently substitute another model.

Non-Carbon returned model identifiers are quarantined. If the provider omits its version identifier, the application does not claim verified Carbon runtime access. Invalid review output is withheld from a usable export.

## Interface and persistence

React presents the campaign workbench, evidence table, source inspector, review, reference illustration and provenance. Selected campaign and reviewer notes are stored locally in the browser. The static app does not send those notes to a model service. Reset clears its local saved state. External font files are requested from Google Fonts; a static replay is not a claim of completely offline loading.

The reference illustration is a schematic annotation, not experimental coordinates or a structure calculation for the fictional candidates.
