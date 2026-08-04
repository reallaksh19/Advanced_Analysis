# Bucket-01 Phase 3A Independent Candidate Verification Status

## Scope

Phase 3A adds a separately implemented Design-V3 candidate verifier and a validation-receipt producer for the existing controlled replay result v2 contract. It does **not** introduce a second replay-result schema or replay adjudicator.

The independent checker does not import or call the candidate mesh generator, candidate package validator, candidate topology observer, candidate bundle builder, candidate projection adapter, or midside-transformation helpers.

No radial or angular design value, frozen physical coordinate, load, restraint, tolerance, recovery rule, convergence rule, solver path, uniform production replay, stage-document adapter, production-switch authority, or qualification state is changed.

## Independent candidate reconstruction

The checker consumes retained raw candidate artifacts, the Design-V3 record, candidate intake evidence, a supplied artifact manifest, and the frozen response/probe specifications. It independently recomputes:

- exact-head and candidate-artifact ancestry;
- raw-file, component, package-semantic, intake, and design hashes;
- T6 edge identities and physical-boundary, internal-circumferential, radial, and diagonal classifications;
- analytic physical-boundary midsides and chordal internal/radial/diagonal midsides;
- corner-scaled, three-point integration, and dense eight-subdivision Jacobians;
- integrated area, aspect ratio, minimum angle, and boundary-radius evidence;
- exact load and restraint edge chains over the physical 20–60 mm window;
- exactly-one-element containment for all seven frozen locations;
- T6 natural coordinates, mapping residuals, natural-coordinate margins, orientation, anchor lineage, and compatible topology signatures.

The focused fixture reconstructs the current Design-V3 ladder:

| Level | Radial cells | Circumferential cells | T6 elements |
|---:|---:|---:|---:|
| 1 | 12 | 20 | 480 |
| 2 | 17 | 35 | 1,190 |
| 3 | 30 | 68 | 4,080 |
| 4 | 54 | 132 | 14,256 |

The exact 60 mm radial breakpoint is independently observed at every level for both the 0-degree load line and the 180-degree restraint line. The seven fixture locations retain stable `B`-triangle topology and candidate natural-coordinate margins above `0.19`.

## Controlled replay v2 integration

The independent checker writes three isolated outputs:

```text
independent verification evidence
independent artifact manifest
INDEPENDENT_CHECKER_EVIDENCE validation receipt
```

The validation receipt conforms to:

```text
lafea-bucket-01-replay-artifact-validation-receipt/v1
```

and is intended for the existing:

```text
lafea-bucket-01-controlled-replay-result/v2
```

The receipt binds:

- the verification exact-head SHA;
- the candidate-artifact head SHA through the evidence payload;
- the Design-V3 hash;
- the candidate package hash;
- the candidate intake evidence hash;
- the independent evidence semantic hash;
- the independent evidence raw-file hash;
- the candidate replay route;
- `artifactKind = INDEPENDENT_CHECKER_EVIDENCE`;
- `derivedCheck = probeTopologyAudit`.

The earlier Phase 3A replay-artifact-custody v1 implementation was removed during review because it competed with the already registered replay-result v2 authority and admitted insufficiently validated synthetic PASS payloads.

## Negative cases

The independent verification contract blocks:

- raw-file or semantic-hash tampering;
- altered mesh data or connectivity custody;
- curved internal circumferential midsides;
- chordal physical-boundary midsides;
- a missing 60 mm breakpoint;
- incorrect load or restraint window chains;
- stale exact-head or design custody;
- detached supplied-manifest ancestry;
- altered candidate package or intake parent custody;
- submitted PASS maps;
- authority escalation.

## Validation boundary

The previously executed focused independent-recomputation contract passed before the review corrections. The review added a dedicated controlled-replay-v2 receipt contract and removed the competing replay-v1 files.

No GitHub status check is attached. A complete exact-head checkout has not rerun the full repository gate or real external replay artifacts after these corrections. Consequently, this record does not claim:

- an exact-head infrastructure pass;
- a retained candidate solver result;
- candidate replay adjudication;
- production-switch eligibility;
- Bucket-01 qualification.

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
