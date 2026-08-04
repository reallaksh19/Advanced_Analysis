# Agent 13 handoff — CAESAR rigid-element authority

This change adds a sealed pure authority for the CAESAR rigid-element stiffness, weight, thermal, recovery and code-stress-exclusion rules.

## Implemented

- original inside diameter plus ten times entered wall thickness for stiffness;
- entered rigid weight as the body-weight authority;
- no inferred pipe-wall metal weight;
- equivalent fluid weight at the original inside diameter;
- `1.75` times equivalent insulation/cladding weight at the entered outside diameter;
- zero entered weight suppresses all rigid/fluid/insulation/refractory/cladding weight;
- uniform consistent gravity vector preserving resultant and first moment;
- finite thermal strain and free expansion;
- force/moment recovery eligibility with piping-code-stress exclusion;
- deterministic sealed request and authority hashes.

## Boundary

This PR does not alter BM1, assemble a global model, solve a load case or calculate code stress. A later integration may consume the sealed authority through the existing frame/component and load-expansion owners.
