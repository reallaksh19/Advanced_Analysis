# LAFEA Non-Bucket NB-T3 — Registry V2 and Composition Root

## Scope

NB-T3 replaces distributed stage dispatch with one governed composition path for each current LAFEA stage. It does not change a numerical formulation, shell formulation, expected benchmark value, tolerance, code-assessment authority, release qualification, or LAFEA.6 implementation state.

## Registry V2

`lafea-stage-registry/v2` retains the existing stage taxonomy, authority descriptions, engine states, collection paths, preview policies and limitations. Each entry binds one immutable `lafea-stage-composition-binding/v2` record.

Every binding declares:

- one stage-specific composition-root identity;
- explicit technical component identities for normalization, canonicalization, calculation, acceptance, presentation and unit resolution;
- an optional product-adapter identity where a governed analytical product layer exists;
- the exact NB-T1 lifecycle profile;
- governed benchmark manifest identities where retained manifests exist;
- a release-state binding of `RELEASE_NOT_QUALIFIED`.

## Composition Roots

| Stage | Composition root | Lifecycle profile | Benchmark manifests |
|---|---|---|---|
| LAFEA.1 | `LAFEA.COMPOSITION.ATTACHMENT_FOUNDATION/V1` | `ANALYTICAL_FOUNDATION_V1` | A1 finite-foundation and handoff manifests |
| LAFEA.2 | `LAFEA.COMPOSITION.PIPE_SECTION_SCREENING/V1` | `ANALYTICAL_SCREENING_V1` | A2 applicability and handoff manifests |
| LAFEA.3 | `LAFEA.COMPOSITION.CONTINUUM_2D/V1` | `FEA_MESH_RECOVERY_V1` | `CONT-PATCH-01`, `CONT-CYL-01`, `CONT-HOLE-01` |
| LAFEA.4 | `LAFEA.COMPOSITION.THIN_SHELL/V1` | `FEA_MESH_RECOVERY_V1` | `SHELL-PATCH-01`, `SHELL-BEND-01` |
| LAFEA.5 | `LAFEA.COMPOSITION.TRUNNION_FOOTPRINT/V1` | `FEA_MESH_RECOVERY_V1` | none registered |
| LAFEA.6 | `LAFEA.COMPOSITION.UNSUPPORTED_WELD_PROFILE/V1` | `UNSUPPORTED_STAGE_V1` | none registered |

An empty benchmark-manifest list means `NO_GOVERNED_MANIFEST_REGISTERED`; it is not replaced with an inferred or synthetic identifier.

## Runtime Integration

The workbench model, result presenter, unit resolver and source-preview adapter resolve their stage-specific behavior through `requireLafeaStageComposition(stageId)`. The technical functions remain the retained core calculators and presenters. The composition root chooses those functions by immutable component ID; it does not implement numerical behavior.

The v2 composition surface additionally exposes product adapters for LAFEA.1 and LAFEA.2. These adapters consume retained accepted analytical results and create bounded product evidence. They do not alter or rerun the retained numerical kernels.

LAFEA.1 through LAFEA.5 retain their existing qualified calculation routes. LAFEA.6 binds only its evidence-neutral placeholder normalizer. It has no canonicalizer, calculator, acceptance rule, result presenter, unit resolver or product adapter and continues to fail closed with `UNSUPPORTED_STAGE_ENGINE_NOT_IMPLEMENTED`.

## Authority Boundary

The composition root does not:

- produce convergence evidence;
- produce code-assessment evidence;
- produce report or release evidence;
- set `CODE_READY`;
- set `RELEASE_QUALIFIED`;
- enable LAFEA.6;
- treat visual geometry or render packets as engineering evidence;
- alter current continuum or legacy five-DOF thin-shell authority.

All six composition bindings explicitly retain `RELEASE_NOT_QUALIFIED`.

## Certification

The bounded checks verify registry/component uniqueness, exact lifecycle-profile binding, registered technical and product components, retained execution of LAFEA.1 through LAFEA.5, fail-closed LAFEA.6 behavior, benchmark-manifest binding, public contract exposure and absence of duplicate stage dispatch maps.
