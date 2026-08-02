# LAFEA Non-Bucket NB-T6C — Lug-Pinhole Physical-Problem Projection

## Purpose

NB-T6C projects one explicit physical problem onto the three qualified NB-T6B meshes for the bounded pilot:

```text
C2D-LUG-PINHOLE -> LAFEA.3
```

The package closes the stage-document gap between production mesh generation and the merged B7D controller. It does not execute B7D.

## Inputs

The producer accepts only:

- the concentric annular lug-pinhole geometry authorized by NB-T6B;
- exactly three retained mesh profiles and refinement definitions;
- one explicit plane-stress material and thickness;
- one non-zero resultant load;
- one declared quadratic load edge;
- one distinct declared quadratic fixed edge;
- retained producer and source-origin references.

Load and restraint locations use exact quarter stations on either the hole or outer boundary. The producer does not infer engineering features from geometry or stress results.

## Projection sequence

```text
explicit physical problem
  -> mesh-independent physical-model hash
  -> provisional deterministic NB-T6B mesh ladder
  -> three normalized LAFEA.3 stage documents
  -> exact level-one source authority
  -> source-bound NB-T6B mesh ladder regeneration
  -> identical three stage documents
  -> B7A application evidence and level-one mapping declaration
  -> immutable NB-T6C projection package
```

The provisional regeneration step resolves the source-parent dependency without weakening source authority. Mesh content is generated first, the level-one document is sealed as the authoritative source, and the final ladder is rebuilt with that exact source hash. The package blocks if the final source-bound regeneration changes any stage document.

## Material mapping

Every generated T6 element receives the single explicitly declared material and thickness. The level-one B7A declaration lists the complete element set; partial material-region coverage is not accepted.

NB-T6C does not infer material properties, temperature dependence, plasticity, weld zones or multiple material regions.

## Load mapping

The declared resultant is projected to one selected quadratic T6 boundary edge with the consistent three-node distribution:

```text
corner 1: 1/6
midside:  4/6
corner 2: 1/6
```

The three equivalent nodal forces close to the exact declared resultant within the retained B7A tolerance. No pressure, edge-traction, body-force, thermal or imposed-displacement inference is performed.

## Restraint mapping

All in-plane translational degrees of freedom are fixed at the three nodes of one declared quadratic boundary edge:

```text
UX = 0
UY = 0
```

The load and restraint selectors must be distinct. The emitted B7A boundary declaration includes all six constraints on that edge and therefore retains a complete rigid-body-rank basis.

## Produced stage documents

Each level is normalized through the retained LAFEA.3 stage normalizer and validated by the retained local-continuum canonical-model contract. Across all three levels, the following physical basis remains invariant:

- model identity and version;
- source ancestry;
- canonical units;
- plane-stress formulation;
- material definition;
- T6-only policy;
- load-case identity;
- result request;
- qualification profile;
- disclosed limitations.

Nodes, elements, mapped nodal forces and mapped constraints vary only with the governed mesh refinement.

## B7A handoff

The package emits:

```text
applicationEvidence.geometryClass = LUG_PINHOLE
applicationEvidence.featureIds    = [LOAD-EDGE, ROOT-REGION]
mappingDeclaration.materialRegion = complete level-one element set
mappingDeclaration.loadEdge       = selected quadratic edge + all nodal loads
mappingDeclaration.boundaryEdge   = selected quadratic edge + all constraints
```

The dedicated qualification proves that this output creates a `MAPPING_EVIDENCE_QUALIFIED` B7A package and a `BOUND` caller-mesh binding. NB-T6C itself keeps `mappingEvidenceQualified = false` because the authoritative B7A package still requires the separately governed release and compatibility parents.

## Authority boundary

NB-T6C introduces:

```text
productionMeshGenerated = true
materialMapped          = true
loadMapped              = true
restraintMapped         = true
stageDocumentsProduced  = true
```

It does not introduce:

```text
mappingEvidenceQualified = false
solverExecuted           = false
recoveryProduced         = false
convergenceProduced      = false
codeAssessmentProduced   = false
reportProduced           = false
releaseQualified         = false
shellAuthorized          = false
lafea6Enabled            = false
```

No nodal projection, smoothing, SCL, structural-stress extraction, code assessment or report authority is created.

## Remaining package

A later bounded integration package may combine:

- the NB-T6C source authority, stage documents and B7A inputs;
- a current B1 release record and B2 compatibility receipt;
- the B7A and B7B authority parents;
- the merged B7D controller.

That integration must retain the exact three-level lifecycle and may not convert a result-ready state into code or release authority.
