# Physical load-case contracts

This package declares, validates and canonically hashes the physical load-case layer: the section 7.1 load primitives, the section 7.2 case and combination identities, and the temperature, pressure and prescribed-value states a solve consumes. It is the LFEA-B3.0 exit boundary.

It does not build an equivalent nodal load vector, an element thermal strain, a stiffness contribution, a right-hand side, a factorization or a B31.3 category combination. Each of those is owned elsewhere: the first three by the element-formulation packages (B-3.1/B-3.2), the next two by assembly and solve (B-3.3), the last by the code engine (B-4.0). A load case here says what is applied, to which model entity, under which declared basis, from which traceable source — and nothing about what the applied load then does.

## Inputs

Every input is passed explicitly. The package reads no module-level or browser-local state.

```text
loadCaseId        canonical kernel identity of the case
loadCaseClass     physical class — WEIGHT, THERMAL, PRESSURE, APPLIED_MECHANICAL,
                  EQUIVALENT_STATIC, PRESCRIBED_MOVEMENT or MIXED_PHYSICAL
presentation      display-only { label, description }
modelReference    fea-linear-load-case-model-reference/v1, from a B-2.5 compilation
primitives        author-supplied load primitives — see PRIMITIVE_INPUT_KEYS
profile           fea-linear-load-case-profile/v1
```

`modelReferenceFromCompilation` projects a sealed `fea-linear-mechanical-model-compilation/v1` down to the identities a load case may name: model identity and revision, `mechanicalModelSemanticHash`, `stiffnessStateHash`, node/element/material-state identities and the prescribed slots. No coordinate, material property, section property or local axis crosses into this layer. The compilation is re-accepted through B-2.5's own validator, so a tampered record is rejected by its owner before this package reads it.

## Load primitives

Each primitive is an immutable, independently semantic-hashed `fea-linear-load-primitive/v1` record (section 7.2):

```text
GRAVITY              direction, declared acceleration magnitude, included mass sources
DISTRIBUTED_WEIGHT   pipe/contents/insulation mass per unit length with density
                     and geometry evidence
PRESSURE             pressure, GAUGE or ABSOLUTE basis, and one explicit
                     authorisation flag per effect
TEMPERATURE          operating and installation temperatures, the stiffness-evaluation
                     material state, and the declared thermal-strain profile
NODAL_FORCE_MOMENT   force/moment resultant in the global frame or a declared local
                     basis, with units and sign convention
DISTRIBUTED_LOAD     uniform or linearly varying intensity, global or element-local
EQUIVALENT_STATIC    wind or seismic direction, declared coefficient, projected area
                     and project combination-class tag
PRESCRIBED_MOVEMENT  case value bound to a named PRESCRIBED_SLOT
```

Each entity a primitive names must exist in the bound model — `LOAD_CASE_NODE_UNKNOWN`, `LOAD_CASE_ELEMENT_UNKNOWN`, `LOAD_CASE_MATERIAL_STATE_UNKNOWN`, `LOAD_CASE_PRESCRIBED_SLOT_UNKNOWN`. Units are declared and compared, never converted (`LOAD_CASE_UNIT_MISMATCH`). A direction that is not a unit vector within the declared tolerance is rejected with `LOAD_CASE_DIRECTION_NOT_UNIT` rather than renormalised, and a declared local basis is qualified through the shared `requireOrthonormalBasis` rather than repaired.

Sign convention is a declared pair, following `attachment-load-contract`. Only `APPLIED_TO_STRUCTURE` is representable; `REACTION_ON_SOURCE` is refused with `LOAD_CASE_SIGN_CONVENTION_NOT_REPRESENTABLE` so the flip happens deliberately, in the package that owns the resultant.

Pressure effects are four explicit flags — code stress, pressure stiffening, axial thrust, Bourdon. Nothing is inferred from the presence of a pressure value, a missing or non-boolean flag is `LOAD_CASE_PRESSURE_EFFECT_NOT_DECLARED`, and each authorised effect adds a disclosure that authorisation is not implementation.

One state per entity per case: two pressure states on one element, two temperature states on one element, two values for one prescribed slot or two gravity fields are contradictions and are refused (`LOAD_CASE_PRESSURE_STATE_AMBIGUOUS`, `LOAD_CASE_TEMPERATURE_STATE_AMBIGUOUS`, `LOAD_CASE_PRESCRIBED_SLOT_DOUBLE_BOUND`, `LOAD_CASE_GRAVITY_AMBIGUOUS`).

## Prescribed slots

Section 6 binds case-specific movement to a `PRESCRIBED_SLOT` record. In `fea-linear-model/v1` that record is the model constraint whose behavior is `PRESCRIBED_SLOT`, so the slot name is the constraint identity and the node and DOF it governs are the model's. A load case supplies the value only; a value whose node or DOF disagrees with the slot is `LOAD_CASE_PRESCRIBED_SLOT_MISMATCH`. The contract carries no separate slot record with its own basis or sign — if a later package needs one, it is a mechanical-model change, not a load-case change.

## Thermal strain

Section 5.4 makes element thermal strain a physical-load-case input, not a property of the base stiffness model. This package carries the state, not the strain: operating temperature, installation reference and the material state the stiffness was evaluated at are three separate authorities and no temperature difference or strain is formed here.

The approximation is declared. `thermalStrainApproximation` accepts `UNIFORM_TEMPERATURE_ALPHA_DELTA_T_V1` and every temperature primitive names it, mismatch being `LOAD_CASE_THERMAL_PROFILE_MISMATCH`. Selecting `TEMPERATURE_DEPENDENT_ALPHA_INTEGRATION_V1` is refused with `LOAD_CASE_THERMAL_ALPHA_INTEGRATION_NOT_IMPLEMENTED`: alpha(T) integration belongs to the thermal-load compiler, and a deferred capability is blocked rather than downgraded to the uniform rule.

## Declared numerical policy

`gravitationalAcceleration` and `directionUnitTolerance` are the only numeric policies this package applies. Both are read through `requireDeclaredValue`, so an absent entry is rejected with `GRAVITATIONAL_ACCELERATION_NOT_DECLARED` or `DIRECTION_UNIT_TOLERANCE_NOT_DECLARED` rather than substituted. A `source` naming a hidden default — `DEFAULT`, `FALLBACK`, `HARDCODED`, `IMPLICIT`, `ASSUMED`, `TBD`, `UNKNOWN` — is refused with `LOAD_CASE_PROFILE_SOURCE_NOT_TRACEABLE`, using the same token list B-2.5 owns. Standard gravity is a project decision, not a constant of this package; a wind or seismic coefficient is likewise declared with its source on the primitive.

The package exports no ready-made profile. A project authors one and can export it.

## Case and combination identity

A combination declares membership, scale and each member's component semantics. Section 7.2 permits solved results to be combined only when component semantics and sign are compatible; that test needs solved results, which do not exist at this layer, so this record asserts membership and discloses `LOAD_CASE_LIMITATION_COMBINATION_SEMANTICS_UNVERIFIED`. Nothing is summed, scaled or superposed here. Members are read from the sealed load cases themselves, so a member hash cannot drift from the case it names, and members declared against different stiffness states are refused with `LOAD_CASE_COMBINATION_STIFFNESS_STATE_MISMATCH` — a solved state is one factorizable stiffness state plus one physical right-hand side.

A B31.3 category combination is a categorically different object and is refused by name wherever a solver-side name is expected — case class, case identity, combination identity, combination kind or project combination-class tag — with `LOAD_CASE_CODE_CATEGORY_NOT_A_SOLVER_CASE`. Code combinations reference qualified result components and apply edition rules; B-4.0 builds them.

## Identity

```text
mechanicalModelSemanticHash
-> stiffnessStateHash        (cited, never re-derived here)
-> physicalLoadCaseHash
```

`physicalLoadCaseHash` is a pure function of load-case content: schema, profile identity and hash, case identity and class, units, each primitive's identity/kind/semantic hash, and the merged limitations. The model reference, the presentation and the diagnostics are deliberately absent. Section 2.1 places the load-case hash after the stiffness state as the next link, not as a function of it, and section 7.2 keys factorization reuse by `stiffnessStateHash` and constrained partition — a load case that absorbed the stiffness state would make one right-hand side unusable across the factorization it was built for.

`semanticHash` is the accepted-record identity: the content hash bound to the model it was declared against. `evidenceHash` adds the diagnostics. Every hash is computed by `shared-piping-model/canonical-json.js`; this package implements no hash of its own.

Label and description are display-only and enter no hash — section 13.1, a display preference changes no engineering identity. Primitive ordering is `CANONICAL_ASCII_LEXICOGRAPHIC_ASCENDING_V1`, so input order does not reach any hash and repeated compilation is byte-identical.

## Limitations and diagnostics

Approximation disclosures are hash-bound to the primitive that produced them and merged into the case by code, de-duplicated: present, present once, never dropped. Two authorities declaring one code with different content block the case with `LOAD_CASE_LIMITATION_CONFLICT`. Every load-case limitation carries `stiffnessRelevant: false`; a record claiming otherwise is refused with `LOAD_CASE_LIMITATION_STIFFNESS_RELEVANT_PROHIBITED`, because a physical load case never alters stiffness identity.

Each primitive emits one `LOAD_CASE_PRIMITIVE_ACCEPTED` diagnostic retaining its source identity, revision and hash.

## Checks

```text
npm run check:lfea-b3.0
```

`scripts/lfea-b3.0-load-case-check.mjs` is the contract check, `scripts/lfea-b3.0-reviewer-check.mjs` holds the permanent regressions, and `scripts/lfea-b3.0-source-guard.mjs` reads the package as text. The check runs inside `check:lfea-core` and therefore inside `gate`.
