# LAFEA Non-Bucket NB-T6D — Load-Driven Selected-Pilot Qualification

## 1. Work package

NB-T6D adds one consolidated evidence package for the already bounded route:

```text
C2D-LUG-PINHOLE -> LAFEA.3
```

It does not add a new solver, template, geometry class, UI route, lifecycle state, code assessment, report authority, or release state. It evaluates the merged NB-T6C projection and B7D execution output for a genuinely load-driven selected pilot.

## 2. Gap closed

The retained B7D positive fixture uses an affine displacement field with every degree of freedom prescribed. That fixture is appropriate for deterministic assembly and integration-point recovery, but it does not establish evidence for:

- a nonzero applied resultant;
- a partitioned solve with free degrees of freedom;
- deterministic Cholesky evidence;
- reaction equilibrium under applied load;
- load-driven displacement and retained-stress convergence.

NB-T6D closes this evidence gap without widening the pilot authority.

## 3. Governed chain

```text
explicit nonzero resultant
+ explicit BOUNDARY_ZERO restraint region
+ merged NB-T6C feature projection
+ merged NB-T6B three-level production ladder
-> three source/mesh-bound LAFEA.3 documents
-> merged B7A mapping and B7C request
-> merged B7D public controller
-> partitioned free-DOF solve at each level
-> retained integration-point recovery
-> reaction-equilibrium evidence
-> independent displacement and retained-von-Mises convergence
-> immutable NB-T6D manifest and receipt
```

No private local-continuum entry point is called by NB-T6D.

## 4. Load and restraint evidence

The qualification fixture declares a nonzero global force resultant. NB-T6C projects that force onto one governed quadratic edge using its deterministic `1:4:1` weighting and remainder closure.

A separate governed edge is selected for `BOUNDARY_ZERO`. The projected document therefore retains constrained and free in-plane degrees of freedom. Every accepted level must show:

```text
solverEvidence.method = DETERMINISTIC_CHOLESKY
freeDofIdentities.length > 0
solverEvidence.pivots.length > 0
equilibrium.accepted = true
```

The evaluator independently recomputes the nodal-force resultant and sums retained constrained reactions. Both must close against the declared force within the explicit equilibrium tolerance.

## 5. Recovery authority

NB-T6D accepts only the retained B7D integration-point recovery:

```text
recoveryLayer = INTEGRATION_POINT
projectedDisplayHash = null
projectedDisplayRole = NOT_PRODUCED
```

Maximum von Mises evidence is reduced directly from retained Gauss-point values. Nodal projection, averaging, smoothing, stress-classification lines, structural stress, and code assessment remain outside authority.

## 6. Convergence split

Two different convergence roles are retained and must not be conflated.

### 6.1 B7D controller acceptance

The B7D receipt requires one convergence quantity before it may register its bounded `CONVERGENCE` lifecycle record. For the NB-T6D fixture, that request uses the exact plane-stress invariant:

```text
quantityId = PLANE_STRESS_SIGMA_Z_INVARIANT
component  = SIGMA_Z
expected   = 0 at every retained integration point
```

This deterministic invariant proves that the three accepted executions and recovery parents can pass through the unchanged B7D receipt contract. It is not presented as load-driven stress-convergence evidence.

### 6.2 NB-T6D engineering evidence

NB-T6D separately evaluates, from the accepted load-driven results:

- maximum nodal displacement magnitude;
- maximum retained integration-point von Mises stress.

Each quantity retains all three observations, the two relative changes, the finest-level relative change, the trend, the declared tolerance, status, reasons, and semantic hash. The NB-T6D selected-pilot receipt is created only when both dispositions are `PASS`.

## 7. Manifest and receipt

The manifest binds:

- exact candidate head;
- NB-T6C projection and execution hashes;
- B7C request and B7D receipt hashes;
- B7B benchmark parent;
- physical-problem and feature-projection identities;
- applied resultant;
- explicit qualification tolerances;
- required evidence roles.

Each level binds:

- mesh and profile hashes;
- element count;
- applied and reaction resultants;
- equilibrium closure;
- free and constrained DOF counts;
- solver method and pivot evidence;
- maximum displacement and retained von Mises;
- execution, result, recovery, and integration-point evidence hashes.

The receipt is deeply frozen and SHA-256-bound. Deterministic replay must reproduce its manifest, semantic, and evidence hashes.

## 8. Fail-closed cases

The package rejects or blocks:

- a zero applied resultant;
- a stale exact-head parent;
- stale projection, mapping, benchmark, request, model, geometry, or mesh parents;
- a tampered NB-T6C execution hash;
- a result whose retained hashes no longer reconstruct;
- missing free DOFs, missing pivots, or a fully constrained solver claim;
- failed projected-force or reaction equilibrium;
- absent integration-point recovery;
- non-positive or non-finite displacement/stress observations;
- failed finest-level convergence;
- tampered qualification or receipt identities.

## 9. Authority boundary

An accepted package establishes only:

```text
selectedLoadDrivenPilotEvidence = true
selectedPilotQualification      = true
```

It always retains:

```text
generalT7dAuthorized                 = false
additionalContinuumTemplatesAuthorized = false
arbitraryOuterProfileSupported       = false
arbitraryHoleTopologySupported       = false
shellAuthorized                      = false
sclAuthorized                        = false
structuralStressAuthorized           = false
assessmentReady                      = false
codeReady                            = false
reportAuthority                      = false
releaseQualified                     = false
```

NB-T6D does not close the repository-wide B7 exact-head infrastructure gate. A hosted job that terminates before creating executable steps remains infrastructure evidence only.

## 10. Required exact-head commands

```bash
npm ci
node scripts/lafea-nb-t6d-load-driven-qualification-check.mjs
node scripts/lafea-nb-t6c-physical-problem-batch-check.mjs
node scripts/lafea-template-b7d-controlled-continuum-controller-check.mjs
node scripts/lafea.3-solver-check.mjs
npm run check:lafea-nonbucket-stack
npm run syntax:strict
npm run check:imports
npm run build
git diff --check "$PR_BASE_SHA...HEAD"
test -z "$(git status --porcelain=v1 --untracked-files=no)"
```
