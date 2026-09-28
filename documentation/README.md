# SonicSentinel AI Documentation

This folder contains the project documentation and visual showcase package.

## Start here

- [Verification report](./VERIFICATION_REPORT.md) — what was tested, what passes, what is
  **not** supported by evidence. Read this first.
- [Developer guide](./DEVELOPER_GUIDE.md) — setup, architecture, ML engine internals, API,
  config, deployment, known debt.
- [User guide](./USER_GUIDE.md) — end-user and admin guide.
- [Flow diagrams](./diagrams/flow-diagrams.md) — 8 Mermaid diagrams derived from the source
  code, each citing its implementing file and lines.

## Primary deliverables

- [Project documentation PDF](./SonicSentinel_Project_Documentation.pdf)
- [Project documentation PowerPoint](./SonicSentinel_Project_Documentation.pptx)
- [Project report](./Project_Report.md)
- [Technical blog](./Technical_Blog.md)
- [SRS compliance matrix](./SRS_COMPLIANCE_MATRIX.md)
- [API documentation](./API_DOCUMENTATION.md)
- [AI usage disclosure](./AI_USAGE.md)

## Open gap — dataset provenance

There is currently **no dataset provenance record**. No download script, no source manifest,
no licence file, and no training corpus exists in this repository, and no file anywhere
mentions Freesound, Pixabay, ElevenLabs, Urban8k, or ESC-50.

To close the gap from evidence rather than assertion:

```bash
python ml-service/tools/dataset_provenance.py --root "C:/path/to/actual/corpus" \
  --out documentation/dataset/evidence
```

Then complete the blank source, licence, synthesis, ethics, and split tables in the generated
`provenance.md` from your actual download history. See finding **D-2** in the verification
report.

## Evidence folders

- `diagrams/` — `flow-diagrams.md` holds code-derived architecture and flow diagrams. The
  remaining `.md` briefs in this folder are placeholders pending replacement.
- `graphs/` — reserved for verified evaluation and operational charts
- `screenshots/` — reserved for verified browser captures
- `model-evidence/` — model artifacts and evaluation evidence
- `dataset/` — dataset provenance and preprocessing evidence
- `testing/` — automated and manual verification evidence

Implementation-dependent claims are marked **PENDING VERIFICATION** where a saved artifact is not available. This prevents the documentation from presenting invented metrics or screenshots as production evidence.
