# Native Model Bootstrap Custody

## Scope

This slice introduces the pure authority required to create a blank native 3D model. It does not add pipe creation or Start Route UI.

## Entry point

`src/workspace/topology-edit/native-model-bootstrap.js` exports:

- `createNativeModelBootstrapRequest`
- `assertNativeModelBootstrapRequest`
- `createNativeModelWorkspaceDataset`
- `createEmptyNativeCanonicalTopology`
- `createNativeModelBootstrap`
- `assertNativeModelBootstrap`

All constructors return immutable, JSON-serializable values.

## Required request authority

The request requires explicit:

- model key;
- document ID and revision;
- native source kind;
- millimetre and degree units;
- coordinate-system ID, datum ID, and a finite 4x4 transform;
- catalogue ID, version, catalogue hash, and source hash;
- deterministic identity policy;
- authoring-policy hash.

SHA-256 authority fields use `sha256:<64 lowercase hex>`.

Unknown request fields are rejected. This prevents session, renderer, pointer, locale, or clock values from entering bootstrap authority.

## Deterministic identities

The dataset identity is a semantic digest of the normalized request, model key, and document ID. The native model identity is a semantic digest of the dataset identity and document ID.

Recreating the same request produces the same:

- request hash;
- dataset ID;
- source hash;
- dataset hash;
- empty canonical hash;
- bootstrap hash.

Distinct explicit model custody changes the identities.

## Empty workspace dataset

The generated dataset uses `analysis-workspace-dataset/v1` and contains:

- version `0`;
- an ordinary `source-package-snapshot/v1`;
- a deterministic empty source model;
- zero entities;
- empty hierarchy and zero summary counts;
- an empty shared piping model;
- native source, coordinate-system, catalogue, identity, and policy authority.

No second persistence format is introduced.

## Empty canonical topology

The generated canonical topology uses the production topology schema and contains empty engineering collections and an empty rebuilt crosswalk.

It does not fabricate:

- imported component keys;
- imported port keys;
- source paths;
- source node IDs;
- crosswalk evidence.

Canonical finalization remains owned by `topology-edit-canonical-state.js`.

## Fail-closed checks

Canonical creation rejects:

- invalid source snapshot hashes;
- dataset/source snapshot identity mismatch;
- nonzero dataset version;
- any pre-existing entity;
- unsupported units or source kind;
- invalid coordinate transforms;
- malformed catalogue or policy hashes;
- request, dataset, canonical, or bootstrap hash tamper.

## Qualification

The `Native Model Bootstrap Exact Head` workflow:

1. checks out the exact PR head;
2. verifies the checked-out SHA;
3. enforces the under-300-line module limit;
4. syntax-checks the implementation and tests;
5. executes real deterministic and tamper tests;
6. uploads the TAP output as evidence.

The locked base for this slice is `fe8908280d432891f114bed9659eb38ab9ce1b0e`.
