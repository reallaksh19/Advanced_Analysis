# WP-AC2 — LAFEA preparation evidence and solve-authorization boundary

WP-AC2 implements issue #850 on top of the canonical workbench architecture merged by #849.

## Architecture

```text
stage document / lifecycle evidence
        ↓
LAFEA preparation request
        ↓
external stage diagnostic producer
        ↓
retained preparation evidence
        ↓
optional governed approval
        ↓
preparation projection
        ↓
canonical orchestration AUTHORIZATION section
```

The workbench orchestrator remains the only public publication boundary. Preparation evidence and approval custody are listener-free state owned by the orchestrator.

## Request custody

A preparation request can only be built from a current workbench stage. The request derives rather than accepts from the caller:

- stage adapter identity;
- current source hash;
- current/pass canonical model hash;
- current/pass analysis geometry hash where the lifecycle profile requires it;
- exact preparation profile identity/hash.

Requested physical case IDs are the only caller-supplied semantic selection and are canonicalized.

## Evidence and findings

Preparation records use canonical browser-safe SHA-256 identities. Findings carry deterministic IDs, category, severity, disposition, exact source/canonical/case references, technical basis and remediation.

Evidence folds to `PASS`, `WARN` or `BLOCK`. Exact replay is idempotent. A different evidence record for the same exact request is a conflicting replay and is rejected before retained state changes.

## Conditional approval

Approvals bind to the exact preparation evidence hash and exact conditional-warning finding IDs. Unknown warning IDs and attempts to approve blocking findings are rejected. Parent, profile or evidence changes make the approval non-current by projection.

## Currentness and non-resurrection

The projection distinguishes `NOT_APPLICABLE`, `ABSENT`, `STALE`, `CURRENT_PASS`, `CURRENT_WARNING`, `CURRENT_BLOCK` and `INVALID`.

Currentness requires the exact current lifecycle source binding, source, canonical model, required analysis geometry, stage adapter and preparation profile. Undo or hash reappearance does not restore descendant preparation authority when lifecycle evidence remains stale/revalidation-required.

## Producer boundary

WP-AC2 qualifies the preparation evidence/custody/authorization architecture, not a numerical diagnostic engine. Current stage profiles therefore declare no qualified diagnostic producer. Retained evidence can be inspected and audited, but `usableForAuthorization` remains false with `LAFEA_PREPARATION_PRODUCER_NOT_QUALIFIED` until a separately qualified producer is registered by a future governed package.

This is intentional. A schema capable of representing mechanism, stiffness or conditioning findings is not proof that those checks have been implemented.

## Authority matrix

```text
preparation request derivation    = authorized
preparation evidence retention    = authorized
preparation projection            = authorized
conditional approval custody      = authorized
derived solve authorization gate  = authorized
new solver execution              = false
mesh generation/refinement        = false
result recovery/convergence       = false
code/report authority             = false
release qualification             = false
```

WP-AC2 does not import or convert the InputXML-specific pre-FEA request contract and does not call stage solvers, template controllers, mesh producers or recovery producers.
