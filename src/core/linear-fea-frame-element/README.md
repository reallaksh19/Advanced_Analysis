# Straight 3D frame element

This package compiles one straight pipe span into an immutable `fea-linear-frame-element/v1` record: the 12x12 local stiffness, the local-to-global transformation identity, consistent equivalent-load vectors for the B-3.0 distributed-load primitives it supports, the thermal initial-strain load vector, the end-release condensation result, partial-release end springs and rigid end offsets. It is the LFEA-B3.1 exit boundary (sections 5.1-5.4).

It does not assemble. There is no DOF map, no global index, no sparse structure, no factorization and no reaction here — those are B-3.3 — and no bend, reducer or rigid-component mechanics, which are B-3.2. The element returns local and global matrices and vectors plus evidence, and stops.

## Inputs

Every input is passed explicitly; the package reads no module-level state, and every upstream authority is re-accepted through its own validator rather than trusted or re-derived:

```text
elementId         canonical kernel identity
material          fea-linear-material-resolution/v1        (B-2.2 validator)
section           fea-linear-pipe-section-resolution/v1    (B-2.3 validator)
localAxes         { result, profile }                      (B-2.4 verifyFrameLocalAxes)
profile           fea-linear-frame-element-profile/v1
distributedLoads  sealed fea-linear-load-primitive/v1 records, DISTRIBUTED_LOAD kind
temperature       sealed TEMPERATURE primitive or null
releases          [{ end, dof }] local DOF releases
endSprings        [{ end, dof, stiffness }] partial-release springs
rigidOffsets      { I, J } global offset vectors or null
```

The element length is cited from the B-2.4 result's `elementDirection.length`; the local basis is the qualified axes exactly as that authority produced them. A primitive naming another element is refused with `FRAME_ELEMENT_PRIMITIVE_ELEMENT_MISMATCH`; an unsupported kind with `FRAME_ELEMENT_PRIMITIVE_UNSUPPORTED`.

## Formulation profile

`straightPipeFormulation` declares `PIPE_FRAME3D_EULER_BERNOULLI_V1` or `PIPE_FRAME3D_TIMOSHENKO_V1`. The declaration is the formulation identity: there is no geometry-based switch, and a `shearDeformation` flag that contradicts the formulation is blocked with `FRAME_ELEMENT_SHEAR_DECLARATION_MISMATCH` rather than reconciled. Euler-Bernoulli is computed as the exact `phi = 0` member of the same matrix family, so slender-beam convergence is a property of the formulas, not of a tolerance.

A Timoshenko profile must declare `shearCorrectionFactorY` and `shearCorrectionFactorZ` as `{ value, source }` entries, read through `requireDeclaredValue` — absent is `SHEAR_CORRECTION_FACTOR_Y_NOT_DECLARED`, a hidden-default source is `FRAME_ELEMENT_PROFILE_SOURCE_NOT_TRACEABLE`, and an Euler-Bernoulli profile carrying either is an unexpected field. `releaseSingularityTolerance` is declared the same way. The package exports no ready-made profile.

Thermal strain accepts `UNIFORM_TEMPERATURE_ALPHA_DELTA_T_V1` only; selecting temperature-dependent alpha integration is blocked with `FRAME_ELEMENT_THERMAL_ALPHA_INTEGRATION_NOT_IMPLEMENTED`, never downgraded.

## Mechanics

The local stiffness follows the frozen B-2.0 element DOF order with `ROW_MAJOR_12X12_V1` storage: axial `EA/L`, Saint-Venant torsion `GJ/L` on the declared polar moment, and two independent bending planes — local y deflection on `Iz` with shear parameter `phiXY = 12 E Iz / (G kappaY A L^2)`, local z deflection on `Iy` with `phiXZ` on `kappaZ A`. The transformation is the frozen identity `d_local = T d_global`, `K_global = transpose(T) K_local T`, with `T` built from four diagonal copies of the cited B-2.4 axes.

Consistent equivalent nodal loads integrate the same shear-parameter shape functions the stiffness uses, in closed form, for uniform and linearly varying intensities in the global or element-local basis (section 3.4: consistent vectors, not arbitrary fine meshing). The thermal initial-strain vector is `E A alpha deltaT` axial pairs under `POSITIVE_DELTA_T_PRODUCES_POSITIVE_INITIAL_EXTENSION_V1`, satisfying the frozen recovery shape `q = K d - equivalentLoad - initialStrainLoad`: free expansion yields zero end action, full restraint yields `-E A alpha deltaT`.

## End conditions and offsets

Releases and springs are explicit local DOFs at I or J, condensed under `STATIC_CONDENSATION_V1`: a spring couples the element end to the joint DOF, a release is the zero-stiffness member of the same condensation, and the load vectors are condensed with the matrix. Conflicts block — a DOF released twice, sprung twice or both is `FRAME_ELEMENT_RELEASE_CONFLICT`; a non-positive spring is `FRAME_ELEMENT_SPRING_STIFFNESS_INVALID`; all six DOFs released at one end is `FRAME_ELEMENT_RELEASE_MECHANISM`; and a released set whose condensation block is singular at the declared pivot boundary (for example axial released at both ends) is `FRAME_ELEMENT_RELEASE_SINGULAR`, blocked rather than regularised.

Rigid end offsets apply the kinematic map `u_end = u_joint + theta x r` to the global matrix and vectors, so forces transfer with moment-arm consistency (`m_joint = m_end + r x f_end`). The rigidity of the offset is disclosed as a limitation.

## Record and identity

The sealed record carries formulation identity, profile hash, cited material/section/axis identities with their resolution hashes, geometry, transformation, `localStiffness` (condensed, element-local basis at element ends), `globalStiffness` (transformed, with offset kinematics applied at the joints), both load vectors in local and global form, applied-load citations, thermal evidence, end conditions, offsets and sorted limitation disclosures — straight-beam approximation always, no-shear-deformation under Euler-Bernoulli, uniform-temperature approximation when thermal load is present, rigid-offset rigidity when offsets are present, plus the section state's own disclosures.

`semanticHash` is computed by `shared-piping-model/canonical-json.js` over everything but itself; this package implements no hash of its own. `requireFrameElement` re-accepts a record by exact keys, frozen convention citations and hash, refusing a stale hash with `FRAME_ELEMENT_HASH_MISMATCH`.

## Checks

```text
npm run check:lfea-b3.1
```

`scripts/lfea-b3.1-frame-element-check.mjs` holds the contract check and closed-form benchmarks — FRAME-AXIAL-01, FRAME-TORSION-01, FRAME-BEND-YZ-01, FRAME-SHEAR-01, UDL-01, THERMAL-01/02, release condensation, spring series stiffness, offset moment arms, rigid-body modes, symmetry and rotation covariance at the section 15.4 tolerances. `scripts/lfea-b3.1-reviewer-check.mjs` holds the permanent deliberate regressions (section 15.5) and `scripts/lfea-b3.1-source-guard.mjs` reads the package as text. The check runs inside `check:lfea-core` and therefore inside `gate`.
