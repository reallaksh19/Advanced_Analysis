# LFEA B-2.4 deterministic frame local-axis report

## Scope and integration

- Work package: `LFEA-B2.4`
- Original required base SHA: `88b3f3c3d1bd64b099c22a1bdd2a9cb1cc34180d`
- Integration dependency: merged B-2.1 contract
- Target branch: `feat/lfea-b2-4-local-axes`
- Numerical owner: `src/core/centerline-beam-fea`
- Contract schemas: `frame-local-axis-profile/v1` and `frame-local-axis-result/v1`

The implementation is a pure numerical geometry authority for deterministic local axes of straight two-node 3D frame elements. It does not create mechanical-model records, stiffness matrices, loads, solver state, stress results, or UI behavior.

B-2.4 is registered through `check:lfea-b2.4`, which is reached from `check:lfea-core` after B-2.0 and B-2.1.

## Authoritative profile

```js
{
  schema: 'frame-local-axis-profile/v1',
  profileId: 'PIPE-FRAME-AXIS-R1',
  zeroLengthTolerance: 1e-10,
  referenceNormTolerance: 1e-14,
  parallelTolerance: 1e-10,
  unitVectorTolerance: 1e-12,
  orthogonalityTolerance: 1e-12,
  handednessTolerance: 1e-12,
  determinantTolerance: 1e-12,
  parallelBoundaryRule: 'PARALLEL_WHEN_RESIDUAL_LE_TOLERANCE',
  fallbackSelectionRule: 'MINIMUM_ABSOLUTE_ALIGNMENT_THEN_DECLARED_ORDER',
  fallbackCandidates: [
    { candidateId: 'GLOBAL_X', vector: [1, 0, 0] },
    { candidateId: 'GLOBAL_Y', vector: [0, 1, 0] },
    { candidateId: 'GLOBAL_Z', vector: [0, 0, 1] },
  ],
  semanticHash: 'fnv1a64:71ed4453e3e6e6bc',
}
```

All profile keys are exact-key validated. Every tolerance is finite, positive, versioned, hash-bound, and retained in result verification evidence. Fallback IDs are unique and candidate vectors are finite and nonzero.

The profile and result hashes use the repository canonical JSON and UTF-8 semantic-hash authority in `src/core/shared-piping-model/canonical-json.js`. B-2.4 does not maintain a second FNV implementation.

## Construction algorithm

1. Validate both node coordinates as exact three-value finite arrays.
2. Compute `delta = nodeJ - nodeI`, `length = norm(delta)`, and reject `length <= zeroLengthTolerance`.
3. Set `localX = normalize(delta)`.
4. Validate and retain the declared reference vector. Reject invalid shape, nonfinite values, or `norm <= referenceNormTolerance`.
5. Compute the dimensionless residual:

   ```js
   norm(cross(localX, referenceVector)) / norm(referenceVector)
   ```

6. Classify the supplied reference as unusable when:

   ```text
   parallelResidual <= parallelTolerance
   ```

7. If unusable, evaluate every fallback candidate in declared array order, normalize each candidate, minimize `abs(dot(localX, candidate))`, and retain the first candidate on an exact tie.
8. Construct:

   ```text
   y0 = normalize(reference - dot(reference, x) x)
   z  = normalize(x × y0)
   y  = normalize(z × x)
   ```

9. Verify unit norms, mutual orthogonality, right-handedness, determinant positivity, and determinant residual.
10. Hash and deeply freeze the complete retained result, then revalidate it against the profile and construction evidence.

No arbitrary sign repair, presentation input, random perturbation, hidden tolerance, or caller-array mutation is permitted.

## Result evidence

The result retains:

- element delta and length;
- the original declared reference vector, norm, parallel residual, and acceptance state;
- selected source, fallback candidate ID where applicable, vector, and alignment;
- local x, y, and z axes;
- all four verification tolerances;
- norm, orthogonality, handedness, determinant, and determinant-residual evidence;
- accepted, parallel, near-parallel, fallback-selected, and tie-resolved diagnostics;
- profile and result semantic hashes.

For `(0,0,0) -> (0,0,5)` with declared reference `(0,0,1)`, the deterministic fallback is `GLOBAL_X`, producing:

```text
x = (0,0,1)
y = (1,0,0)
z = (0,1,0)
```

The rejected source reference remains independently visible in evidence.

## Qualification tests

The analytical checker covers `B24-T01` through `B24-T23`, including:

- accepted and fallback paths;
- deterministic exact-tie resolution;
- arbitrary 3D orientation;
- zero-length and invalid-reference rejection;
- inclusive exact-boundary behavior;
- immediately-above-boundary acceptance;
- reference-magnitude scale invariance;
- caller immutability and deep-frozen output;
- byte determinism and object-key-order-independent hashing;
- fallback-array-order semantics;
- proper-rotation covariance;
- deterministic node reversal;
- inclusive unit, orthogonality, handedness, and determinant qualification;
- stale profile and result hash rejection.

The reviewer check additionally proves repository hash compatibility for non-ASCII profile data. This prevents the `fnv1a64:` identity from changing meaning when a source-native or project profile identifier contains Unicode.

## Rotation covariance

When a proper orthogonal matrix `Q` is applied to nodes, the declared reference, and every fallback vector, accepted-reference and fallback cases satisfy:

```text
x' ≈ Qx
y' ≈ Qy
z' ≈ Qz
```

A fixed global fallback profile is intentionally not generally covariant when geometry alone is rotated.

## Node reversal

Swapping I and J reruns the complete algorithm. For the benchmark with an unchanged accepted reference:

```text
x_reversed ≈ -x_original
y_reversed ≈  y_original
z_reversed ≈ -z_original
```

The basis remains orthonormal and right-handed. Element-end ownership is exchanged, so end-indexed signed local results may change sign or location even when global physical meaning is preserved.

## Anti-drift and reviewer corrections

The source guard rejects:

- camera, viewport, renderer, screen, or canvas input;
- randomness and clocks;
- locale-sensitive ordering;
- object-enumeration fallback order;
- in-place fallback sorting;
- wrong cross-product order;
- hardcoded perturbation repair;
- hidden verification tolerances;
- duplicate local-axis ownership;
- local reimplementation of canonical JSON or FNV hashing;
- missing package-gate registration.

Independent review corrected one repository-level authority defect before merge: the original branch implemented a private FNV hash over JavaScript UTF-16 code units. It was replaced with the repository UTF-8 canonical semantic-hash authority, and a Unicode regression test was added. The default ASCII profile hash remains unchanged.

## Deliberate regressions

The analytical checker demonstrates failure or contract divergence for:

1. view-dependent fallback;
2. object-enumeration fallback order;
3. an unnormalized cross-product threshold;
4. `<` replacing `<=`;
5. `y × x` replacing `x × y`;
6. overwriting the supplied reference;
7. perturbation-driven nondeterminism;
8. in-place sorting of caller fallback candidates;
9. removal of right-handedness verification.

No deliberate mutation remains in production source.

## Required qualification command

```text
npm run check:lfea-b2.4
```

The dedicated command executes:

```text
node scripts/lfea-b2.4-local-axes-check.mjs
node scripts/lfea-b2.4-reviewer-check.mjs
node scripts/lfea-b2.4-source-guard.mjs
```

Release qualification also requires B-2.0, B-2.1, LFEA core/workbench, strict syntax, import checks, build, the full repository gate, `git diff --check`, and a clean checkout.

## Known limitations

- Straight two-node 3D elements only.
- No stiffness, load, material resolution, section compilation, releases, assembly, solve, stress, or UI behavior.
- Proper-rotation covariance requires rotating the fallback profile with the geometry when fallback selection participates.
- Exact mathematical ties use exact IEEE-754 equality and declared candidate order, as specified.

## Status

B-2.4 STATUS: QUALIFIED
