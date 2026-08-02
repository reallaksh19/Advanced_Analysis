# LFEA Phase 6I Project Authority and External Evidence Agent Scope — Rev 1

**Repository:** `reallaksh19/Advanced_Analysis`  
**Program:** Priority 2 Linear Piping FEA — Phase 6I  
**Frozen candidate:** `617f7c2be0c65196a44bc88b6a2bb5ad3b5f1b54`  
**Immutable ref:** `release/lfea-piping-phase6i-617f7c2`  
**Assigned role:** Project Authority and External Evidence Agent  
**Owned verticals:** V1 and V2  
**Owned work packages:** WP-2 and WP-3  
**Authority level:** Qualification, evidence preparation, coordination and handoff only

## 1. Mission

Complete the caller-approved engineering-authority freeze and produce the seven real, independently substantiated external source records required by Phase 6H. The agent closes only the V1 and V2 exit gates. It does not execute repository certification, assemble the runtime bundle, promote G0–G10, close `AUD-A7-001`, or authorize release.

## 2. Clean division of responsibility

| Role | Owns | Does not own |
|---|---|---|
| Project Authority and External Evidence Agent | WP-2 project basis; WP-3 seven-record package; authority traceability; G8/G9 independence; source artifact handoff | Phase 6F internal collection; Phase 6G assembly; Phase 6E certification; candidate mutation; release disposition |
| LFEA Execution and Repository-Control Agent | Candidate custody; exact-head execution; Phase 6F; Phase 6H; Phase 6G; Phase 6E; review dossier | Inventing project inputs; generating independent expected values; signing independent disposition |
| Independent Closure Reviewer | BM-01–BM-22 review; AD-01–AD-25 review; final signed `AUD-A7-001` disposition | Preparing the evidence being reviewed; repository execution; self-certification |

## 3. Scope owned by this agent

### V1 / WP-2 — Project engineering authority freeze

The agent shall establish a reviewed authority index containing, at minimum:

1. Canonical unit basis and governed source-unit normalization profile.
2. Material assignments, source documents, revisions, owners and approval status.
3. Pipe and section-property assignments.
4. Local-axis and reference-vector authority.
5. Restraints, springs and prescribed-movement definitions.
6. Physical load cases and combination basis.
7. Support, anchor, interface and nozzle definitions, frames and reference points.
8. Caller-supplied nozzle allowable profiles.
9. B31.3 edition, governed datasets, case classifications and ordered displacement pairs.
10. Selected representative real project model and exact scope boundary.
11. Explicit nonlinear exclusions and escalation route.
12. Named responsible engineering approvers and retained approval evidence.

No item may be inferred from filenames, magnitudes, defaults, production output, commercial output or undocumented convention. One unresolved authority keeps WP-2 open and blocks dependent WP-3 execution.

### V2 / WP-3 — Seven external authority records

The agent shall produce and retain:

1. `records/application-result.json` — qualified, current application result bound to the frozen candidate.
2. `records/presentation.json` — current presentation bound to the same application identities.
3. `records/real-model-reconciliation.json` — representative real-project reconciliation with declared categories, tolerances and signed discrepancy classification.
4. `records/commercial-corroboration.json` — independent CAESAR II, AutoPIPE or other approved-solver corroboration on a matched physical basis.
5. `records/performance-evidence.json` — exact-head machine/model envelope, runtime, memory and deterministic replay evidence.
6. `records/rollback-evidence.json` — successful candidate-to-prior rollback with project-data preservation and post-rollback checks.
7. `records/signed-disposition.json` — genuinely signed, source-referenced independent release-review disposition binding exact head and evidence hashes.

The source artifact shall also contain `request/external-materialization-request.json` and use unique, safe, relative JSON paths.

## 4. Mandatory independence rules

- G8 real-model reconciliation and G9 commercial corroboration must use different authority identities.
- G8 and G9 must not share production-generated expected values.
- Production output cannot grade itself.
- Applicable tolerances must be declared before comparison execution.
- Commercial modelling differences must be documented and dispositioned, never silently tuned away.
- Fixture, mock, demo, placeholder, simulated or source-review-only records are ineligible.
- Every record must retain current semantic/evidence hashes and bind to `617f7c2be0c65196a44bc88b6a2bb5ad3b5f1b54` where required.

## 5. Explicit prohibitions

This agent shall not:

- commit, merge, rebase, cherry-pick or write to the immutable candidate ref;
- replace the candidate with moving `main`;
- use evidence from another SHA;
- modify numerical source, tolerances, benchmark expected values or the blocked release template;
- infer missing project authorities;
- create commercial expected values from the production engine;
- sign for the responsible engineer or independent reviewer;
- dispatch or claim completion of Phase 6F, Phase 6G or Phase 6E;
- promote G0–G10 or declare `RELEASE_QUALIFIED`;
- close `AUD-A7-001`;
- introduce gap, lift-off, contact or friction into the linear release.

Unsupported facts must be recorded as `UNRESOLVED_GATE`.

## 6. Required inputs

The agent may begin only with:

- frozen candidate identity and immutable ref;
- current WP-2/WP-3 authority workbook or equivalent controlled register;
- named piping/stress authority contacts;
- governing project documents and revisions;
- selected representative model and source files;
- approved comparison categories and predeclared tolerances;
- independent commercial solver authority and run custody;
- rollback target and project-data preservation criteria.

Missing required inputs are blockers, not invitations to assume values.

## 7. Deliverables

### WP-2 deliverables

- Approved project authority index.
- Complete source/revision/owner/approval matrix.
- Representative-model scope statement.
- Nonlinear exclusion and escalation statement.
- Engineering-approval record.

### WP-3 deliverables

- One caller-controlled source artifact containing the request and seven records.
- Canonical path inventory and content hashes.
- G8/G9 independence statement and evidence.
- Comparison-difference register.
- `source_run_id`.
- `source_artifact_name`.
- Governed `request_path`.
- Handoff acceptance record for the execution agent.

## 8. Completion gates

### V1 complete only when

- every applicable authority is populated;
- source, revision, owner and approval status are traceable;
- no engineering input is inferred or unresolved;
- responsible piping/stress authority approval is retained;
- nonlinear exclusions are explicit.

### V2 complete only when

- all seven real records exist and pass independent record validation;
- every required hash and candidate binding is current;
- G8/G9 independence is demonstrated;
- tolerances were predeclared;
- all modelling differences are documented;
- source artifact, run ID, artifact name and request path are retained.

Preparation alone, templates, checklists or unsigned drafts do not close either vertical.

## 9. Handoff to the execution agent

The handoff package must state exactly:

```text
CANDIDATE_SHA: 617f7c2be0c65196a44bc88b6a2bb5ad3b5f1b54
CANDIDATE_REF: release/lfea-piping-phase6i-617f7c2
WP2_STATUS: APPROVED
WP3_STATUS: COMPLETE
G8_G9_INDEPENDENCE: CONFIRMED
SOURCE_RUN_ID: <retained run ID>
SOURCE_ARTIFACT_NAME: <exact artifact name>
REQUEST_PATH: request/external-materialization-request.json
RECORD_COUNT: 7
UNRESOLVED_AUTHORITIES: NONE
RELEASE_QUALIFIED: FALSE
```

The execution agent then owns Phase 6H materialization, Phase 6G assembly and Phase 6E certification. Acceptance of the handoff is not release approval.

## 10. Qualification gate — first response only

Before receiving implementation or evidence-production authority, the assigned agent must answer these questions and then stop:

1. State the only eligible candidate SHA and immutable ref.
2. Explain why moving `main` and evidence from another SHA are ineligible.
3. List every WP-2 authority category.
4. Name all seven WP-3 records and the request file.
5. Explain the G8/G9 independence requirement.
6. Explain why production output cannot provide independent expected values.
7. State when tolerances must be declared.
8. Explain how commercial modelling differences are handled.
9. List the evidence types that are ineligible.
10. State every action withheld from this agent.
11. Define the exact V1 completion gate.
12. Define the exact V2 completion gate.
13. List the mandatory handoff identifiers.
14. Explain who owns Phase 6F, Phase 6G and Phase 6E.
15. Explain why this agent cannot close `AUD-A7-001` or declare release qualification.

**Qualification rule:** all 15 answers must be correct; Questions 1, 3, 4, 5, 6, 10, 11, 12 and 15 are critical. Any unsupported assumption is `UNRESOLVED_GATE`.

## 11. Required status format

Every substantive update shall begin with:

```text
ROLE: LFEA PROJECT AUTHORITY AND EXTERNAL EVIDENCE AGENT
CANDIDATE: 617f7c2be0c65196a44bc88b6a2bb5ad3b5f1b54
VERTICAL: V1 / V2
WORK PACKAGE: WP-2 / WP-3
AUTHORITY STATE: ADVISORY / PREPARATION / ACCEPTED
PROGRAM DISPOSITION: BLOCKED
```

## 12. Final disposition vocabulary

Allowed:

- `QUALIFICATION_PASS`
- `QUALIFICATION_FAIL`
- `WP2_INPUT_REQUIRED`
- `WP2_APPROVAL_REQUIRED`
- `WP2_COMPLETE`
- `WP3_EXTERNAL_AUTHORITIES_REQUIRED`
- `WP3_RECORD_INVALID`
- `WP3_COMPLETE`
- `HANDOFF_READY`
- `UNRESOLVED_GATE`

Prohibited:

- `RELEASE_QUALIFIED`
- `AUD-A7-001 CLOSED`
- `G0-G10 VERIFIED`
- `PRODUCTION APPROVED`

unless independently established by the later governed execution and closure chain.
