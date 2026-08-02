# LAFEA Bucket B2 — Target Compatibility Receipt

## 1. Purpose

B2 proves whether one compiled application-template handoff remains compatible with the repository's current target-stage authority. It is read-only and produces no source, execution, lifecycle, result or release evidence.

```text
snapshot: lafea-template-target-authority-snapshot/v1
receipt:  lafea-template-target-compatibility-receipt/v1
```

The core contract does not import workspace runtime code. A separate workspace adapter reads current registry, composition, lifecycle, source-contract, unit, product, mesh and benchmark authority and projects an immutable snapshot into the core contract.

## 2. Snapshot authority

The snapshot contains:

```text
targetStage
compositionRoot
lifecycleProfile
sourceContract
unitProjection
productAdapter
meshRequirement
benchmarkBindings
semanticHash
```

Current identities are canonical SHA-256 hashes over plain authority records. Functions, UI state, editor revisions and calculation output are excluded.

## 3. Receipt contract

```text
schema
templateId
templateSemanticHash
parameterSchemaHash
compilerBindingHash
compilationHash
handoffHash
targetStage
compositionRoot
lifecycleProfile
sourceContract
unitProjection
productAdapter
meshRequirement
benchmarkBindings
status
reasons
hashProfile
semanticHash
```

Unknown or missing keys are rejected at every level.

## 4. Compatibility checks

The evaluator compares the release-record parents with the current snapshot:

### Target stage

```text
stage identity
registry schema and entry hash
engine state and engine package
stage authority
input/result contract roles
handoff entry stage
```

### Composition root

```text
composition schema and root identity
composition semantic hash
component-set hash
release-state binding
```

### Lifecycle profile

```text
profile identity and hash
artifact-kind set
result-required set
assessment-required set
mesh, recovery, convergence and code applicability
```

### Source contract

```text
source-authority schema
source-authority role
canonicalization profile
stage input-contract role
```

B2 binds the required source contract. It does not issue a source authority or source hash.

### Units

The target unit contract is hashed from the current stage's governed unit-source role and composition unit-resolver binding. A changed unit resolver or unit-source role makes the compilation stale.

### Product adapter

LAFEA.1 and LAFEA.2 require a currently registered product-adapter identity and profile. FEA and unsupported stages use `NOT_APPLICABLE`.

### Mesh requirement

Current lifecycle mesh applicability must match the release record. FEA stages require the governed analysis-mesh authority schema, role and accepted status. B2 does not create or accept a mesh.

### Benchmark bindings

The current composition benchmark-binding state, ordered IDs and SHA-256 binding identities must match the compiled release record.

## 5. Dispositions

```text
CURRENT
  all compared parents match and the target route is registered

STALE
  one or more compiled/target parents changed

BLOCKED
  required compatibility inputs are absent, the release record is below
  COMPILED_READY, or the target route is unsupported
```

Freshness defects take precedence: a receipt with any stale parent is `STALE`, even when another missing authority would also block execution.

LAFEA.6 always remains blocked while its registry engine state is `ENGINE_NOT_IMPLEMENTED`.

## 6. State effect

A `CURRENT` receipt is only compatibility evidence. It may be bound into a release record as the parent required before a later `ENGINE_EXECUTABLE` transition.

It does not itself establish:

```text
ENGINE_EXECUTABLE
source authority
calculation acceptance
LIFECYCLE_READY
RESULT_READY
assessmentReady
CODE_READY
RELEASE_QUALIFIED
```

If the target composition, lifecycle profile, source contract, product adapter, unit target, mesh requirement or benchmark binding changes, the prior receipt becomes stale and the template must be recompiled and revalidated.

## 7. Anti-drift coverage

The dedicated B2 check covers:

```text
current LAFEA.1 analytical compatibility
current LAFEA.2 analytical compatibility
current LAFEA.3 FEA compatibility
LAFEA.6 unsupported-route blocking
composition-root drift
lifecycle-profile drift
source-schema drift
unit-target drift
product-component drift
benchmark-binding drift
handoff target drift
missing source requirements
missing product binding
release record below COMPILED_READY
snapshot exact-key and applicability violations
benchmark cardinality mismatch
snapshot and receipt hash tampering
mutable snapshot and receipt rejection
```

Source guards reject engine invocation, source issuance, lifecycle registration, product-evidence production and numerical calculator calls.

## 8. Authority retained

```text
CATALOGUED          27
ENGINE_EXECUTABLE    0
LIFECYCLE_READY      0
RESULT_READY         0
RELEASE_QUALIFIED    0
T7C                   IMPORT_FOR_EDITING_ONLY
T7D                   UNAUTHORIZED
```

B2 does not modify template registry state, stage composition, lifecycle profiles, source authority, engine execution, product evidence, mesh evidence, shell formulation, numerical tolerances, benchmark expected values or release qualification.
