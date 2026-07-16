# MRIAgent Public Monitor

Public, read-only aggregate monitor for the 3,906-study formal experiment.

- No case-level table or identifiers are published.
- The page shows center-level stages, intermediate artifact counts, LGE completion, report throughput/ETA, worker state, GPU snapshots, and unresolved error counts.
- The server privacy gate accepts only the `monitor_safe_v2` aggregate schema and rejects paths, identifiers, clinical text, tracebacks, and credentials.

Public, read-only progress dashboard for the 3,924-study usable multi-centre MRIAgent experiment.

This repository contains only an anonymized, schema-limited status snapshot. It does not contain raw identifiers, clinical evidence, reports, server paths, logs, credentials, or private mappings.
