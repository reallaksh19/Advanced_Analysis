# WP-PF1 Expert Qualification

Base reviewed: `2a0686d8ccaf04a27729f0f66e30bb99383e319c`.

## Q1 — Checker boundary (10/10)

Source validation proves the request and sealed source authority are syntactically, schematically and cryptographically admissible. Geometry diagnostics prove canonical coordinates, spans, units and source-delta closure. Topology diagnostics reason over graph membership, duplicate/overlap/intersection/contact conditions and disconnected components. Representability classifies each active source feature against a named mechanics profile without reducing the answer to a Boolean. Authority completeness proves every executable primitive has material, section, rigid, restraint and load evidence. Stiffness preflight compiles the production mechanical model, assembles the constrained stiffness partition, discards factors, and classifies mechanisms, rank, definiteness and conditioning. Solve execution creates runtime state only after current authorization. Result validation is downstream and checks solved-state/result-chain custody rather than input readiness.

Pre-FEA blocks include malformed XML or request, zero-length/unresolved geometry, unsupported active nonlinear restraint/component, missing E/section/thermal authority for a requested operating case, duplicate constraint DOF and incomplete requested-case load coverage. Assembly/preflight-only defects include rigid-body rank deficiency, zero-stiffness/free DOF after formulation, indefinite pivots and excessive conditioning. Post-solve-only defects include equilibrium residual failure, result recovery inconsistency and result-chain tamper/staleness.

## Q2 — Single-parse custody (10/10)

The request validator seals the source identity and content hash. Exactly one call converts raw XML into the retained model-health source bundle. The bundle carries source records, inherited/explicit/sentinel evidence, canonical geometry and source/evidence hashes. Every diagnostic accepts only that bundle, and every sealed child stores exact parent semantic/evidence hashes. Preparation validates diagnostics against the same source bundle, then binds normalization, per-element authorities, structural compilation, physical cases and stiffness identity. Authorization binds the final preparation hash, profile, requested case subset and warning finding set.

Raw strings are rejected after source creation. Parent validators recompute semantic/evidence hashes and optionally compare the live parent object, so reparse/substitution, removed findings, stale source/support/load/profile records and cross-model authorizations fail before runtime creation.

## Q3 — Restraint semantics (10/10)

Anchors and production-supported bilateral Cartesian constraints are exact only when their node, DOF and direction semantics map one-to-one to production constraint declarations. A skew bilateral restraint may be exact only if the production compiler supports a normalized arbitrary direction; otherwise it blocks. Existing declared unilateral-to-bilateral linearization may be conditionally available only in the disclosed approximation profile. True unilateral contact, active gaps, friction, snubbers and unsupported finite-stiffness/connecting-node forms block unless a production authority represents them exactly. Prescribed movement requires a production primitive and case authority; otherwise it blocks.

Collision detection expands anchors to six candidate node/DOF declarations and inspects the ordered raw declaration ledger before any Map/keyed collection is built. Duplicate, anchor overlap and contradictory bilateral targets get stable finding identities.

Omitting or collapsing a restraint can create false mechanisms; over-constraining, linearizing a unilateral restraint, or collapsing duplicates can create false stability and invalid reactions. Therefore representation, collision and mechanical preflight remain distinct gates.

## Q4 — Material and section completeness (9/10)

Sustained weight requires finite positive E, valid Poisson ratio, positive OD/wall, positive ID consistency, density/mass authority appropriate to each active element, and exact element-to-material/section binding. Operating thermal adds installation temperature, active operating temperature, thermal coefficient authority and complete element coverage. Rigid elements require separate physical section/mass and analytical rigid-stiffness authority, including replacement/addition and distributed/lumped semantics. Code-only pressure evaluation requires pressure basis and physical section custody but cannot borrow analytical rigid stiffness as physical evidence.

A global material state is insufficient because E, density, alpha and possibly Poisson ratio may vary per element; a global fallback silently changes stiffness, mass and thermal strain.

## Q5 — Loads and pressure separation (10/10)

Build a source load ledger before aggregation, one row per active/inactive/sentinel record, with source identity, binding target, disposition and primitive IDs. Weight authority is decomposed into wall, fluid, insulation/cladding and rigid/component contributions, then compiled exactly once into distributed or lumped primitives according to retained mass semantics. Temperature coverage is checked per active element and per requested set. Pressure is split into structural-pressure capability and code-stress custody: structuralEffect remains `NONE` unless a production effect is implemented; code-stress custody is retained separately.

Inactive and sentinel-unset declarations remain visible but create no primitive. Unknown active declarations block. Conservation checks compare accepted active ledger rows to compiled primitives and case membership, rejecting zero/duplicate compilation. Primitive IDs and authority hashes prove that no active load disappears or enters twice.

## Q6 — Component representability (9/10)

Strict profile: straight pipe exact; qualified rigid exact; bend/reducer/tee/olet/valve/flange/hanger/expansion joint/user-defined/unknown block unless an existing production compiler exactly represents that kind. Disclosed generic profile: straight/rigid exact; bend chord, reducer-as-pipe or selected lumped valve/flange substitutions may be conditional only when explicitly named and evidence-backed; tee/olet branch-flexibility, hanger mechanics, expansion joints, nonlinear or unknown components block unless a profile-specific production authority exists.

A Boolean loses exact-versus-approximate, code-only, nonlinear, inactive and invalid-source distinctions. The disposition and limitation IDs propagate into each requested physical case and authorization warning set, constraining later result authority.

## Q7 — Mechanism and rank diagnosis (10/10)

Disconnected topology is a graph fact. A floating component is a disconnected structural component with no adequate physical constraints. A rigid-body mode is a null mode corresponding to unconstrained rigid translation/rotation. A local mechanism is a rank loss inside an otherwise restrained component. A zero-stiffness DOF has no assembled stiffness contribution. Rank deficiency means the free partition lacks full rank. Indefiniteness means pivots/eigen-sign evidence violates positive definiteness. Ill-conditioning means the system is factorable but sensitivity exceeds profile thresholds.

Retain component IDs/node IDs/constraint IDs, free/constrained/inactive DOF counts, partition hash, named or indexed failing DOF where available, factorization type, pivot extrema, solver failure code, condition estimate/method and affected component identities. Do not retain matrices, triplets, factors or caches.

## Q8 — Authorization security (10/10)

PASS may be auto-authorized only by an explicit policy record. WARN requires a sealed approval containing preparation semantic/evidence hashes, profile, case subset, exact warning finding IDs, source, revision, approver, reason, accepted limitations and invalidation/expiry policy; a Boolean cannot express custody or scope. BLOCK authorization constructors always reject.

The solve gateway validates the full parent chain and compares requested cases, current source/model/stiffness/load identities and warning set. Source, support, load, requested-case or profile changes alter parent hashes and stale authorization. Recomputed hashes reject mutation/removal/reseal attempts; model/source hashes reject clone and cross-model substitution. All public raw-InputXML solve exports either require authorization or are made non-public/internal; static anti-bypass tests enumerate exports/imports and assert solver runtime creation occurs only after authorization validation.

## Q9 — Error taxonomy and remediation (9/10)

Findings use stable IDs derived from code plus canonical affected identities/evidence, not message or ordering. One source defect creates one primary finding with multiple `capabilityEffects`, preventing duplicate unstable messages while allowing dependency folding.

Examples: `UNNODED_INTERIOR_INTERSECTION` in GEOMETRY/TOPOLOGY blocks structural compilation and all physical cases; `DUPLICATE_CONSTRAINT_DOF` in CONSTRAINT blocks before keyed collection collapse; `THERMAL_COVERAGE_INCOMPLETE` blocks only operating cases and names missing elements; `LINEAR_STIFFNESS_RANK_DEFICIENT` in STIFFNESS/MECHANISM blocks solve and retains partition/component/DOF evidence. Each includes technical basis and concrete remediation evidence.

## Q10 — Qualification strategy (10/10)

Use PF-01..PF-24 plus the eight exercises, deterministic replay/permutation tests, sealed-record mutation controls and static gateway/import checks. Compare source/model/stiffness/load identities under controlled mutations: load changes preserve stiffness identity but stale preparation/authorization; support changes alter stiffness identity; pressure primitives retain code-only custody and never alter structural load vectors. Serialize every report and recursively reject matrices, triplets, typed arrays, Maps, Sets, functions, factors and caches. Assert runtime factory spies remain untouched for all missing/stale/BLOCK/WARN-without-approval paths. Exact-head CI pins base/head, enforces one commit and changed-path allowlist, runs tests, creates CSV/JSON evidence and publishes a receipt with empty equation/default changes.

## Score

| Question | Score |
|---|---:|
| 1 | 10 |
| 2 | 10 |
| 3 | 10 |
| 4 | 9 |
| 5 | 10 |
| 6 | 9 |
| 7 | 10 |
| 8 | 10 |
| 9 | 9 |
| 10 | 10 |
| **Total** | **97/100** |

Gate result: **PASS**. Questions 3, 5, 7 and 8 are all 10/10; no question is below 9/10; no disqualifier is proposed.
