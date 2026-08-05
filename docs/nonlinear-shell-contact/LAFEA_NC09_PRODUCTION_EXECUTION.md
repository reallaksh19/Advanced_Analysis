# LAFEA-NC NC-09 — Production Execution Authorization Contract

NC-09 governs controlled production execution of an exact NC-08 qualified module build. It does not permit autonomous case disposition, automatic asset acceptance, or automatic fitness-for-service decisions.

## Pinned scope

Each production deployment is immutably bound to the qualified module build, signed artifact, provenance, isolated environment, configuration, secrets policy, access policy, audit sink, rollback artifact, backup policy, runbook, operator roster, release approval, change ticket, and time-bounded authorization window.

External connectivity and autonomous disposition are disabled on the governed execution path. Authorization requires least privilege, independent approvers, separation of duties, explicit promotion, tamper-evident audit, tested backup and rollback, incident drills, kill-switch testing, current operator competence, expiry, revocation testing, and scheduled requalification.

## Required evidence

Ten domains cover module-receipt binding, environment custody, artifact provenance, access control, change approval, observability, recovery, incident response, operator competence, and authorization expiry. Recovery objectives, audit gaps, critical findings, approver counts, drills, and rollback tests are bounded by contract.

A fully evidenced deployment may set `productionExecutionAuthorized` for the registered deployment identity only. It never grants case-specific engineering disposition.

## Exclusions

Autonomous case disposition, automatic asset acceptance, fitness for service, remaining strength, failure pressure, and merge authority remain excluded.
