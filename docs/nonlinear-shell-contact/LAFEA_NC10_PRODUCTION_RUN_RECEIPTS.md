# LAFEA-NC NC-10 — Governed Production Run Receipts

NC-10 governs each actual execution performed under an NC-09 authorized deployment. Deployment authorization alone does not establish that a particular run used the approved build, configuration, inputs, operator, execution window, parser, reconstruction path, or review process.

## Pinned scope

Every run receives a unique immutable identity bound to one authorized deployment, one module build, one case package, one input archive, one execution request and receipt, one raw-output manifest, one parser inventory, one reconstruction, one calculation ledger, one operator identity, and one execution window. Retries create new linked receipts; no receipt may be overwritten.

## Required evidence

The gate requires exact deployment authorization, immutable input custody, exact build and configuration matching, successful completion and zero exit status, complete raw artifacts, parser coverage, independent reconstruction, warning and exception closure, two-person technical review, owner disposition, and retention scheduling.

## Authority boundary

NC-10 never authorizes autonomous case disposition, automatic asset acceptance, fitness-for-service, remaining strength, failure pressure, production-policy mutation, or merging. A contract replay can qualify only the receipt schema and evaluator. Actual run-receipt authority requires complete external evidence.
