# LAFEA Non-Bucket NB-T6H — Registered-Template Caller-Mesh Execution

## Purpose

NB-T6H adds a non-UI LAFEA.3 execution route for the five existing registered, non-axisymmetric continuum templates:

- `C2D-BRACKET-GUSSET`
- `C2D-CLAMP-EAR`
- `C2D-LUG-PINHOLE`
- `C2D-NOZZLE-REPAD-SECTION`
- `C2D-PIPE-PAD-SECTION`

It generalizes execution authority, not geometry generation. The caller must provide a current NB-T4A analysis-mesh evidence package whose exact governed T6 nodes and connectivity match the compiled stage document.

## Governed chain

```text
current ENGINE_EXECUTABLE release record
+ current target-compatibility receipt
+ exact retained T4 compilation and stage handoff
+ immutable NB-T6H request
+ PASS material-region mapping evidence
+ PASS load-edge mapping evidence
+ PASS boundary-edge mapping evidence
+ current NB-T4A T6 caller-mesh evidence
→ internal source-authority issuance
→ retained B6 caller-mesh binding = BOUND
→ retained public LAFEA.3 stage route
→ exact result-hash reconstruction
→ retained integration-point recovery
→ CANONICAL_MODEL / ANALYSIS_GEOMETRY / ANALYSIS_MESH
→ EXECUTION / RECOVERY lifecycle evidence
→ RESULT_READY
```

The controller does not import or call the numerical core directly. Numerical dispatch remains behind `lafea-controlled-continuum-stage-route.js`. The controller constructs and validates the existing B6 binding through `bindLafeaContinuumTemplateCallerMesh`; it does not bypass or replace B6.

## Required validation

The route rejects:

- templates outside the five registered non-axisymmetric LAFEA.3 templates;
- blocked, stale or non-`ENGINE_EXECUTABLE` release records;
- stale target compatibility;
- missing, pending or failed material-region, load-edge or boundary-edge evidence;
- a B6 binding that is not exactly `BOUND`;
- stale document revisions or caller-supplied source authority;
- model, geometry, mesh-artifact, mesh-content or mesh-profile parent drift;
- T3, Q8 or unsupported mixed elements in this T6 package;
- mismatched nodes or connectivity;
- rejected calculation results;
- result hash reconstruction failure;
- projected, smoothed or non-integration-point recovery;
- lifecycle registration that does not satisfy the retained stage profile.

## Authority boundary

```text
registered-template T6 caller-mesh execution = true after accepted receipt
B6 material/load/boundary binding             = BOUND
Q8 execution authority                        = false
compiler-generated mesh                       = false
arbitrary geometry / polygon-hole mesher      = false
axisymmetric continuum                        = false
convergence authority                         = false
LAFEA.4 / LAFEA.5 shell authority             = false
SCL / structural stress                       = false
assessment / code / report                    = false
LAFEA.6                                       = false
releaseQualified                              = false
```

`RESULT_READY` means only that the exact calculation and retained integration-point recovery are current for the supplied registered-template T6 mesh and exact B6 binding. It does not imply convergence, assessment, code, report or release readiness.

## Benchmark boundary

The retained `lafea-continuum-benchmark-qualification/v1` contract is intentionally limited to the selected `C2D-LUG-PINHOLE` pilot. NB-T6H does not reinterpret that record as qualification for the other four templates. Their execution path is instead bound to the exact validated T4 compilation, current release/compatibility records, NB-T4A mesh evidence and B6 mapping evidence. Template-specific benchmark and release qualification remain future work.

## Source qualification

```bash
node scripts/lafea-nb-t6h-general-continuum-controller-check.mjs
node --check src/core/lafea-application-templates/general-continuum-execution-contract.js
node --check src/workspace/lafea-general-continuum-controller.js
node --check src/workspace/lafea-general-continuum-execution-public.js
```

GitHub Actions allocation and hosted-runner availability are intentionally outside NB-T6H scope. No workflow, template-specific benchmark or release pass is claimed by this package.
