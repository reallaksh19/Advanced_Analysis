# P1 Protected Manifest Contract

## Purpose

P1 may change operational cost, allocation, retained resources, draw-call count,
and disposal timing. It may not change engineering meaning, topology identity,
diagnostics, model-zone membership, engineering bounds, or exact pick identity.

The qualification runner derives the protected manifest through the production
normalizer, support-site builder, route partitioner, model-zone projection,
resolved-geometry builder, viewport render-model builder, and the real
`renderThreeModel()` scene-installation route.

## Custody

Every manifest is bound to:

- exact Git head SHA;
- execution ID;
- governed fixture role;
- repository-relative fixture path;
- source-byte SHA-256;
- `materializationAuthority: PRODUCTION_RENDER_THREE_MODEL`.

The parsed source package and source file bytes are hashed before and after the
complete projection and materialization. Any difference is `P1_SOURCE_MUTATED`.

## Pick-identity authority

The evidence code does not assign `userData.entityId`, repair missing child
identity, or construct a second pick table. It installs the viewport model using
`renderThreeModel()`, then reads the production `backend.objects` map and
resolves every root and descendant through `resolveThreeEntityId()`.

Each manifest row binds:

- object-map entity ID;
- deterministic root index;
- resolved root entity ID;
- deterministic object-tree path;
- object type;
- inherited resolved entity ID.

The map ID, root ID, and every descendant ID must agree exactly. Missing or
conflicting identity fails closed.

## Protected fields

| Field | Meaning |
|---|---|
| `sourceSha256` | Exact source bytes |
| `sourcePackageHash` | Parsed source package |
| `datasetHash` | Complete normalized dataset |
| `hierarchyHash` | Dataset hierarchy |
| `sharedModelHash` | Shared piping model |
| `supportSiteHash` | Canonical support-site model |
| `routePartitionHash` | Route partition model |
| `modelZoneHash` | Exact projected entity membership |
| `resolvedGeometryHash` | Resolved engineering geometry |
| `renderModelHash` | Viewport render model |
| `diagnosticManifestHash` | Diagnostic identity and status |
| `canonicalObjectManifestHash` | Render primitive and canonical object identity |
| `pickTargetManifestHash` | Production-installed object-tree pick identity |
| `sceneBoundsHash` | Governed engineering scene bounds |

The validator recomputes the four retained evidence hashes—diagnostics,
canonical objects, pick targets, and bounds—and recomputes their counts. A
well-formed but internally inconsistent manifest is rejected.

Generated Three UUIDs, object references, GPU handles, allocation addresses,
and wall-clock values are excluded.

## Permitted differences

A later P1 optimization may change only:

- timing and long-task evidence;
- geometry/material allocation and retained-resource counts;
- draw calls and instance count;
- internal resource references;
- disposal timing;
- scheduling or yielding boundaries.

A protected-field difference rejects the optimization. No tolerance, fuzzy
identity, unordered-set substitution, or coordinate rounding may convert a
difference into a pass.

## Comparison

`compareP1ProtectedManifests(before, after)` returns:

- `PASS_IDENTITY_PARITY` when every protected field matches; or
- `REJECTED_IDENTITY_DRIFT` with one row per changed protected field.

Execution custody fields such as branch head and execution ID are not
engineering products and are not compared as protected values.
