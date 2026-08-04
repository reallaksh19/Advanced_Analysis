# LAFEA Concept, Current-State Ground Truth and Roadmap

**Canonical file:** `docs/conceptcumroadmapLAFEA.md`  
**Repository:** `reallaksh19/Advanced_Analysis`  
**Audited source baseline:** `48aea9b2a795e070062a9e7769caefb79067c1f7`  
**Audit date:** 2026-08-04  
**Document status:** `GOVERNING_CONCEPT_AND_ROADMAP`  
**Engineering status:** This document is an architecture and programme authority. It is not, by itself, numerical qualification evidence or code-compliance approval.

---

## 0. Purpose and mandatory use

This document is the source-level concept, current-state record, and forward roadmap for **LAFEA — Local Analysis Finite Element Analysis** in `Advanced_Analysis`.

It shall be used as the first reference when:

- adding or changing a LAFEA kernel;
- adding a new element, formulation, load, solver, mesher, recovery method, application template, benchmark, code-assessment profile, or UI route;
- deciding whether a capability is implemented, qualified, application-qualified, production-authorized, or merely conceptual;
- preparing qualification questionnaires and selected-agent work packs;
- reviewing a PR that changes any LAFEA-related source;
- planning scalability, nonlinear analysis, contact, plasticity, buckling, weld, fatigue, or code assessment;
- interpreting historical plans whose baseline has become stale.

A capability shall **not** be claimed because a file, test, registry row, template label, or merged PR exists. The claim must match the applicable runtime route, qualification state, exact-head evidence, and authority boundary.

### 0.1 Authority precedence

When records disagree, use this order:

1. **Executable source and validated canonical contracts at the inspected exact head.**
2. **Exact-head qualification reports, retained workflow artifacts, and authority receipts.**
3. **Active runtime registries and state machines.**
4. **This document, provided it is updated in the same PR as the relevant capability change.**
5. **Historical plans, prompts, issues, PR descriptions, and superseded documents.**

A historical report may explain why code exists, but it cannot grant current authority after the code, solver profile, mesh profile, tolerance, benchmark, or exact head changes.

### 0.2 Required update rule

Any PR that materially changes LAFEA capability shall update this document in the same PR. Material changes include:

- formulation or element changes;
- solver selection or tolerance changes;
- new or altered load semantics;
- meshing or mesh-quality policy changes;
- recovery, averaging, SCL, structural-stress, or convergence changes;
- application-template promotion;
- code-assessment support;
- production-route or UI authority changes;
- external-solver adoption;
- changes to known limitations or known issues.

A source guard should ultimately enforce this requirement.

---

# 1. Executive engineering conclusion

LAFEA is currently a **multi-stage local-analysis framework**, not one solver.

Its registered production-stage route contains:

1. analytical attachment-load and pressure baseline mechanics;
2. nominal pipe-section screening;
3. linear 2D continuum FEA using T3, T6, and Q8 elements in plane stress or plane strain;
4. a legacy linear triangular thin-shell path using CST membrane plus DKT bending;
5. a caller-authored trunnion-footprint load-introduction workflow that invokes the thin-shell kernel;
6. an explicit weld-stage placeholder with no calculation engine.

In parallel, the repository contains:

- deterministic meshing infrastructure;
- generic sparse linear-solver building blocks;
- benchmark-only MITC4/MITC3 shell formulation work;
- Bucket-01 T6 qualification infrastructure;
- Bucket B controlled Q8 and axisymmetric application qualification packages;
- application-template and recovery-template registries whose release states are mostly concept or blocked;
- UI, presenter, provenance, and convergence-display infrastructure.

The most important near-term programme result is:

> **LAFEA becomes a reliable linear-elastic 2D local-detail FEA tool for common piping attachments, reinforcement details, and axisymmetric pressure components, with controlled meshing, fixed-location recovery, convergence evidence, exact-head qualification, and explicit separation between numerical output and code assessment.**

That result requires completion and integration of the controlled Bucket B application route. It does **not** imply contact, plasticity, full 3D solids, production shell templates, weld fatigue, ASME VIII-2 assessment, or automatic fitness-for-service acceptance.

---

# 2. Terminology and programme boundaries

## 2.1 LAFEA versus LFEA

The repository contains two related but distinct programmes:

- **LAFEA:** local attachment and local continuum/shell analysis, mainly under `src/core/local-*`, `src/core/lafea-*`, and `src/workspace/lafea-*`.
- **LFEA:** linear piping/frame analysis and B31 code stress, mainly under the `lfea-b2.*`, `lfea-b3.*`, `lfea-b4.*`, linear-piping, InputXML, and CAESAR-comparison routes.

LFEA code-compliance capability does not automatically qualify LAFEA results. A B31 code engine for piping-frame actions cannot be reused as an ASME VIII-2 local-stress assessment without an explicit adapter, stress-classification authority, material/allowable profile, load-combination policy, benchmark, and qualification receipt.

## 2.2 Numerical capability states

This document uses the following states:

| State | Meaning |
|---|---|
| `RUNTIME_REGISTERED` | A production stage calls the implementation through the active workbench composition. |
| `KERNEL_QUALIFIED` | Element/kernel mechanics have executable benchmark evidence, but not necessarily an application procedure. |
| `APPLICATION_QUALIFIED` | A controlled application geometry, loads, mesh ladder, recovery, convergence, and independent reference have qualified. |
| `BENCHMARK_ONLY` | Source and tests exist, but the formulation is not the active production dispatch. |
| `CONCEPT` | Registry/contract entry exists, but no qualified compiler and application route exist. |
| `BLOCKED` | The registry explicitly refuses execution or promotion pending named authority. |
| `NOT_IMPLEMENTED` | No qualified engine exists. |
| `PRODUCTION_AUTHORIZED` | Ordinary production execution has been separately approved. This state is intentionally rare. |

`KERNEL_QUALIFIED`, `APPLICATION_QUALIFIED`, `CODE_ASSESSMENT_QUALIFIED`, and `PRODUCTION_AUTHORIZED` are separate decisions.

---

# 3. Runtime architecture and ownership

## 3.1 Application composition

The runtime is vanilla JavaScript ES modules, Vite, and Three.js. LAFEA uses explicit stores, controllers, DOM views, pure model functions, and workspace events.

The primary stage architecture is:

```text
LAFEA document/source
  -> stage registry
  -> stage composition binding
  -> normalizer
  -> canonicalizer
  -> calculator/kernel
  -> acceptance predicate
  -> presenter
  -> review/export evidence
```

Active source boundaries include:

```text
src/workspace/lafea-stage-registry.js
src/workspace/lafea-stage-composition-bindings.js
src/workspace/lafea-stage-components.js
src/workspace/lafea-workbench-model.js
src/workspace/lafea-result-presenters/**
```

`src/workspace/lafea-stage-components.js` binds each registered stage to its actual normalizer, canonicalizer, calculator, acceptance predicate, presenter, and unit source. This file is the practical composition root for current LAFEA stage execution.

The workbench must never become a second engineering kernel. It may select, format, paginate, and visualize retained evidence; it must not rederive stresses, invariants, convergence classifications, or authority states.

## 3.2 Canonical data principles

Across the current kernels, the intended pattern is:

```text
source evidence
  -> strict normalization
  -> canonical model
  -> semantic hash
  -> immutable calculation result
  -> independent hash reconstruction
  -> presenter projection
```

Common rules are:

- explicit units;
- no silent defaults;
- exact identity ordering;
- deep immutability;
- fail-closed unsupported requests;
- retained source ancestry;
- separate numerical and qualification evidence;
- rejected results omit authoritative arrays;
- no caller-supplied PASS state or semantic hash authority.

## 3.3 Registered stages

The active stage registry is `lafea-stage-registry/v2`.

| Stage | Engine | Current authority | Runtime state |
|---|---|---|---|
| `LAFEA.1` | `local-stress` | Load transfer and elastic pressure baseline only | `RUNTIME_REGISTERED` |
| `LAFEA.2` | `local-attachment-screening` | Nominal pipe-section screening only | `RUNTIME_REGISTERED` |
| `LAFEA.3` | `local-continuum` | T3/T6/Q8 linear continuum | `RUNTIME_REGISTERED` |
| `LAFEA.4` | `local-shell` | Legacy five-DOF triangular CST+DKT thin shell | `RUNTIME_REGISTERED` |
| `LAFEA.5` | `local-trunnion-footprint` | Caller-authored host-shell footprint load introduction | `RUNTIME_REGISTERED` |
| `LAFEA.6` | none | Weld-profile placeholder | `NOT_IMPLEMENTED` / `BLOCKED` |

---

# 4. Current capability matrix

| Capability | Current state | Governing source | Primary limitation |
|---|---|---|---|
| Resultant reference transfer | Runtime registered | `src/core/local-stress/**` | No local attachment stress |
| Lamé pressure baseline | Runtime registered | `src/core/local-stress/**` | Elastic cylinder baseline only |
| Nominal pipe-section stress screening | Runtime registered | `src/core/local-attachment-screening/**` | No local discontinuity or SCF |
| 2D plane stress | Runtime registered | `src/core/local-continuum/**` | Linear, small displacement |
| 2D plane strain | Runtime registered | `src/core/local-continuum/**` | Linear, small displacement |
| T3 continuum | Runtime registered fallback | `local-continuum/element.js` | Constant-strain and overly stiff in bending-dominated meshes |
| T6 continuum | Runtime registered | `local-continuum/t6-element.js` | No native holes-capable general mesher in current CDT route |
| Q8 continuum | Runtime registered | `local-continuum/q8-element.js` | Full integration; application use requires mesh/recovery qualification |
| Axisymmetric Q8 formulation | Qualification package merged | `src/core/bucket-b/axisymmetric-*` | Not generalized into ordinary LAFEA.3 document route |
| Thin triangular shell CST+DKT | Runtime registered | `src/core/local-shell/**` | Thin shell only; no transverse shear or drilling DOF |
| MITC4 shell formulation | Benchmark only | `local-shell/mitc4-element.js` | Not exported or dispatched by active `local-shell/index.js` |
| MITC3 fallback | Benchmark only | `local-shell/mitc3-element.js` | Not production dispatch |
| Deterministic T6 meshing | Implemented infrastructure | `src/core/lafea-meshing/**` | Simple polygon; holes rejected by general CDT route |
| Q8 recombination | Implemented infrastructure | `lafea-meshing/q8-recombination.js` | Not a universal automatic quad mesher |
| Mapped MITC meshing | Implemented infrastructure | `lafea-meshing/mapped-mitc-mesh.js` | No production MITC shell authority |
| Dense direct continuum solve | Runtime registered | `local-continuum/solver.js` | Quadratic memory and cubic factorization growth |
| Sparse iterative continuum solve | Runtime registered | `local-continuum/sparse-matrix.js`, `solver.js` | Jacobi-PCG only |
| Generic sparse Cholesky/LDLT library | Benchmark qualified infrastructure | `src/core/lafea-linear-solve/**` | Not wired into active stage kernels |
| Contact | Not implemented | none in active LAFEA kernels | Requires nonlinear shell/contact programme |
| Plasticity | Not implemented | none | Requires material nonlinearity and incremental solve |
| Large displacement | Not implemented | none | Requires geometric tangent and nonlinear iterations |
| Buckling | Not implemented | none | No eigenvalue or nonlinear stability route |
| Weld stress/code | Not implemented | `LAFEA.6` placeholder | No engine or qualified recovery profile |
| ASME VIII-2 elastic stress assessment | Registry concept only | application template registry | Recovery and assessment profiles pending |
| Production code compliance | Not qualified | all LAFEA kernels declare no code compliance | Must remain separate from numerical solve |

---

# 5. Module-by-module source truth

## 5.1 LAFEA.1 — attachment foundation and pressure baseline

### Purpose

`src/core/local-stress/**` provides two controlled mechanics functions:

1. transfer a force and moment resultant between reference points and coordinate systems;
2. calculate elastic thick-cylinder Lamé pressure stress at declared radial positions.

### Mechanics

The module retains explicit pipe-local and global bases, action sense, end condition, pressure, wall geometry, and source evidence.

Representative formula identities include:

```text
M_target = M_source + (r_source - r_target) x F
Lamé radial stress
Lamé hoop stress
open-end axial pressure stress
closed-end axial pressure stress
explicit axial resultant separation
```

It reconstructs force and moment conservation residuals and pressure-boundary residuals.

### Current engineering authority

```text
LOAD_TRANSFER_AND_PRESSURE_BASELINE_ONLY
```

### Explicit limitations

```text
NO_LOCAL_ATTACHMENT_STRESS
NO_FEA
NO_SHELL_BENDING
NO_WELD_STRESS
NO_CONTACT
NO_CODE_COMPLIANCE
ELASTIC_PRESSURE_STRESS_ONLY
NO_EXTERNAL_PRESSURE_STABILITY_ASSESSMENT
```

### Appropriate use

- normalize and transfer attachment resultants;
- establish a pressure-only cylinder baseline;
- provide predecessor evidence for later local analysis.

### Inappropriate use

- local nozzle/trunnion/shoe stress;
- shell bending;
- weld assessment;
- collapse or buckling;
- code pass/fail.

---

## 5.2 LAFEA.2 — nominal pipe-section screening

### Purpose

`src/core/local-attachment-screening/**` evaluates nominal annular pipe-section stresses at declared wall positions from axial force, biaxial bending, torsion, and reused pressure evidence.

### Mechanics

It uses exact annulus properties and calculates, as applicable:

```text
sigma_x = F_x / A + bending terms

tau_x-theta = M_x r / J

same-point stress tensor
principal stresses
three-dimensional von Mises invariant
deterministic source envelope
```

### Current engineering authority

```text
NOMINAL_PIPE_SECTION_SCREENING_ONLY
```

### Explicit limitations

- no finite-element analysis;
- no attachment local stress or discontinuity SCF;
- no shell bending or transverse-shear recovery;
- no plasticity, fatigue, buckling, contact, weld stress, or code utilization;
- no material allowable or pass/fail.

### Appropriate use

- fast far-field screening;
- load-case envelope sanity checks;
- identifying whether a detailed local model is warranted.

It must not be presented as local attachment stress.

---

## 5.3 LAFEA.3 — linear 2D continuum

### Current runtime route

```text
local-continuum-model/v1
  -> createCanonicalLocalContinuumModel()
  -> validateCanonicalLocalContinuumModel()
  -> calculateLocalContinuum()
  -> local-continuum-result/v1
```

The controlled public workspace facade is:

```text
src/workspace/lafea-controlled-continuum-stage-route.js
```

### Formulations

```text
PLANE_STRESS
PLANE_STRAIN
```

Canonical DOFs:

```text
UX, UY
```

Canonical units:

```text
length = mm
force = N
stress/modulus/pressure = MPa
```

### Elements

#### T3

- three-node constant-strain triangle;
- one constant element stress state;
- explicit T3 fallback authority required;
- suitable for benchmark/fallback and sufficiently refined membrane problems;
- poor choice for coarse bending-dominated local stress.

#### T6

- six-node quadratic triangle;
- three-point Hammer integration;
- positive Jacobian required at integration points;
- rigid-body, affine-patch, stiffness-symmetry, and deterministic evidence retained.

#### Q8

- eight-node serendipity quadrilateral;
- full `3 x 3` Gauss integration;
- positive Jacobian required;
- rigid-body, affine-patch, stiffness-symmetry, and deterministic evidence retained.

`element.js` dispatches T3, T6, and Q8 through the same canonical solve path.

### Loads and prescribed motion

The active load assembly supports:

- nodal forces;
- boundary-edge traction;
- boundary-edge pressure with explicit normal convention;
- element body force;
- isotropic element thermal strain;
- load-case imposed displacement;
- model-level prescribed constraints.

Quadratic T6/Q8 edges retain the midside node and are integrated as quadratic curves; they are not silently reduced to corner chords.

### Assembly and solution

- deterministic DOF order: node identity, then `UX`, `UY`;
- exact partition/elimination for prescribed displacement;
- reactions from `K u - F`;
- dense assembly and deterministic Cholesky for models at or below 1,536 DOFs;
- full-symmetric CSR assembly and deterministic Jacobi-preconditioned conjugate gradient above 1,536 DOFs;
- sparse PCG has bounded iterations and reliable exact-residual updates;
- nonpositive pivots/diagonals, nonpositive curvature, singularity, indefiniteness, and nonconvergence fail closed.

### Recovery

The kernel retains element/Gauss-point strain and stress, formulation-correct `sigma_z`, principal stress, von Mises stress, reaction, residual, and strain-energy evidence.

Additional modules provide:

- display-only nodal projection;
- discontinuity-aware averaging groups;
- through-thickness structural-stress extraction;
- recovery layers that distinguish authoritative raw stress from presentation projection.

### Current limitations

- linear elastic, small displacement;
- no contact, friction, plasticity, buckling, fatigue, crack, or fracture;
- no shell or bending rotational DOFs;
- no automatic production geometry-to-mesh-to-convergence orchestration;
- no native ordinary-stage axisymmetric formulation;
- no code assessment;
- no automatic stress-singularity acceptance;
- no general adaptive meshing.

### Important source-truth debt

The exported constant still states:

```text
ENGINEERING_LEVEL = LINEAR_2D_CONTINUUM_CST_ONLY
```

This is stale relative to the wired T3/T6/Q8 dispatch and stage registry. Comments in `t6-element.js` and `q8-element.js` also still say the formulations are not wired, although `element.js` now dispatches them. The old LAFEA.3 markdown similarly describes CST-only capability.

This drift must be corrected as a near-term documentation/contract package without changing numerical behavior.

---

## 5.4 LAFEA.4 — thin shell

### Active production formulation

```text
CST_DKT_TRI3_THIN_SHELL_V1
LINEAR_2_5D_THIN_SHELL_CST_DKT_ONLY
```

Canonical nodal DOFs:

```text
UX, UY, UZ, R1, R2
```

There is no drilling rotation.

The active path combines:

- CST membrane behavior;
- classic DKT triangular bending;
- declared and qualified nodal director/tangent bases;
- deterministic dense assembly and Cholesky solution;
- nodal forces, tangent moments, and element-normal pressure;
- bottom, midsurface, and top stress recovery;
- membrane, bending, combined, invariant, reaction, and energy evidence.

### Active limitations

- thin-shell only;
- no Reissner-Mindlin transverse-shear stiffness;
- no shear correction factor in the active CST/DKT route;
- no drilling DOF or drilling penalty;
- no contact, friction, large displacement, plasticity, material nonlinearity, buckling, fatigue, or fracture;
- no automatic/adaptive meshing;
- no weld stress or code compliance.

### MITC4/MITC3 status

The repository contains:

```text
src/core/local-shell/mitc4-element.js
src/core/local-shell/mitc3-element.js
```

The MITC4 module implements a five-DOF Reissner-Mindlin quadrilateral with mixed transverse-shear interpolation, `2 x 2` Gauss integration, tying points, and a `5/6` shear-correction factor. Dedicated checks cover MITC4, MITC3 fallback, transverse shear, mapped mesh, patch, bend, transformation, and geometry behavior.

However:

- `src/core/local-shell/index.js` does not export MITC4/MITC3;
- `calculateLocalShell()` still builds the legacy CST/DKT route;
- the stage registry explicitly states that production MITC4/MITC3 authority is pending.

Therefore MITC4/MITC3 are **BENCHMARK_ONLY**, not production shell authority.

---

## 5.5 LAFEA.5 — trunnion footprint load introduction

### Purpose

`src/core/local-trunnion-footprint/**` adapts accepted LAFEA.1 resultant evidence to a caller-authored LAFEA.4 shell patch.

### Mechanics

The workflow:

1. validates LAFEA.1 model/result hashes and ancestry;
2. validates caller-authored pipe/trunnion cylinder geometry and footprint loop;
3. transfers the resultant to the footprint reference point;
4. distributes the target force and moment through translational nodal forces using a weighted constrained minimum-norm fit;
5. verifies exact force and moment reconstruction;
6. passes the generated shell load cases through public LAFEA.4 APIs;
7. reports raw shell stress by declared assessment region.

The force fit solves a deterministic six-by-six system. It does not create nodal moments, weak springs, hidden redistribution, or regularization.

### Current authority

```text
TRUNNION_FOOTPRINT_PIPE_SHELL_LOAD_INTRODUCTION_ONLY
```

### Limitations

```text
NO_TRUNNION_STIFFNESS
NO_WELD_STRESS
NO_CONTACT
NO_PRESSURE_SUPERPOSITION
NO_CODE_COMPLIANCE
RAW_SHELL_STRESS_ONLY
FOOTPRINT_ADJACENT_PEAKS_ARE_LOAD_INTRODUCTION_SENSITIVE
```

This is a load-introduction model, not a complete trunnion or weld model.

---

## 5.6 LAFEA.6 — weld profile

The stage registry deliberately exposes LAFEA.6 as an unsupported placeholder.

Current state:

```text
ENGINE_NOT_IMPLEMENTED
calculation disabled
no qualified weld schema
no calculator
no result validator
no benchmark manifest
```

A future weld programme must not activate this stage by adding a formula alone. It requires explicit geometry/weld-group authority, local structural-stress recovery, mesh/convergence policy, fatigue/code profile, benchmarks, and a new qualification state.

---

# 6. Meshing architecture

## 6.1 Current meshing package

`src/core/lafea-meshing/**` includes:

- deterministic topology and boundary discretization;
- refinement fields;
- quality gates;
- convergence framework;
- deterministic constrained T6 triangulation;
- lug/pinhole specialized T6 meshes;
- optional Q8 recombination;
- mapped MITC shell meshes;
- determinism helpers.

The package is richer than the active LAFEA.3 document route. The stage registry correctly states that production geometry-to-mesh-to-convergence orchestration remains incomplete.

## 6.2 T6 generation

The general T6 route uses:

```text
analytic boundary discretization
  -> deterministic ear clipping
  -> Lawson interior-edge flips
  -> T3 corner triangulation
  -> T6 midside insertion
```

Physical curved-boundary midsides come from the analytic curve. Interior midsides are chord midpoints.

Current declared limitation:

```text
HOLES_NOT_YET_SUPPORTED
```

The general route meshes simple outer polygons only. Specialized lug/pinhole routes exist, but they are not a substitute for a general holes-capable constrained mesher.

## 6.3 Q8 recombination

Q8 recombination pairs suitable adjacent triangles in structured regions. It is deterministic infrastructure, not a universal all-quad mesher. Every Q8 application still requires quality checks, interface checks, fixed probe mapping, and mesh-ladder evidence.

## 6.4 Mapped shell mesh

Mapped MITC mesh generation exists for controlled shell patches. It does not grant production MITC shell authority because the active shell solver route is still CST/DKT.

## 6.5 Mesh quality

Available metrics include:

- aspect ratio;
- minimum triangle angle;
- scaled Jacobian;
- shell warpage;
- boundary-segment count;
- shell element-size-to-thickness ratio;
- Q8 determinant and midside-placement metrics in Bucket B;
- duplicate interface-node and compatibility checks in controlled packages.

Thresholds should be caller/profile-declared and source-bound. They shall not be hidden constants adjusted to force a pass.

## 6.6 Convergence

The generic meshing framework requires at least three levels for production code assessment unless an explicit benchmark-template exemption exists. Accepted quantities include:

- strain energy;
- selected displacement;
- reaction equilibrium;
- SCL membrane stress;
- SCL membrane-plus-bending stress;
- weld structural stress.

Raw singular peak stress is explicitly prohibited as a convergence quantity.

The generic framework is intentionally simple and accepts only monotonic histories within its finest-change limits. Bucket B contains a more advanced four-level evaluator supporting nonuniform ratios, asymptotic, plateau, oscillatory, zero-crossing, and additional-level classifications.

Future consolidation should preserve the stronger Bucket B behavior rather than reducing it to the generic three-level rule.

---

# 7. Solver architecture

## 7.1 Active LAFEA.3 continuum solver

Two storage/solve paths exist:

### Small model

```text
DOFs <= 1536
full dense matrix
exact partition
Cholesky factorization
```

### Larger model

```text
DOFs > 1536
full-symmetric CSR
exact partition
Jacobi-preconditioned conjugate gradient
```

The solver checks positive diagonal/curvature, exact residual, equilibrium, reactions, and energy. It fails closed on singularity, indefiniteness, or nonconvergence.

## 7.2 Active LAFEA.4 shell solver

The active shell kernel retains dense global stiffness and deterministic dense Cholesky. This is suitable only for small local patches. It is not scalable to large production shell meshes.

## 7.3 Generic LAFEA linear-solve library

`src/core/lafea-linear-solve/**` contains separately checked infrastructure for:

- sparse symmetric assembly;
- sparse Cholesky;
- sparse LDLT with pivoting;
- boundary-condition elimination;
- diagonal scaling;
- mechanism diagnosis;
- residual and energy evidence;
- condition estimation.

These modules are benchmarked by `lafea.11-*` scripts but are not the active LAFEA.3 or LAFEA.4 production solver dispatch. They are an adoption candidate, not current runtime authority.

## 7.4 Solver limitations

- no multifrontal or supernodal sparse direct solver;
- no ILU, incomplete Cholesky, AMG, or domain decomposition;
- no nonlinear Newton-Raphson loop;
- no geometric or contact tangent;
- no eigensolver for buckling or dynamics;
- no transient integration;
- no external-kernel bridge currently active in LAFEA;
- result/evidence size may grow faster than practical UI payloads when full matrices and Gauss evidence are retained.

---

# 8. Recovery, stress interpretation, and presentation

## 8.1 Authority layers

LAFEA shall distinguish:

1. raw element/integration-point stress;
2. fixed physical probe recovery;
3. display-only nodal projection;
4. discontinuity-aware averaging;
5. SCL membrane/bending/peak decomposition;
6. weld structural stress;
7. code assessment.

A later layer may consume a prior authoritative layer only through a registered, benchmarked transformation.

## 8.2 Current continuum recovery

T6/Q8 integration-point stress is authoritative. Nodal projection is for display and shall not be used for convergence or code assessment.

Structural-stress extraction and averaging-boundary modules exist, but application-specific use still requires an explicit path definition and benchmark.

## 8.3 Bucket B recovery

Bucket B establishes the stronger controlled chain:

```text
fixed physical path point
  -> containing Q8 element
  -> inverse natural coordinates
  -> Gauss tensor interpolation
  -> declared local frame
  -> ordered samples
  -> membrane / bending / peak decomposition
```

It records containing element, natural coordinates, mapping residual, margin, source Gauss points, interpolation weights, recovered tensor, and path authority.

This should become the model for future application recovery.

## 8.4 UI state

The FEA UI upgrade completed:

- one field-selection authority;
- explicit geometry state and deformation scale;
- numeric legends with units;
- fail-closed staged execution;
- Worker/progress/cancel/preflight behavior;
- mesh-quality evidence display;
- supplied-level convergence review;
- five LAFEA presenters;
- shell field visualization;
- raw-evidence and limitation disclosure.

UI qualification does not promote an unqualified kernel or application.

---

# 9. Application templates and controlled applications

## 9.1 Generic template registry

`src/core/lafea-application-templates/template-registry.js` contains analytical, continuum, shell, recovery, and assessment templates.

Most templates are `CONCEPT` or `BLOCKED` because their geometry, load, boundary, mesh, recovery, and benchmark compilers are null or pending.

A template label is not an implemented analysis.

## 9.2 Bucket B application programme

Bucket B provides controlled linear 2D application qualification using:

```text
plane stress Q8
plane strain Q8
axisymmetric Q8
full 3 x 3 integration
controlled mesh families
fixed-coordinate recovery
SCL/interface evidence
independent oracles
exact-head receipts
```

Registered applications are:

| Module | Formulation | Audited merged state at baseline |
|---|---|---|
| `C2D-LUG-PINHOLE` | Plane stress | Controlled procedure merged through BB-06 |
| `C2D-CLAMP-EAR` | Plane stress | Controlled procedure merged through BB-06 |
| `C2D-BRACKET-GUSSET` | Plane stress | Controlled procedure merged through BB-07 |
| `C2D-PIPE-PAD-SECTION` | Plane strain | Controlled procedure merged through BB-08 |
| `C2D-NOZZLE-REPAD-SECTION` | Plane strain | BB-09 pending at audited baseline |
| `C2D-FLANGE-HUB` | Axisymmetric | Axisymmetric registration merged through BB-10; BB-11 application pending |

A final combined adjudication package, BB-12, remains required before claiming Bucket B programme completion.

No Bucket B package currently grants automatic production execution or code compliance.

## 9.3 Registry reconciliation issue

The generic application-template registry still describes several Bucket B templates as concept or blocked with older pending-authority text. It is not automatically synchronized with the Bucket B qualification registry.

Future work must add a fail-closed adoption receipt or projection layer. It must not manually relabel templates based on PR titles.

---

# 10. Benchmarking and qualification status

## 10.1 Core benchmark families

### LAFEA.1

- coordinate basis and load transfer;
- force/moment conservation;
- Lamé pressure field and boundary residual;
- open/closed/explicit axial conditions;
- deterministic hashes and hostile-input rejection.

### LAFEA.2

- annulus section properties;
- membrane, biaxial bending, torsion;
- pressure reuse;
- principal/von Mises reconstruction;
- linear superposition and envelope provenance.

### LAFEA.3

- contract and source guards;
- T3 patch and element tests;
- T6 patch tests;
- Q8 patch tests;
- default-element/fallback policy;
- deterministic replay;
- pressure, traction, body force, temperature strain, and imposed displacement;
- stress/energy/equilibrium;
- continuum patch benchmark;
- cylinder benchmark;
- hole/Kirsch benchmark;
- recovery-layer and structural-stress checks.

### LAFEA.4

- contract, membrane, bending, cylindrical, pressure, solver/load, stress/energy;
- shell patch and shell bend benchmarks;
- basis/orientation and transformation diagnostics;
- quad-facet geometry;
- MITC4 element benchmark;
- MITC3 fallback benchmark;
- transverse-shear benchmark;
- shell resultant recovery.

The MITC checks qualify benchmark implementation behavior only; they do not change active runtime dispatch.

### LAFEA.5

- source/model/result contracts;
- predecessor-evidence custody;
- geometry and footprint topology;
- resultant transfer and reconstruction;
- weighted force fit;
- rank/singularity rejection;
- public LAFEA.4 adoption;
- stress provenance;
- determinism and hash reconstruction.

### Meshing and solver infrastructure

- topology, healing preview, quality gates, convergence quantities;
- T6 generation, Q8 recombination, mapped MITC mesh;
- mesh determinism;
- sparse Cholesky, sparse LDLT, mechanism diagnosis, tolerance table, scaling, determinism.

## 10.2 Bucket-01 status

The repository contains extensive Bucket-01 T6 candidate, probe, replay, convergence, and exact-head infrastructure. A later PR was described as technical closure/synchronization; however, the retained current-main autonomous ledger explicitly states:

```text
BUCKET_01_QUALIFIED = false
```

and lists remaining replay, stress-convergence/code-basis, deterministic-bundle, and final-adjudication gates.

Therefore the governing claim is:

> Bucket-01 infrastructure and technical integration exist, but production qualification and production switch are not established by the retained ledger.

This discrepancy must be resolved by an explicit final authority record, not by narrative interpretation.

## 10.3 Minimum benchmark requirements for every new application

A new application shall provide:

1. exact controlled geometry and units;
2. material and formulation authority;
3. deterministic mesh family with at least the governed number of levels;
4. mesh-quality evidence;
5. exact load and boundary normalization;
6. reaction and moment equilibrium;
7. strain-energy identity;
8. fixed physical displacement and stress probes;
9. SCL or structural-stress paths where applicable;
10. an independent analytical, numerical, or experimental reference;
11. independent checker separation from production implementation;
12. negative controls that fail for the intended reasons;
13. repeated deterministic execution;
14. exact-head workflow and retained artifact;
15. explicit authority table separating numerical, code, module, and production states.

A single mesh, a screenshot, or agreement of maximum von Mises stress is not qualification.

---

# 11. Code compliance

## 11.1 Current LAFEA code authority

Current LAFEA kernels explicitly state:

```text
NO_CODE_COMPLIANCE
```

There is no qualified LAFEA route for:

- ASME VIII Division 2 Part 5 elastic stress assessment;
- WRC 107/297/537 comparison;
- EN 13445 local assessment;
- fatigue curve use;
- weld structural-stress fatigue;
- plastic collapse;
- buckling;
- fitness-for-service acceptance.

`REC-VIII2-ESA` exists only as a blocked template with pending recovery and assessment profiles.

## 11.2 Required separation

For future code assessment:

```text
qualified numerical result
  -> qualified recovery/classification
  -> qualified load combination
  -> qualified material/allowable profile
  -> qualified code assessment
  -> reviewed acceptance report
```

Each arrow is an authority boundary.

`NUMERICAL_OUTPUT_QUALIFIED` shall not imply `CODE_ASSESSMENT_QUALIFIED`.

## 11.3 Relationship to LFEA B31 capability

The repository has a separate LFEA piping-frame and ASME B31 stress route. That capability may provide loads or independent comparisons, but it does not qualify LAFEA local continuum/shell code assessment.

---

# 12. Known issues and source-truth debt

## K-01 — stale LAFEA.3 engineering-level identity

`local-continuum/constants.js` still declares CST-only while T6/Q8 are runtime-dispatched.

**Action:** issue a behavior-preserving contract/documentation revision with compatibility and hash migration explicitly addressed.

## K-02 — stale T6/Q8 source comments

T6/Q8 files say they are not wired into the solve pipeline; `element.js` proves they are.

**Action:** correct comments and add source guard asserting dispatch.

## K-03 — stale LAFEA.3 standalone documentation

The old deterministic-continuum document describes the original CST-only foundation and lists no UI/application integration.

**Action:** either revise it to current state or mark it historical and subordinate to this document.

## K-04 — runtime shell route and MITC source diverge

MITC4/MITC3 source/tests exist, but active `local-shell` exports and calculation remain CST/DKT.

**Action:** keep benchmark-only status until a dedicated adoption package proves geometry basis, load mapping, recovery, solver, convergence, and regression parity.

## K-05 — generic template registry is stale relative to Bucket B

Templates remain concept/blocked even when controlled application procedures have merged.

**Action:** create a receipt-bound adoption/projection layer; do not directly toggle release strings.

## K-06 — production geometry-to-mesh-to-convergence orchestration incomplete

LAFEA.3 can solve supplied canonical meshes and meshing infrastructure exists, but the ordinary template route does not yet compile general source geometry into controlled mesh ladders and convergence evidence.

**Action:** make application compilers own geometry, mesh profile, load, boundary, probes, and recovery paths.

## K-07 — general T6 mesher does not support holes

The deterministic CDT route fails closed on holes.

**Action:** implement deterministic hole bridging or a robust constrained triangulation backend with exact topology and negative controls.

## K-08 — solver fragmentation

The active continuum uses dense Cholesky/PCG, shell uses dense Cholesky, footprint uses a local six-by-six solve, and `lafea-linear-solve` contains separate sparse direct infrastructure.

**Action:** define one versioned solver-policy contract and adopt solvers through explicit equivalence benchmarks, not file replacement.

## K-09 — convergence-policy fragmentation

Generic three-level monotonic convergence and Bucket B four-level reference-bound convergence coexist.

**Action:** establish a unified convergence API with problem-specific profiles and explicit plateau/oscillatory handling.

## K-10 — evidence scalability

Full stiffness matrices, Gauss B matrices, mapping records, and raw evidence are valuable for qualification but can become too large for ordinary browser execution and presentation.

**Action:** separate retained qualification artifacts from bounded production summaries while preserving hash-linked retrieval.

## K-11 — no nonlinear mechanics

No active LAFEA route supports contact, large displacement, plasticity, or unloading.

**Action:** keep nonlinear shell contact as a separate programme with external-kernel custody or a newly qualified native kernel.

## K-12 — no production code assessment

Code labels/templates exist without qualified assessment engines.

**Action:** retain blocked state until numerical recovery and code profiles qualify independently.

## K-13 — Bucket-01 narrative/ledger ambiguity

Technical closure language exists, but the retained ledger keeps qualification false.

**Action:** produce one exact-head final authority record and remove ambiguous competing narratives.

## K-14 — axisymmetric capability is isolated

Axisymmetric Q8 mechanics exist in the Bucket B namespace rather than the ordinary local-continuum contract.

**Action:** complete flange-hub qualification first; later consider a receipt-bound reusable axisymmetric engine without weakening Bucket B custody.

## K-15 — no full application template compilers

Most registry templates have null geometry/load/boundary compilers.

**Action:** promote templates one at a time only after controlled application qualification.

---

# 13. Scalability and adaptation

## 13.1 Current scaling characteristics

### Dense continuum/shell

- memory approximately grows with `nDOF^2`;
- direct factorization work approximately grows with `nDOF^3`;
- suitable for small controlled local models only.

### Sparse continuum PCG

- sparse assembly reduces memory;
- Jacobi preconditioning is simple and deterministic;
- iteration count can grow significantly with refinement, aspect ratio, material contrast, and poor conditioning;
- no advanced preconditioner exists.

### Meshing

- deterministic algorithms are auditable;
- the general ear-clip/Lawson implementation is not an industrial-scale geometry kernel;
- current hole support and topology complexity are limited;
- exact curved midsides and deterministic identity are strengths worth preserving.

### Browser execution

- Worker execution and preflight exist at the workbench level;
- large JSON evidence and matrix retention can dominate memory and serialization;
- ordinary production should retain bounded summaries and content-addressed detailed evidence rather than rendering every matrix.

## 13.2 Scalability requirements

Future scalable LAFEA should provide:

1. a versioned solver-policy contract;
2. model-size and memory preflight before assembly;
3. sparse assembly for all scalable kernels;
4. robust scaling and conditioning evidence;
5. better preconditioning or a qualified sparse direct backend;
6. deterministic partitioning and ordering;
7. Worker or service isolation;
8. cancellation and bounded runtime;
9. tiered evidence retention;
10. performance benchmark ladders at fixed model sizes;
11. no reduction of numerical qualification to improve speed;
12. external solver/container custody when native browser execution is unsuitable.

## 13.3 Adaptation pattern for future FEA problems

Every future problem family should be expressed as:

```text
problem definition
  -> applicability classifier
  -> canonical geometry
  -> formulation profile
  -> mesh profile and ladder
  -> load/boundary compiler
  -> solver policy
  -> recovery profile
  -> convergence profile
  -> independent benchmark
  -> code assessment, when separately qualified
```

This pattern supports extension to:

- nozzle/repad sections;
- flange hubs;
- pipe shoes and trunnions;
- shell nozzles/tees/reducers/elbows;
- local contact and denting;
- elastic-plastic local collapse;
- buckling;
- weld structural stress and fatigue;
- submodel boundaries from global piping analysis.

---

# 14. Near-term result and quick enhancements

## 14.1 Near-term target

The next practical release target is:

> **A controlled linear 2D local-detail analysis route covering lugs, clamp ears, brackets/gussets, pipe pads, nozzle/repad sections, and axisymmetric flange hubs, with deterministic Q8 meshes, explicit loads and restraints, fixed physical probes/SCLs, mesh convergence, independent references, and exact-head qualification.**

## 14.2 Quick enhancement package Q0 — truth reconciliation

Behavior-preserving work:

- correct the LAFEA.3 CST-only identity/documentation drift;
- correct stale T6/Q8 comments;
- mark MITC source as benchmark-only in one central capability registry;
- reconcile historical documents with this roadmap;
- add a document/capability drift check.

## 14.3 Q1 — complete Bucket B

- BB-09 nozzle/repad controlled procedure;
- BB-11 flange/hub controlled axisymmetric application;
- BB-12 final current-main exact-head adjudication;
- no code or production promotion unless separately approved.

## 14.4 Q2 — registry adoption

- receipt-bound projection from Bucket B reports into the application-template registry;
- no manual release-status toggles;
- expose exact limitations and qualified geometry envelope.

## 14.5 Q3 — controlled template compilers

For each qualified module, add explicit:

- parameter schema;
- geometry compiler;
- load compiler;
- boundary compiler;
- mesh profile and mesh ladder;
- recovery/path compiler;
- benchmark-manifest binding.

## 14.6 Q4 — ordinary workbench route

- template selection;
- input review;
- mesh preview and quality;
- execute mesh ladder;
- convergence review;
- result/provenance export;
- retain production authorization false until formally granted.

## 14.7 Q5 — solver/evidence scaling

- adopt a shared solver-policy interface;
- benchmark sparse direct versus PCG;
- move heavy qualification evidence to content-addressed artifacts;
- preserve bounded summaries in the UI.

---

# 15. Future roadmap

## Horizon A — reliable 2D local-detail FEA

**Goal:** complete and integrate Bucket B.

Deliverables:

- plane-stress Q8 applications;
- plane-strain Q8 applications;
- axisymmetric Q8 flange/pressure applications;
- fixed-probe and SCL recovery;
- controlled mesh ladders;
- application compilers;
- workbench execution and export;
- no automatic code acceptance.

Exit criteria:

```text
all required application packages qualified
final exact-head adjudication passed
template adoption receipts valid
ordinary route cannot bypass qualified compilers
limitations visible
production authority explicitly decided
```

## Horizon B — production shell mechanics

**Goal:** establish a qualified shell path for pipe and vessel local models.

Required packages:

1. MITC4/MITC3 adoption gate;
2. shell geometry and basis qualification;
3. mapped/unstructured shell meshing;
4. pressure and resultant load mapping;
5. sparse scalable solve;
6. surface stress and resultant recovery;
7. shell patch, bend, cylinder, pinched-cylinder, nozzle/attachment benchmarks;
8. controlled pipe shoe/trunnion/nozzle templates;
9. convergence and boundary-decay evidence.

The legacy CST/DKT path should remain a named fallback until migration is independently qualified.

## Horizon C — nonlinear shell contact and local denting

**Goal:** address local denting of thin, large-diameter pipes.

Scope sequence:

```text
NC-00 contracts and solver custody
NC-01 geometrically nonlinear shell and frictionless contact
NC-02 elastic pressurized-pipe indentation
NC-03 J2 plasticity and unloading
NC-04 permanent dent qualification
NC-05 final application/production adjudication
```

This programme must support:

- finite rotation;
- pressure follower load;
- contact opening/closure and changing area;
- controlled rigid support/indenter surfaces;
- contact force, area, centroid, and pressure distribution;
- dent depth and ovalization;
- later elastic-plastic residual dent.

It shall remain separate from Bucket B linear 2D authority.

## Horizon D — code assessment and weld/fatigue

Possible packages:

- ASME VIII-2 elastic stress assessment;
- stress classification lines and category rules;
- protection against plastic collapse;
- buckling assessment;
- weld structural-stress recovery;
- fatigue curves and cycle counting;
- WRC comparison or independent screening;
- fitness-for-service interfaces.

No code package starts until the underlying numerical and recovery quantities qualify.

## Horizon E — advanced multiphysics and enterprise scale

Longer-term possibilities:

- thermal conduction coupled to structural response;
- creep and temperature-dependent material behavior;
- dynamic/impact analysis;
- submodelling from global piping/frame models;
- remote solver service with signed execution receipts;
- adaptive refinement driven by qualified error estimators;
- external solver interoperability through canonical contracts;
- large-model distributed evidence storage.

These are not current commitments or claims.

---

# 16. Roadmap gates and acceptance policy

## 16.1 Kernel gate

A formulation must pass:

- rigid-body modes;
- constant strain/curvature patches;
- stiffness symmetry;
- load consistency;
- analytical references;
- energy and equilibrium;
- distorted mesh cases;
- deterministic replay;
- independent implementation comparison.

## 16.2 Application gate

An application must pass:

- exact controlled geometry;
- applicability envelope;
- deterministic mesh family;
- mesh quality;
- boundary/load normalization;
- fixed physical recovery;
- convergence;
- independent reference;
- negative controls;
- exact-head workflow.

## 16.3 Code gate

A code assessment must additionally bind:

- edition and clause/table authority;
- material and allowable source;
- stress category/classification;
- load combinations;
- fatigue/plastic/buckling rules where applicable;
- limits of applicability;
- independently checked worked examples.

## 16.4 Production gate

Production authorization requires:

- qualified kernel and application;
- bounded ordinary input route;
- no caller-created authority;
- audit/export evidence;
- UI limitations and warnings;
- deterministic or controlled external execution;
- rollback path;
- exact-head final adjudication.

---

# 17. Mandatory maintenance checklist

Every future LAFEA capability PR shall answer:

```text
1. What exact capability changed?
2. Which source file is the runtime authority?
3. Which canonical schema changed?
4. Which formulation/element profile changed?
5. Which mesh profile changed?
6. Which solver policy changed?
7. Which load or boundary semantics changed?
8. Which recovery/convergence profile changed?
9. Which benchmark independently validates it?
10. Which exact-head workflow ran?
11. Which authority state advanced?
12. Which authority states remain false?
13. Which limitations were added or removed?
14. Was this document updated?
```

A PR shall be blocked when the answer is unclear or when source, registry, report, and documentation disagree.

---

# 18. Canonical source inventory

## Architecture and workbench

```text
ARCHITECTURE_TRUTH.md
src/workspace/lafea-stage-registry.js
src/workspace/lafea-stage-composition-bindings.js
src/workspace/lafea-stage-components.js
src/workspace/lafea-workbench-model.js
src/workspace/lafea-controlled-continuum-stage-route.js
src/workspace/lafea-result-presenters/**
reports/fea-ui-upgrade-completion.md
```

## Analytical stages

```text
src/core/local-stress/**
src/core/local-attachment-screening/**
```

## Continuum

```text
src/core/local-continuum/**
```

## Shell and footprint

```text
src/core/local-shell/**
src/core/local-trunnion-footprint/**
```

## Meshing and solver infrastructure

```text
src/core/lafea-meshing/**
src/core/lafea-linear-solve/**
src/core/lafea-profile-contract/**
```

## Applications and qualification

```text
src/core/lafea-application-templates/**
src/core/bucket-b/**
docs/Bucket_B_Two_Dimensional_Continuum_FEA_Benchmark_Record_Rev1.md
docs/qualification/**
```

## Executable check registration

```text
package.json
scripts/lafea.*
scripts/lafea-*
scripts/bucket-b-*
.github/workflows/*lafea*
.github/workflows/*bucket-b*
```

---

# 19. Final governing statement

At the audited baseline, LAFEA is a disciplined and increasingly capable **linear local-analysis framework** with strong canonicalization, provenance, deterministic execution, fail-closed behavior, benchmark infrastructure, and controlled application qualification.

Its strongest presently usable numerical path is linear 2D continuum analysis of supplied meshes. Its strongest controlled application direction is Bucket B Q8/axisymmetric qualification. Its shell estate contains a qualified legacy triangular thin-shell runtime and promising MITC formulation infrastructure that has not yet been adopted into production dispatch. It has no qualified nonlinear contact, plasticity, weld, fatigue, buckling, or local code-assessment route.

The roadmap priority is therefore:

```text
truth reconciliation
  -> complete Bucket B
  -> adopt qualified applications into controlled templates
  -> make geometry/meshing/convergence orchestration ordinary and auditable
  -> scale solver and evidence handling
  -> qualify production shell mechanics
  -> add nonlinear contact/denting as a separate programme
  -> add code assessment only after numerical/recovery qualification
```

No future update may shorten this chain by relabelling an implementation artifact as engineering authority.
