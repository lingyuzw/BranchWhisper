# Dialog Naturalness Evaluation

This lightweight evaluation checks dialog samples for common failures that make replies feel artificial:

- unprompted long-term memory recall in ordinary chat
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

The first version is deterministic and offline. It evaluates curated sample outputs in
`backend/tests/fixtures/dialog_naturalness_samples.json`. A later phase can plug in live LLM
responses and feed them through the same rules.
