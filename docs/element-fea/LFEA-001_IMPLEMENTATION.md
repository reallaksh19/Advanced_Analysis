# LFEA-001 — Minimal 2D linear-elastic local FEA foundation

## Repository reality and scope

- Authorized baseline: `ce719a719a740d5228b5a404a6848af878954609` on `main`.
- PR #132 was reassessed before shell work. It is closed and its v4 registry/view-state behavior is not modified.
- Existing draft PR #136 overlaps LFEA-001 but has an owner disposition of **PAUSED — SPLIT REQUIRED**. This implementation does not update that branch and contains no application-shell, navigation, registry, view-state, readiness, layout, browser, or W10 registration changes.
- Open PR #135 owns separate local-stress prototype work and previously identified shell-v5 authority conflicts. No file from that PR is modified.
- Existing immutable evidence utilities are retained: baseline `deepFreeze`, canonical JSON, and semantic hashing.
- No scalable sparse backend is approved. The implementation provides only `dense-ldlt-reference/v1` behind an explicit backend identity and profile DOF ceiling.

## Implemented authority chain

```text
lfea-profile/v1
+ fea-continuum-model/v1
→ fail-closed model qualification and ancestry validation
→ deterministic node / UX-UY equation allocation
→ T3 signed-area, B, constitutive, stiffness and edge-load operations
→ deterministic global assembly
→ partition/elimination for fixed and prescribed displacements
→ dense small-model LDLᵀ reference solve
→ original-system reactions, residuals, equilibrium and energy
→ T3 strain/stress/principal/von-Mises/internal-force recovery
→ immutable fea-continuum-result/v1
```

Authority remains separated across profile/model qualification, element operations, assembly, constraints, linear algebra, recovery, and result evidence. No UI, viewport, sparse backend, fixture, or consumer defines physical sign conventions.

## Explicit numerical conventions

- Formulations: `PLANE_STRESS`, `PLANE_STRAIN`.
- Element: counterclockwise T3 only.
- Nodal DOFs: `UX, UY`.
- Element displacement order: `UX1, UY1, UX2, UY2, UX3, UY3`.
- Strain order: `EX, EY, GXY`; `GXY` is engineering shear.
- Stress order: `SX, SY, TXY`.
- Plane stress requires explicit positive element thickness.
- Plane strain rejects element thickness and uses the explicit profile `outOfPlaneScale`.
- Positive pressure is compressive and acts opposite the outward normal of the counterclockwise element edge.
- Reactions are support forces acting on the structure and are reconstructed from the unmodified assembled system.
- Plane-strain von Mises includes recovered `sigmaZ`.
- T3 stress is authoritative over the constant element domain. No nodal averaging or smoothing is implemented.

## Closed input and ancestry contract

Every solver-authoritative entity has an explicit identity and exact `sourceSemanticHash`:

- nodes;
- materials;
- elements;
- fixed restraints;
- prescribed displacements;
- load cases;
- nodal forces;
- edge loads;
- source references.

Unknown fields are rejected rather than ignored. This prevents unsupported quantities such as out-of-plane loads, body forces, hidden material settings, or alternate conventions from being silently discarded.

The model carries `solverProfileIdentity` and an embedded immutable profile; the identities must match. A supplied model semantic hash is accepted only when it exactly matches reconstructed canonical evidence.

## Constraint and reaction treatment

For prescribed displacement vector `uc`:

```text
Kff uf = Ff - Kfc uc
```

The result retains the free applied load, the imposed-displacement contribution `Kfc uc`, and the effective free load. The complete displacement vector is reconstructed before calculating:

```text
imbalance = K_original u - F_original
reaction  = constrained components of imbalance
global residual = imbalance - reaction vector
```

No row-only overwrite, penalty stiffness, weak spring, pivot clamp, or artificial diagonal stiffness is used.

## Result evidence

Qualified `fea-continuum-result/v1` evidence includes:

- model, source, profile, backend, runtime, and load-case identities;
- canonical DOF map and constraint partition;
- direct nodal-load and equivalent edge-load vectors plus load-identity evidence;
- imposed-displacement and effective free-load evidence;
- nodal displacements and restrained reactions;
- element strains, stresses, `sigmaZ`, principal stresses, principal orientation, von Mises stress, internal force, and energy;
- free-DOF and complete-system residuals;
- applied-load, reaction, and equilibrium force/moment totals;
- global and element strain-energy consistency;
- diagnostics, limitations, assembled-system hash, and result semantic hash.

Singular, ill-conditioned, backend-failed, residual-failed, or equilibrium-failed runs contain no partial displacement or stress evidence.

## Independent qualification fixtures

Run:

```text
node scripts/lfea-001-check.mjs
```

The isolated suite covers:

1. exact hand-check area, B, strain, stress, internal force, and energy;
2. multi-element linear patch;
3. rigid translation;
4. rigid rotation;
5. uniaxial plane-stress tension with Poisson contraction;
6. uniaxial plane-strain response including `sigmaZ`;
7. pure shear, principal direction, and von Mises stress;
8. biaxial strain;
9. rotated geometry;
10. nonzero prescribed-displacement partitioning;
11. uniform edge traction;
12. pressure-normal direction independent of supplied endpoint order;
13. reaction recovery;
14. free-DOF residual;
15. complete-system residual and force/moment equilibrium;
16. strain energy and element/global consistency;
17. disconnected topology;
18. unrestrained rigid-body singularity;
19. zero-area triangle;
20. inverted triangle;
21. invalid material;
22. invalid thickness and plane-strain scaling ambiguity;
23. stale/mixed ancestry on every entity family;
24. repeated-run and reordered-input deterministic byte and semantic identity;
25. unsupported fields, types, internal-edge loads, duplicate loads, contradictory constraints, capacity excess, and ill-conditioning quarantine.

Expected benchmark values are analytically specified in the fixtures and are not generated by the production implementation.

## Hand-check fixture

```text
N1 = (0, 0) mm
N2 = (100, 0) mm
N3 = (0, 100) mm
E = 15 N/mm²
nu = 0.25
t = 2 mm
u(x,y) = 0.01 x
v(x,y) = 0
```

Expected evidence:

```text
signed area = 5000 mm²
strain = [0.01, 0, 0]
stress = [0.16, 0.04, 0] N/mm²
internal force = [-16, -4, 16, 0, 0, 4] N
strain energy = 8 N·mm
```

## Limitations and unresolved release gates

- Dense small-model reference backend only.
- No production sparse backend or production model-size claim.
- Profile tolerances are explicit and qualification-fixture-specific; they are not universal production tolerances.
- No Q4, higher-order, shell, axisymmetric, or 3D solid elements.
- No automatic meshing, mesh repair, adaptive refinement, or authoritative nodal stress smoothing.
- No springs, body force, gravity, thermal strain, nonlinear material, contact, friction, gap, plasticity, buckling, or dynamics.
- No W11 coupling or imported piping resultants.
- No application tab or shipped UI availability claim.
- No piping-code, commercial-solver parity, weld, fatigue, nozzle, or certified-local-stress claim.
- Repository-wide build, lint, full-validation, and browser suites require the complete repository checkout and remain release gates in environments where GitHub checkout is available.
- Release certification remains outside LFEA-001 authority.
