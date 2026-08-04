# Bucket-01 Phase 3A Independent Candidate Verification Status

## Scope

Phase 3A adds a separately implemented Design-V3 candidate verifier and replay-artifact custody gate. The independent checker imports only the canonical hashing utility. It does not import or call the candidate generator, candidate package validator, candidate topology observer, or any midside-transformation helper.

No radial or angular design value, frozen physical coordinate, load, restraint, tolerance, recovery rule, convergence rule, solver path, uniform production replay, stage-document adapter, or qualification state is changed.

## Independent candidate reconstruction

The checker consumes retained raw candidate artifacts, the Design-V3 record, candidate intake evidence, a supplied replay artifact manifest, and the frozen response/probe specifications. It independently recomputes:

- exact-head and candidate-artifact ancestry;
- raw-file, component, package-semantic, and design hashes;
- T6 edge identities and physical-boundary, internal-circumferential, radial, and diagonal classifications;
- analytic physical-boundary midsides and chordal internal/radial/diagonal midsides;
- corner-scaled, three-point integration, and dense eight-subdivision Jacobians;
- integrated area, aspect ratio, minimum angle, and boundary-radius evidence;
- exact load and restraint edge chains over the physical 20–60 mm window;
- exactly-one-element containment for all seven frozen locations;
- T6 natural coordinates, mapping residuals, natural-coordinate margins, orientation, anchor lineage, and compatible topology signatures.

The contract fixture reconstructs the four current Design-V3 candidate sizes:

| Level | Radial cells | Circumferential cells | T6 elements |
|---:|---:|---:|---:|
| 1 | 12 | 20 | 480 |
| 2 | 17 | 35 | 1,190 |
| 3 | 30 | 68 | 4,080 |
| 4 | 54 | 132 | 14,256 |

The exact 60 mm radial breakpoint is independently observed at every level for both the 0-degree load line and 180-degree restraint line. All seven fixture locations retain stable `B`-triangle topology and candidate natural-coordinate margins above `0.19`.

## Typed artifact manifest

Each emitted artifact entry retains:

- `artifactId`
- `artifactScope`
- `schema`
- `producerRevision`
- `routeId`
- `levelOrdinal`
- `exactHeadSha`
- `designHash`
- `parentArtifactHashes`
- `semanticHash`
- `rawFileHash`
- `relativePath`
- `validationStatus`

Only the controlled scopes `CANDIDATE_MESH_BOUND`, `REFERENCE_MESH_BOUND`, `REPOSITORY_REGRESSION`, and `EXECUTION_ENVIRONMENT` are accepted.

## Replay custody

Replay check states are derived from typed raw artifacts. A caller-supplied PASS/BLOCKED map is rejected. The custody producer validates and derives:

- frozen-input component hashes;
- stage-document, mapping-package, and projection ancestry;
- independent mesh quality;
- solver and equilibrium evidence;
- global response convergence;
- Kirsch probes;
- production lug fixed-location/path stress;
- probe topology audit;
- exact-head repository hygiene.

Raw-file tampering, altered frozen inputs, stale exact-head or design custody, detached stage/mapping ancestry, missing artifact roles, missing tracked-worktree proof, and authority escalation all fail closed.

## Contract validation

Executed in the focused reconstructed harness:

```text
node --check independent candidate verifier                         PASS
node --check independent candidate checker script                  PASS
node --check replay artifact custody module                        PASS
node --check replay artifact custody checker script                PASS
independent candidate recomputation contract                       PASS
replay artifact derivation and tamper contract                     PASS
```

The negative suite blocks altered mesh data, curved internal circumferential midsides, chordal physical-boundary midsides, a missing 60 mm breakpoint, an incorrect load-window node chain, stale artifact custody, detached mapping ancestry, frozen-input tampering, submitted PASS maps, and authority escalation.

A full repository checkout has not executed the raw external artifacts or exact-head gate for this agent branch. No solver replay, production switch, exact-head pass, or qualification claim is made.

## Authority boundary

All Phase 3A evidence retains:

```text
executedRecomputation: true
independentCheckerExecution: true
productionSwitchAuthorized: false
productionMeshAuthority: false
stressAcceptanceAuthority: false
qualificationAuthority: false
bucketQualified: false
```
