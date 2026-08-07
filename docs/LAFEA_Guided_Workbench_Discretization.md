# LAFEA Guided Workbench and Discretization Boundary

## Scope

This package migrates the guided standalone LAFEA workbench onto the canonical workbench orchestrator merged by WP-AC1/WP-AC2. It wires retained analysis-mesh custody into a truthful `Discretization` surface and presents the existing engineering lifecycle as an 11-step guided UI.

It is a presentation, contract and fail-closed action-gating change. It does **not** implement an automatic mesher, topology generator, mesh repair algorithm, smoothing/refinement engine, new finite-element formulation, solver executor, recovery algorithm, code assessment, report authority or release qualification.

The obsolete LAFEA GitHub Actions certification layer is intentionally not restored by this migration. The focused script and browser checks remain directly runnable.

## Canonical authority source

The controller binds directly to `createLafeaWorkbenchOrchestratorStore()`.

The guided workflow consumes `stage.orchestration` and does not construct an independent solve-authority state. In particular:

- source/model status comes from canonical `SOURCE` and `MODEL` orchestration sections;
- numerical preflight comes from canonical `PREPARATION`;
- analysis-mesh readiness comes from canonical `DISCRETIZATION` and the retained mesh-custody projection;
- Run availability comes from canonical `AUTHORIZATION`;
- execution/result state comes from canonical `EXECUTION` and `RESULTS`;
- release remains governed by canonical `RELEASE` and is currently not qualified.

The 11-step UI therefore remains a navigation/presentation projection over the smaller canonical orchestration state machine; it is not a second authority engine.

## Guided flow

The workbench presents:

1. Source and model identity
2. Model diagnostics
3. Analysis profile
4. Materials and sections
5. Restraints and boundary conditions
6. Loads and physical cases
7. Discretization / analysis mesh
8. Numerical preflight
9. Authorization
10. Run
11. Results and evidence

UI steps use `NOT_STARTED`, `READY`, `WARNING`, `BLOCKED` and `COMPLETE`. Authority-sensitive steps inherit those states and reasons from the canonical orchestrator.

## Discretization modes

The Discretization surface exposes four explicit modes:

- `RETAIN_AUTHORIZED_MESH` — enabled for mesh-applicable stages and consumes only validated retained custody evidence.
- `SOURCE_DISCRETIZATION` — disabled because no stage source-discretization authority is registered.
- `AUTOMATIC_MESH` — disabled because no general qualified mesh producer is registered.
- `MANUAL_REFINEMENT` — disabled because no governed refinement producer is registered.

Existing `document.meshConfig` is displayed as `UNAPPLIED_PREFERENCE` with `NO_ENGINEERING_EFFECT`. It is not an analysis-mesh producer input.

## Non-executable future-producer contracts

`lafea-mesh-generation-intent/v1` records deterministic future producer intent only. It remains `UNEXECUTABLE_INTENT`, has `executionAuthorized=false`, `producerRef=null` and `producesMesh=false`.

`lafea-mesh-refinement-command/v1` remains `UNEXECUTABLE_COMMAND`, has `executionAuthorized=false`, and declares `NO_MUTATION_WITHOUT_QUALIFIED_PRODUCER` rollback semantics.

Neither contract creates topology, mesh evidence or solver authority.

## Retained evidence and viewport

WP-MC1 retained analysis-mesh custody remains the mesh-evidence authority. Current or stale retained evidence may be drawn as a read-only SVG overlay using exact retained node coordinates, connectivity, warning IDs and blocking IDs.

Mesh-element focus is display-only and remains separate from editable source selection. No source geometry or retained mesh is synthesized by the overlay.

## Preparation and authorization

WP-AC2 replaced the old standalone pre-FEA placeholder with a canonical preparation/evidence boundary. Current preparation profiles still declare no qualified diagnostic producer. Consequently the canonical preparation projection remains fail-closed until separately qualified producer evidence exists.

A mesh-not-applicable analytical stage does **not** bypass this preparation boundary. `DISCRETIZATION=COMPLETE` can coexist with `AUTHORIZATION=BLOCKED`.

The Run button is enabled only when:

- the stage has a validated document;
- a qualified execution route is registered; and
- canonical `stage.orchestration.sections.AUTHORIZATION.state === READY`.

The UI no longer treats mesh custody alone as sufficient Run authorization.

## Results and release

Existing retained execution/result presentation and qualified render-packet intake remain unchanged. The guided surface only reorganizes them.

No progress/cancellation protocol is invented because the retained execution API is synchronous.

Release remains fail-closed. No UI state, retained mesh, preparation evidence, calculation result or verification output introduced here promotes release qualification.
