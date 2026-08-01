# LAFEA Non-Bucket NB-T4A — Analysis-Mesh Evidence Intake

## 1. Authority

NB-T4A introduces a read-only evidence boundary for an analysis mesh that has already been produced and explicitly accepted by the applicable stage contract.

It applies only to:

- `LAFEA.3` — current continuum element families `T3`, `T6` and `Q8`, subject to the declared mesh profile;
- `LAFEA.4` — retained production `CST_DKT_TRI3_THIN_SHELL_V1` authority;
- `LAFEA.5` — retained caller-authored host-shell footprint authority using the same current shell family.

Analytical `LAFEA.1` and `LAFEA.2` do not receive mesh evidence. `LAFEA.6` remains unsupported.

## 2. Input chain

The exact intake is:

```text
current sourceHash
→ current canonicalModelHash
→ current analysisGeometryHash
→ canonical lafea-mesh-profile/v1
→ explicit lafea-analysis-mesh/v1
→ stage-authorized mesh authority record
```

The governing schemas are:

- `lafea-mesh-profile/v1`;
- `lafea-analysis-mesh/v1`;
- `lafea-analysis-mesh-authority/v1`;
- `lafea-analysis-mesh-intake/v1`.

The authority record must state:

```text
authorityRole = STAGE_AUTHORIZED_ANALYSIS_MESH
status        = ACCEPTED_BY_STAGE_CONTRACT
```

It binds the exact stage, source, canonical model, analysis geometry, mesh profile and canonical mesh-content hashes.

## 3. Quality evidence

NB-T4A computes retained quality evidence from explicit analysis-mesh coordinates and connectivity. Thresholds come only from the canonical caller-declared mesh profile.

Current governed metrics are:

- aspect ratio;
- scaled Jacobian.

Evidence is retained per element and as an aggregate worst status:

- `OK`;
- `WARNING`;
- `BLOCK`.

A mesh with no blocking metric creates `CURRENT/PASS` `ANALYSIS_MESH` lifecycle evidence. A blocking metric creates `BLOCKED/BLOCK` evidence with an explicit lifecycle diagnostic. Blocking evidence is retained; it is not rewritten as a passing mesh.

## 4. Lifecycle registration

Registration requires current matching lifecycle parents:

```text
CANONICAL_MODEL   CURRENT/PASS
ANALYSIS_GEOMETRY CURRENT/PASS
```

The registered `ANALYSIS_MESH` record binds:

- `analysisGeometryHash`;
- opaque `meshProfileHash`;
- deterministic artifact hash;
- producer reference;
- exact registration identity.

Stale source, model or geometry ancestry is rejected before registration.

## 5. Explicit exclusions

NB-T4A does not:

- generate geometry or mesh topology;
- reinterpret `meshConfig` as produced mesh evidence;
- accept display tessellation, render packets or GPU buffers as analysis mesh;
- invoke continuum or shell calculation engines;
- create execution, recovery, convergence, SCL, structural-stress or code evidence;
- create report evidence;
- qualify release;
- change shell formulation, numerical tolerances or benchmark expected values.

Production geometry-to-mesh generation remains NB-T6 scope. Recovery/result render-evidence production remains NB-T4B scope.

## 6. Release state

Every NB-T4A evidence record retains:

```text
releaseState            = RELEASE_NOT_QUALIFIED
convergenceProduced     = false
codeAssessmentProduced  = false
reportProduced          = false
releaseQualified        = false
```

Issue #133 remains a separate LFEA piping repository-integration blocker and does not alter this bounded authority.
