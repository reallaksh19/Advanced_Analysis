# LFEA B-2.3 Circular-Pipe Section-Property Compiler

## Final integration baseline

- Base branch: `main`
- Rebuilt from merged B-2.2 mainline: `091ab8aa85e5373bac3c5db49e20ff00b8e8bb60`
- Branch: `feat/lfea-b2-3-pipe-section`
- Supported formulation: `PIPE_CIRCULAR_ANNULUS_V1`

## Scope

B-2.3 compiles already-resolved SI outer diameter and wall thickness into the exact B-2.1 section-state shape:

```text
sectionStateId
area
secondMomentY
secondMomentZ
polarMoment
sourceEvidence
```

It performs no NPS/schedule/catalogue lookup, corrosion resolution, material resolution, mass/weight calculation, local-axis construction, stiffness assembly, loading, solving, stress recovery or UI work.

## Governing formulas

```text
Di = Do - 2t
A  = pi t (Do - t)
I  = (pi / 16) t (Do - t) (Do^2 + Di^2)
Iy = I
Iz = I
J  = 2I
```

The production implementation does not evaluate `Do^4 - Di^4` directly and does not round calculated properties.

## Geometry gates

```text
Do finite and > 0
t finite and > 0
2t < Do
Di finite and > 0
Di < Do
A, Iy, Iz and J finite and > 0
```

Exact rejection distinctions:

```text
2t = Do  -> PIPE_SECTION_SOLID_NOT_SUPPORTED
2t > Do  -> PIPE_SECTION_INNER_DIAMETER_INVALID
Di not representably less than Do -> PIPE_SECTION_GEOMETRY_NOT_RESOLVABLE
```

No hidden wall-ratio tolerance or clamping rule is present.

## Hash authorities

- Request semantic hash binds schema, section identity, formulation, dimensions and source evidence.
- Profile semantic hash binds schema, profile ID, formulation and all arithmetic rules.
- Resolution semantic hash binds profile/request hashes, dimensions, section state, verification and limitations.
- Evidence hash additionally binds diagnostics and qualification evidence.

All hashes use the repository canonical JSON and UTF-8 semantic-hash authority.

## Reviewer corrections

The original parallel implementation contained a profile hash defect:

```text
schema: profile.scheme
```

This omitted `profile.schema` from the profile semantic identity. It is corrected to:

```text
schema: profile.schema
```

Standalone profile and result validation now also bind to the single qualified R1 profile identity and hash. A self-resealed R2 profile or result cannot masquerade as qualified R1 evidence.

Permanent reviewer checks prove:

1. profile schema changes alter profile semantic identity;
2. substituted profile IDs are rejected;
3. substituted profile hashes in self-resealed results are rejected.

## Qualification coverage

- 28 required analytical tests;
- 9 deliberate regressions;
- stable thin-wall evaluation;
- independent benchmark values;
- exact B-2.1 section-state shape;
- UTF-8 source-evidence hashing;
- deep immutability and stale-hash rejection;
- source guard and reviewer profile-authority guard;
- exact-head repository certification.

## Integration

`package.json` registers:

```text
check:lfea-b2.3 =
node scripts/lfea-b2.3-pipe-section-check.mjs
&& node scripts/lfea-b2.3-reviewer-check.mjs
&& node scripts/lfea-b2.3-pipe-section-source-guard.mjs
```

`check:lfea-core` executes B-2.3 after B-2.2.

## Known limitations

- Circular annuli only.
- Inputs must already be resolved SI dimensions.
- No solid-section fallback.
- No catalogue, material, mass, load, solver, stress or UI behavior.

B-2.3 STATUS: QUALIFIED WITH REVIEWER FIXES
