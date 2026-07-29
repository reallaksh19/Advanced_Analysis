# Mechanical-model compiler

This package binds conditioned topology, resolved material states, resolved section states, qualified local axes and linear-constraint declarations into one sealed `fea-linear-model/v1` record. It is the LFEA-B2.5 exit boundary.

It does not condition geometry, resolve material properties, calculate section properties, construct local axes, build element matrices, assemble, solve, recover results or evaluate code stress. Each of those is owned elsewhere and is consumed here through that owner's own validator.

## Inputs

Every input is passed explicitly. The compiler reads no module-level or browser-local state.

```text
conditionedTopology   B-1 conditionGeometry result: { geometry, semanticHash }
nodeBindings          conditioned node id -> kernel node id, one per node
elementBindings       conditioned span id -> element id, material, section,
                      formulation, local-axis evidence and source component
materialResolutions    fea-linear-material-resolution/v1 records (B-2.2)
sectionResolutions     fea-linear-pipe-section-resolution/v1 records (B-2.3)
localAxisResults       frame-local-axis-result/v1 records keyed by evidence id (B-2.4)
localAxisProfile       frame-local-axis-profile/v1 the results were produced under
constraintDeclarations end releases, partial-release springs, nodal restraints,
                      rigid offsets and rigid links
profile               fea-linear-model-compiler-profile/v1
modelIdentity         canonical kernel identity of the model
modelRevision         positive integer
sourceSemanticHash    identity of the engineering source the topology came from
```

Conditioned geometry is accepted only in metres. The compiler does not convert units; a non-metre unit is rejected with `MODEL_COMPILER_UNIT_NOT_CANONICAL` because a scale factor applied here would be a hidden numerical policy.

Conditioned node and span identities are retained exactly as the source wrote them, in `sourceAncestry.sourceNodeIds` and the binding trace. The kernel identities used inside the model are supplied by the caller; the compiler never generates one.

## Binding rules

Section 3.2 requires exactly one material state, one section state, one formulation and one local-axis result per element span. Each of the four is a separate rejection, and none has a fallback:

```text
MODEL_COMPILER_SPAN_BINDING_MISSING        a conditioned span has no binding
MODEL_COMPILER_SPAN_BINDING_AMBIGUOUS      a conditioned span has more than one
MODEL_COMPILER_SPAN_BINDING_UNKNOWN        a binding names a span that does not exist
MODEL_COMPILER_MATERIAL_BINDING_MISSING    the named material state was not resolved
MODEL_COMPILER_MATERIAL_BINDING_AMBIGUOUS  one material state id was resolved twice
MODEL_COMPILER_SECTION_BINDING_MISSING     the named section state was not resolved
MODEL_COMPILER_SECTION_BINDING_AMBIGUOUS   one section state id was resolved twice
MODEL_COMPILER_AXIS_BINDING_MISSING        the named axis evidence was not supplied
MODEL_COMPILER_AXIS_BINDING_AMBIGUOUS      one axis evidence id was supplied twice
MODEL_COMPILER_AXIS_PROFILE_MISMATCH       an axis result from another axis profile
```

A supplied triad is accepted only when its local x runs from I to J within the declared `spanDirectionTolerance`; otherwise the span is rejected with `MODEL_COMPILER_AXIS_ELEMENT_MISMATCH`. Nothing is reoriented, renormalised or flipped, and I/J order is never reversed to make a mismatched triad fit: reversing I/J changes the meaning of every end-indexed result and must be an explicit topology change.

Zero-length analytical links are prohibited. A span whose two ends are the same conditioned node is rejected with `MODEL_COMPILER_ZERO_LENGTH_LINK_PROHIBITED`; a span at or below the declared `minimumElementLength` is rejected with `MODEL_COMPILER_ELEMENT_BELOW_MINIMUM_LENGTH`.

## Constraint declarations

Declarations are resolved to the global node DOF they act on, then checked. Two declarations acting on one node DOF block compilation with `MODEL_COMPILER_CONSTRAINT_CONFLICT` — section 5.3, conflicting release, restraint and rigid-link definitions. The conflict pass runs before representability, so a conflict is reported as a conflict.

`fea-linear-model/v1` carries global node/DOF constraints only. `NODAL_RESTRAINT` compiles to `FIXED` or `PRESCRIBED_SLOT`; `PARTIAL_RELEASE_SPRING` compiles to `LINEAR_SPRING` with a positive finite rate. `END_RELEASE`, `RIGID_LINK` and `RIGID_OFFSET` have no representation in this contract version and block compilation with `MODEL_COMPILER_END_RELEASE_NOT_REPRESENTABLE` or `MODEL_COMPILER_RIGID_LINK_NOT_REPRESENTABLE`. They are refused rather than dropped: silently discarding a declared release would change the mechanics without changing the record.

## Declared numerical policy

`minimumElementLength` and `spanDirectionTolerance` are the only numeric policies this package applies. Both are read through `requireDeclaredValue`, so an absent entry is rejected with `MINIMUM_ELEMENT_LENGTH_NOT_DECLARED` or `SPAN_DIRECTION_TOLERANCE_NOT_DECLARED` rather than substituted. A `source` naming a hidden default — `DEFAULT`, `FALLBACK`, `HARDCODED`, `IMPLICIT`, `ASSUMED`, `TBD`, `UNKNOWN` — is refused with `MODEL_COMPILER_PROFILE_SOURCE_NOT_TRACEABLE`, because a default wearing a declaration's clothes is still a default.

The package exports no ready-made profile. A project authors one and can export it.

## Limitations and diagnostics

Section-state approximation disclosures propagate into `model.limitations`, de-duplicated by code: present, present once, never dropped. Two authorities declaring one code with different content block compilation with `MODEL_COMPILER_LIMITATION_CONFLICT`. An element span whose axes came from the B-2.4 fallback reference adds `MODEL_COMPILER_LIMITATION_LOCAL_AXIS_FALLBACK_REFERENCE` with `stiffnessRelevant: false` — the axes themselves already carry the mechanical effect, and the disclosure is prose about it.

Each element emits one `MODEL_ELEMENT_BINDING_RESOLVED` diagnostic retaining the material-resolution, section-resolution and local-axis semantic hashes.

## Identity

The compilation record carries the section 2.1 chain in order:

```text
sourceSemanticHash
-> conditionedTopologyHash
-> mechanicalModelSemanticHash
-> stiffnessStateHash
```

`mechanicalModelSemanticHash` is the sealed model's `semanticHash` and `stiffnessStateHash` is the sealed model's `stiffnessStateHash`; a record where either has drifted is rejected with `MODEL_COMPILER_IDENTITY_CHAIN_BROKEN`. Both are computed by `linear-fea-contract/model-hashes.js`, and the compilation record's own `semanticHash` and `evidenceHash` use `shared-piping-model/canonical-json.js`. This package implements no hash of its own.

Element and constraint record identities are accepted-model semantics but not stiffness semantics: renaming them changes `mechanicalModelSemanticHash` and leaves `stiffnessStateHash` unchanged. Source ancestry behaves the same way. Node and element ordering is `CANONICAL_ASCII_LEXICOGRAPHIC_ASCENDING_V1`, so input order does not reach any hash and repeated compilation is byte-identical.

## Checks

```text
npm run check:lfea-b2.5
```

`scripts/lfea-b2.5-model-compiler-check.mjs` is the contract check, `scripts/lfea-b2.5-reviewer-check.mjs` holds the permanent regressions, and `scripts/lfea-b2.5-source-guard.mjs` reads the package as text. The check runs inside `check:lfea-core` and therefore inside `gate`.
