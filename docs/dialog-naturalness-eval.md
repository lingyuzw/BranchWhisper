# Dialog Naturalness Evaluation

This lightweight evaluation checks dialog samples for common failures that make replies feel artificial:

- unprompted long-term memory recall in ordinary chat
- hidden memory detail leaks even when the reply avoids fixed recall phrases
- scripted customer-service tone in ordinary chat
- fabricated personal memory when no evidence exists
- AI-cliche disclaimers
- fabricated real-world actions or locations
- repetitive openings

Run from the repository root:

```bash
/home/me/miniconda3/bin/conda run -n qwen3-asr python scripts/evaluate_dialog_naturalness.py
```

Write a JSON report:

```bash
/home/me/miniconda3/bin/conda run -n qwen3-asr python scripts/evaluate_dialog_naturalness.py --output runtime/dialog-naturalness-report.json
```

Print a human-readable triage report:

```bash
/home/me/miniconda3/bin/conda run -n qwen3-asr python scripts/evaluate_dialog_naturalness.py --format text
```

Replay the prompt-building path while still using fixture replies:

```bash
/home/me/miniconda3/bin/conda run -n qwen3-asr python scripts/evaluate_dialog_naturalness.py --replay-fixture-replies --format text
```

Replay against a live OpenAI-compatible model endpoint:

```bash
/home/me/miniconda3/bin/conda run -n qwen3-asr python scripts/evaluate_dialog_naturalness.py --live-url http://127.0.0.1:8080/v1/chat/completions --live-model qwen3.5-9b --limit 5 --format text --allow-failures
```

Live replay is optional and is not part of the default quality gate, because local model services
may be offline during development. Live replay skips `expect_fail` samples by default; pass
`--include-expected-failures` only when testing the evaluator rules themselves.
If the model endpoint is unavailable, the report marks the affected samples with
`live_replay_error` instead of crashing.

For repeated live checks, use the wrapper script. It writes a text report to
`runtime/dialog-naturalness-live-report.txt` by default:

```bash
/home/me/miniconda3/bin/conda run -n qwen3-asr python scripts/replay_dialog_naturalness.py --live-url http://127.0.0.1:8080/v1/chat/completions --live-model qwen3.5-9b --limit 5 --allow-failures
```

The report includes a `summary` block with category totals and rule hit counts, so regressions can
be triaged without reading every sample result.

The first version is deterministic and offline. It evaluates curated sample outputs in
`backend/tests/fixtures/dialog_naturalness_samples.json`.

Samples can include `seed_memories`. The evaluator will build the same request messages used by
the dialog runtime and report prompt checks under `prompt`. This catches two high-value failures
before any live model call:

- ordinary chat should not receive long-term memory context
- explicit memory lookup should receive quiet internal memory context

A later phase can plug in live LLM responses and feed them through the same rules.

Samples can also set `expect_fail: true` for negative examples. In that case the suite passes only
when the evaluator actually catches an issue, and the report keeps both fields:

- `actual_passed`: whether the reply itself passed all rules
- `passed`: whether the sample behaved as expected by the suite
