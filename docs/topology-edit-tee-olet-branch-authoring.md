# Governed Tee / Olet Branch Authoring

## Purpose

Add one production authoring workflow for a catalogue-bound tee or olet branch without zero-length edges, artificial micro-spools, hidden nearest-size substitution, or direct mutation outside canonical command authority.

The workflow is:

1. select **Tee / Olet Branch**
2. select one straight canonical host pipe edge
3. choose one exact compatible catalogue record
4. edit station, clocking, and free branch-pipe length
5. Preview the complete ghost candidate
6. Validate the final candidate through checker authority
7. Apply atomically
8. Undo or redo the complete branch transaction as one journal group

## New governed primitive

`INSERT_BRANCH_COMPONENT` is required because `INSERT_INLINE_COMPONENT` has two ports and cannot truthfully create a degree-three junction.

The request owns:

- host edge canonical ID and precondition hash
- exact catalogue ID, record hash, catalogue hash, and catalogue version
- branch family: `TEE` or `OLET`
- host nominal size and outside diameter
- branch nominal size and outside diameter
- station in millimetres from the host FROM node
- deterministic branch unit vector derived from certified clocking evidence
- catalogue-owned component length and mass
- user-owned free branch-pipe length
- immutable operation and assembly provenance

The certified candidate owns the normalized resolved request. Candidate and effect validation must consume the same hashed payload.

## Canonical effect

One accepted command replaces the selected host pipe with:

- a positive-length upstream pipe edge
- a positive-length downstream pipe edge
- one degree-three host junction node at the exact station
- one catalogue-bound branch component edge from the host junction to the component face
- one positive-length branch pipe edge from the component face to the free branch endpoint

The host run remains collinear. The component and branch pipe share an exact face node. No generated edge may have zero length.

Generated IDs are deterministic command outputs and are available to later operation-graph steps through symbolic references.

## Catalogue compatibility

A record is selectable only when all available governed evidence matches exactly:

- component family (`TEE` or `OLET`)
- host nominal size and outside diameter
- branch nominal size and outside diameter
- piping class
- pressure class
- material specification
- host and branch end connections
- catalogue component length

Ambiguous, unavailable, stale, duplicated, reordered-with-drift, or mutated catalogue authority fails closed. Catalogue-owned length, mass, pressure, material, and dimensional fields are read-only in the HUD.

## Geometry and placement

The host must be a straight pipe edge with no unsupported dependants. The station must leave positive host pipe on both sides and must satisfy final physical-clearance policy.

Clocking is normalized to `[0, 360)` degrees. The branch vector is derived from a stable orthonormal frame around the certified host axis. Near-parallel reference vectors use a deterministic fallback axis so replay does not depend on camera state.

The free branch-pipe length must be positive. The catalogue component length is never user-overridable.

## Validation and transaction authority

Preview is side-effect free. Structural and provenance checks may run after intermediate graph steps, but full engineering checks run against the final candidate only.

Apply commits one journal group. A rejected command leaves the live topology, selection, candidate cache, and journal unchanged. Undo and redo must reproduce exact canonical hashes and may not silently discard pending redo history.

## Production qualification

The staged implementation must include:

- catalogue v3 Tee and Olet records with exact host/branch dimensions, pressure, material, mass, and length
- command contract, resolver, pure reducer, effect validator, and provenance checks
- authoring-session schema, operation planner, production HUD adapter, ghost preview, and worker validation
- deterministic option filtering and clocking tests
- exact degree-three topology and positive-length assertions
- stale/tampered catalogue and candidate rejection
- atomic Apply plus grouped undo/redo hash replay
- a mounted Chromium walkthrough against `public/fixtures/topology-edit-20-element-demo.staged.json`
- inherited GPU picking, bounded-tree, cached-projection, DPR, render-authority, interaction-authority, and tool-audit regressions

## Stacked dependency

This slice is based on `agent/valve-assembly-authoring` / PR #773 because it reuses catalogue v3 authority, normalized candidate payload custody, grouped transaction replay, and final-state checker policy. It must remain independently reviewable above that exact validated head.
