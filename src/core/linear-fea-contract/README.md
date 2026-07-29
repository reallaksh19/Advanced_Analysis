# Linear FEA numerical convention contract

This package defines the versioned numerical conventions used by the linear-static 3D piping beam kernel. It does not implement local-axis construction, element stiffness, loads, assembly, solving, stress recovery, SIFs, nonlinear behavior, or UI behavior.

## Ordering and storage

- Node DOFs: `UX, UY, UZ, RX, RY, RZ`.
- Element ends: `I, J`, with local x directed from I to J.
- Element vector: `I:UX I:UY I:UZ I:RX I:RY I:RZ J:UX J:UY J:UZ J:RX J:RY J:RZ`.
- Local result components: `FX, FY, FZ, MX, MY, MZ` at each end.
- Vectors are column vectors.
- Dense 12×12 element matrices are flattened row-major; entry `(row, column)` is at `row * 12 + column`.

These orders are authoritative for `fea-linear-conventions/v1`. Changing any order requires a future contract version.

## Transformation direction

The authoritative convention is:

```text
d_local = T d_global
K_global = transpose(T) K_local T
q_global = transpose(T) q_local
```

`q` and `d` are work-conjugate, so the convention preserves virtual work:

```text
transpose(q_global) d_global = transpose(q_local) d_local
```

Local-axis construction is intentionally deferred. A later package must version the deterministic fallback profile, near-parallel tolerance, retained evidence, and right-handed-basis checks. Camera state, viewport state, object iteration order, and randomness are not admissible mechanical inputs. Changing released local y/z orientation changes signed local bending and shear components even for circular sections.

## End actions, reactions, and imposed values

`END_ACTION_CONVENTION` is the machine-readable authority. Reported local end actions are forces and moments exerted by the connected joint on the element end, resolved in element-local axes. The element action on the joint is the negative of the reported action.

The frozen recovery shape is:

```text
q_local = K_local d_local
          - equivalentLoadVector
          - initialStrainLoadVector
```

B-2.0 freezes the physical action and subtraction shape only. B-3 and the element-formulation package must freeze the exact retained-vector names, interpolation, construction, and assembly rules.

Reactions are support actions on the structure:

```text
R = K U - F
```

`F` is an externally applied nodal load on the structure. A prescribed displacement is a structural DOF value in `U`; it is not an applied force. Its reaction is recovered from the residual after the complete displacement state is known.

## Thermal semantics

Positive temperature change with a positive thermal-expansion coefficient produces positive initial extension strain. Thermal expansion is an initial-strain effect, not an unconditional global nodal force. Absolute temperature and temperature difference are separate quantity types even though both use kelvin in the canonical SI contract.

Evaluation of `alpha(T)`, installation/reference-state modeling, operating-temperature fields, stiffness-property temperature resolution, thermal equivalent loads, and factorization-cache keys remain deferred. A later solver may reuse a factorization only when the fully resolved stiffness operator is identical.

## Identifiers and canonical ordering

Kernel canonical node IDs use the ASCII-only grammar identified by `CANONICAL_NODE_ID_GRAMMAR_ID`. They start with an ASCII alphanumeric character and may then contain ASCII alphanumeric characters, `.`, `_`, or `-`. The `:` delimiter is excluded, so `nodeId:dof` identities cannot collide through delimiter ambiguity. Source-system IDs may be retained separately as unrestricted ancestry evidence.

Canonical ordering is `CANONICAL_ASCII_LEXICOGRAPHIC_ASCENDING_V1`. It compares ASCII code units from left to right, then places the shorter string first when one is a prefix. It is not natural-number sorting. Therefore:

```text
A-10 < A-2
```

The comparator does not use `localeCompare()`, `Intl.Collator`, or host locale settings.

## Numeric normalization

`FINITE_IEEE754_NEGATIVE_ZERO_NORMALIZED_V1` rejects non-number values, `NaN`, and both infinities; normalizes negative zero to positive zero; and preserves every other finite IEEE-754 value.

## Canonical units

The exact `fea-linear-units/v1` record is:

```text
length                         m
area                           m^2
secondMomentOfArea             m^4
polarMomentOfArea              m^4
force                          N
moment                         N*m
distributedForce               N/m
stress                         Pa
strain                         1
mass                           kg
massDensity                    kg/m^3
acceleration                   m/s^2
translationalStiffness         N/m
rotationalStiffness            N*m/rad
absoluteTemperature            K
temperatureDifference          K
thermalExpansionCoefficient    1/K
rotation                       rad
```
