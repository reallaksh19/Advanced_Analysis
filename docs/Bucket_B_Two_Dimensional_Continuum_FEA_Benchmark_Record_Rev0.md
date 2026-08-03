# Bucket B Benchmark Record for Two-Dimensional Continuum FEA

## Scope and qualification disposition

**Record identifier:** `BKT-B-C2D-BMR-001`  
**Revision:** `Rev 0 — qualification specification`  
**Record date:** August 4, 2026  
**Applies to:** linear-elastic, small-strain, two-dimensional continuum finite-element procedures for the six application modules listed below.

This record establishes the geometry controls, formulation declarations, mesh evidence, solution checks, frozen outputs, convergence requirements, and release gates needed to qualify Bucket B. It is a **benchmark specification**, not a claim that any solver or implementation has already passed. Actual qualification requires executed result files, completed comparison tables, configuration hashes, and independent review.

The record follows the distinction made in ASME V&V 10 between verification of the computational implementation and validation of a model’s representation of the real system. The proposed cases primarily provide code, calculation, formulation, and procedural verification; they do not by themselves validate a lug, bracket, clamp, nozzle, flange, or pipe-pad model against physical test data. NASA-STD-7009B similarly requires defined acceptance criteria, traceable evidence, assessment of model credibility, and reporting proportionate to the decision risk.

The resulting Bucket B disposition is:

| Application module | Mandatory formulation declaration | Qualification status at issue |
|---|---|---|
| `C2D-LUG-PINHOLE` | Plane stress | Ready for controlled execution |
| `C2D-BRACKET-GUSSET` | Plane stress | Ready for controlled execution |
| `C2D-CLAMP-EAR` | Plane stress | Ready for controlled execution; contact expressly excluded |
| `C2D-FLANGE-HUB` | Axisymmetric continuum | **Blocked pending independent axisymmetric registration** |
| `C2D-NOZZLE-REPAD-SECTION` | Plane strain | Ready only as an extruded section surrogate |
| `C2D-PIPE-PAD-SECTION` | Plane strain | Ready only as an axially constrained, long-section surrogate |

No module may infer its dimensional formulation from the prefix `C2D` or from its template name. Plane-stress elements enforce zero out-of-plane stress and are intended for thin, flat bodies under in-plane loading; plane-strain elements enforce zero out-of-plane strain and represent bodies whose geometry, loading, and response are effectively invariant in the out-of-plane direction. Axisymmetric elements represent a full 360-degree body and require both axisymmetric geometry and axisymmetric loading.

## Governing technical basis

### Formulation controls

For every planar record, the input deck and result header shall contain one of the literal values:

```text
FORMULATION = PLANE_STRESS
FORMULATION = PLANE_STRAIN
FORMULATION = AXISYMMETRIC
```

For plane stress and plane strain, the physical out-of-plane thickness or benchmark unit depth shall be recorded because it controls force, reaction, stiffness, and energy scaling. Axisymmetric continuum elements do not use an artificial planar thickness; their volume integration includes the circumferential `2πr` contribution.

The qualifying continuum element is an eight-node isoparametric quadrilateral, designated generically as **Q8**. Full integration is the baseline; for implementations using a conventional quadratic axisymmetric quadrilateral, this normally means a `3 × 3`, nine-point integration rule. Any reduced-integration variant must be registered separately and demonstrate that hourglass, spurious zero-energy, volumetric-locking, and integration sensitivity controls do not alter the benchmark quantities.

### Verification hierarchy

Each application record has two evidence layers:

**Formulation verification** uses a closed-form or manufactured reference field to test element kinematics, constitutive response, load normalization, reactions, stress recovery, and energy.

**Application procedural verification** uses the actual application-shaped geometry to test meshing rules, interface treatment, load distribution, fixed probes, section paths, stress linearization, and postprocessing. Where a closed-form application solution does not exist, the reference is a separately generated, highly refined solution whose creation and review are independent of the production template.

### Pressure-code basis

For the pressure-component records, the default code basis is:

```text
CODE_BASIS = ASME BPVC Section VIII, Division 2
EDITION = 2025
ASSESSMENT_METHOD = Part 5, Design by Analysis
```

The exact paragraphs, allowable-stress source, load combinations, weld assumptions, fatigue basis, and assessment method must still be frozen in the project-specific code map. Edition locking is mandatory rather than treating `VIII-2` as an edition-independent label.

For the lug, bracket, and clamp records, no generic ASME pressure-vessel acceptance ratio is implied. Their OUT records may compute section resultants, stress concentration quantities, or project-defined allowables, but a pass/fail code assessment is permitted only when the record identifies an approved structural code, edition, material allowable, load factor, and stress categorization procedure.

## Common benchmark record and acceptance rules

### Controlled baseline

Unless a case record states otherwise, the common benchmark uses:

| Item | Controlled value |
|---|---|
| Unit system | N, mm, MPa |
| Material | Homogeneous isotropic linear elasticity |
| Young’s modulus | `E = 210,000 MPa` |
| Poisson’s ratio | `ν = 0.30` |
| Kinematics | Small strain, small displacement |
| Element | Q8 continuum, full integration |
| Analysis | Linear static |
| Geometry | Exact analytic curves or tolerance-controlled CAD |
| Mesh sequence | M0, M1, M2 with nominal local size ratio `2:1:0.5` |
| Stress used for qualification | Unaveraged integration-point stress mapped by a frozen interpolation procedure |
| Display-only stress | Nodal-averaged or smoothed stress, clearly labeled non-qualifying |

The use of displacements as primary finite-element unknowns means stresses generally converge less rapidly and are more sensitive to mesh quality than global displacements. Bucket B therefore applies different limits to global response, nonsingular local stress, and peak stress.

### Mandatory MESH record

Every executed case shall preserve the following evidence:

| MESH field | Required evidence |
|---|---|
| Geometry identity | CAD or parameter-file checksum, dimensional table, and curve tolerances |
| Formulation | Plane stress, plane strain, or axisymmetric, including thickness or unit-depth convention |
| Element identity | Solver element name, order, integration rule, formulation options, and material model |
| Topology | Element and node counts by region; named edges, interfaces, holes, fillets, and SCL anchors |
| Curvature conformity | Midside nodes on analytic circular or fillet geometry; no chordal replacement at qualifying boundaries |
| Jacobian | Minimum determinant at all integration points; normalized Jacobian statistic `qJ` |
| Distortion | Aspect ratio, corner-angle or warpage equivalent, and midside-node placement checks |
| Refinement | M0/M1/M2 seed tables and actual characteristic sizes |
| Probe stability | Probe IDs attached to geometric parameters rather than nearest-node numbers |
| Interface evidence | Coincidence, tie/bond definition, normal orientation, duplicate-node check, and traction-transfer check |
| Change control | Mesh-generator version, settings checksum, and generated-deck hash |

For this record, the normalized element Jacobian is defined as:

```text
qJ,e = min_g(det J_e,g) / max_g(det J_e,g)
```

where `g` covers all integration and control points used by the mesh checker. The proposed hard gates are:

```text
det J_e,g > 0 for every element and point
qJ,min >= 0.20
```

No qualifying curved edge may contain a missing midside node. The hotspot-region target aspect ratio is at most 5; the general-region target is at most 10. These are Bucket B project limits, not universal solver defaults. A solver-specific mesh metric may be recorded in addition, but it may not replace the defined `qJ` statistic.

### Mandatory CORE record

The CORE record shall include applied loads, total reactions, reference-point displacements, strain energy, external work, section resultants, interface resultants, and selected nonsingular stresses.

For a linear-elastic static analysis with proportionally applied dead loads, the following checks apply:

```text
εF = ||ΣR + ΣF|| / max(Σ|F|, 1) <= 1.0e-6
εE = |2U - Fᵀu| / max(|2U|, |Fᵀu|, 1) <= 1.0e-5
```

The reaction check shall be performed independently from the solver’s reported force-balance flag. The energy check shall use the same load and displacement conventions as the solver; imposed-displacement work and follower loads, if later introduced, require a case-specific derivation.

The convergence sequence uses the physical characteristic size `h`, not element count. For a response `Q`:

```text
pobs = ln |(Q0 - Q1) / (Q1 - Q2)| / ln 2
Qext = Q2 + (Q2 - Q1) / (2^pobs - 1)
```

The extrapolation is permitted only when the sequence is monotonic and asymptotic.

The proposed qualification limits are:

| Quantity | M1-to-M2 change | Error against analytic or approved reference |
|---|---:|---:|
| Total reaction | `0.05%` | `0.05%` |
| Reference displacement | `0.5%` | `1.0%` |
| Strain energy | `0.5%` | `1.0%` |
| Nonsingular stress | `2.0%` | `3.0%` |
| SCL membrane component/resultant | `2.0%` | `3.0%` |
| SCL bending component/resultant | `3.0%` | `5.0%` |
| Finite-radius local peak stress | `5.0%` | `7.5%` |
| Bonded-interface resultant mismatch | `0.5%` | `1.0%` |

An observed order below 1.5 is a review trigger for smooth Q8 regions, unless the finest-mesh error is already below 0.2% or the response is crossing zero. Nonmonotonic convergence requires a fourth mesh or a documented alternate uncertainty estimate.

### Mandatory OUT record

The frozen OUT procedure shall define:

- geometric path IDs and direction;
- path station coordinates or normalized parameters;
- local coordinate-system construction;
- integration-point interpolation method;
- whether values are extrapolated, averaged, or unaveraged;
- component ordering and sign convention;
- section-integration rule;
- treatment of surface pressure in linearized stresses;
- code edition, paragraph map, allowable values, and assessment equations;
- CSV or equivalent machine-readable output schema and file hash.

The path extraction script shall be versioned separately from the solver deck. An independent reviewer shall be able to reproduce the published tables from the raw result database without editing probe locations.

## Application benchmark records

### `C2D-LUG-PINHOLE`

**Applicability declaration:** `PLANE_STRESS`.

This module represents a thin, uniform-thickness lug with traction-free broad faces and loading nominally uniform through thickness. It does not qualify a thick lug with significant through-thickness restraint, a tapered lug, pin-lug contact, pin bending, friction, clearance, or three-dimensional bearing variation.

#### Controlled application geometry

| Parameter | Value |
|---|---:|
| Hole radius `a` | 10 mm |
| Lug outer radius about hole | 25 mm |
| Shank width | 50 mm |
| Hole center to grip edge | 80 mm |
| Lug-to-shank root fillet | 5 mm |
| Thickness | 5 mm |
| Applied bearing resultant `F` | 25 kN |

The bearing surrogate is a radial pressure over the loaded half of the hole:

```text
p(θ) = p0 cos θ,  -π/2 <= θ <= π/2
p0 = 2F / (πat) = 318.310 MPa
```

The remote grip edge uses a distributed kinematic constraint or uniform displacement, not a single fixed node. Contact is outside this benchmark.

#### MESH record

The hole uses a conforming annular O-grid. M0, M1, and M2 contain respectively 32, 64, and 128 sectors around the full hole, with at least 4, 8, and 16 radial Q8 layers between the hole and the first topology transition. Midside nodes are projected to the exact circular boundary. The transition from the O-grid to the shank must remain topologically identical between mesh levels. Hole probes are defined at `θ = 0°, 15°, ..., 180°`, and radial paths are fixed at `0°`, `45°`, and `90°`.

#### CORE record

The controlled responses are hole-center displacement relative to the mean grip displacement, total grip reaction, strain energy, net-section axial resultant, and unaveraged hoop stress at the defined hole angles. Reaction and energy must meet the common gates. Hole stress must meet the nonsingular-stress convergence limit; root-support corner stresses are excluded because the boundary-condition transition may create a local singularity.

A separate annular-hole formulation check shall use the classical circular-hole elasticity field. At the hole boundary under remote uniaxial stress `σ0`:

```text
σrr = 0
τrθ = 0
σθθ = σ0(1 - 2 cos 2θ)
```

This gives `-σ0` at the load-axis point and `3σ0` at the transverse point. The annular outer boundary shall receive the corresponding exact elasticity tractions so that finite-boundary effects do not contaminate the element check.

#### OUT record

Frozen outputs are hole-boundary `σrr`, `σθθ`, and `τrθ`; radial stress paths; net-ligament section resultants; and a linearized in-plane section distribution across each ligament. Because this line crosses an in-plane load-bearing ligament rather than a pressure-vessel wall thickness, it shall be labeled `SECTION_LINEARIZATION`, not automatically represented as an ASME through-wall SCL. A code ratio may be issued only after an approved structural assessment map is attached.

**Pass statement:** Qualified when all common gates pass, the Kirsch companion case meets 1% stress error at the defined probes, and the application-shaped bearing case meets the M1-to-M2 stress and energy limits.

### `C2D-BRACKET-GUSSET`

**Applicability declaration:** `PLANE_STRESS`.

This module represents a sheet, plate, or web-like bracket of uniform thickness under in-plane load. It does not qualify out-of-plane bracket bending, flange torsion, eccentric fastener loading, weld throat behavior, plate buckling, or a thick bracket whose through-thickness constraint is better represented by plane strain or three-dimensional solids.

#### Controlled application geometry

| Parameter | Value |
|---|---:|
| Horizontal arm length | 200 mm |
| Arm depth | 40 mm |
| Support-leg height | 120 mm |
| Triangular gusset projection | 80 mm by 80 mm |
| Gusset toe fillet | 5 mm |
| Gusset root fillet | 10 mm |
| Thickness | 6 mm |
| Distributed end load | 10 kN downward |

#### MESH record

Q8 elements shall follow the toe and root fillets with at least eight elements through each 90-degree fillet arc on M1 and sixteen on M2. The loaded edge and support edge shall each have at least eight M1 elements. No concentrated nodal load is permitted. The fillet-to-arm and fillet-to-support transitions shall be mapped where practicable, with no abrupt element-size ratio above 2 between adjacent layers.

#### CORE record

The principal global quantities are loaded-edge mean displacement, support reaction, support moment about the bracket datum, and strain energy. A companion cantilever-strip model provides the beam reference:

```text
δbeam = FL^3 / (3EI) + FL / (κGA)
I = th^3 / 12
A = th
G = E / [2(1 + ν)]
κ = 5/6
```

Because the gusset and finite support alter the ideal beam boundary, the full bracket need only agree with the approved beam/plate reference model within 5%; it must agree with the independently refined two-dimensional continuum reference within 1% for loaded-edge displacement and energy.

#### OUT record

Frozen outputs include unaveraged principal and equivalent stresses on fillet-normal paths at the toe, mid-fillet, and root; support-edge reaction density; section resultants through the arm and support leg; and SCL-style membrane/bending decomposition across the selected bracket sections. The stress exactly at a fixed-support corner is not a qualifying quantity. A fillet with zero radius is prohibited in the qualification geometry.

**Pass statement:** Qualified when reactions and moments close, global responses meet the independent-reference limits, and all finite-radius fillet paths satisfy the nonsingular stress convergence requirement.

### `C2D-CLAMP-EAR`

**Applicability declaration:** `PLANE_STRESS`.

This module represents a thin ear or clevis plate with in-plane distributed loading. Its scope explicitly excludes surface-to-surface contact, pin clearance, friction, pin elasticity, local crushing constitutive behavior, and three-dimensional load redistribution across ear thickness.

Two load cases are mandatory.

#### Open-hole verification case

A wide plate containing a circular hole is loaded in remote uniaxial tension. Exact elasticity tractions are applied on the outer annular boundary, and the Kirsch field used for `C2D-LUG-PINHOLE` supplies the stress reference.

#### Bearing-surrogate application case

A cosine-distributed radial pressure acts over a specified half-hole or load arc. The pressure amplitude is calculated from the required resultant rather than entered independently. The clamp base is divided into named upper and lower reaction regions so that reaction split can be checked.

#### MESH record

The hole uses an O-grid with the same angular sequence as the lug record. The loaded arc endpoints shall coincide with geometry partitions, preventing the pressure cutoff from moving between mesh levels. The upper and lower support boundaries shall retain identical geometric extents and named-set definitions. At least six Q8 layers are required between the hole and the nearest ear free edge on M1.

#### CORE record

For the open-hole case, the primary quantities are the circumferential stress distribution, radial displacement at the hole, reaction, and energy. For the bearing-surrogate case, the primary quantities are loaded-hole displacement, total reaction, upper/lower reaction split, and net-section resultant. The total reaction must meet the common `1.0e-6` balance limit; each reaction fraction must change by no more than 1% between M1 and M2.

#### OUT record

Frozen outputs include radial and circumferential stresses along `θ = 0°, 30°, 60°, 90°`; hole-boundary angular traces; upper and lower reaction-density traces; and section resultants across each ear ligament. The result header shall contain:

```text
CONTACT = NONE
PIN_MODEL = DISTRIBUTED_BEARING_SURROGATE
CLEARANCE = NOT_MODELED
FRICTION = NOT_MODELED
```

**Pass statement:** Qualified only when both load cases pass. Passing the open-hole analytical case alone does not qualify the bearing load distribution or reaction-split postprocessor.

### `C2D-FLANGE-HUB`

**Applicability declaration:** `AXISYMMETRIC`.

This record represents a full annular flange, hub, and attached cylinder under axisymmetric pressure and an axisymmetric bolt resultant. It may not represent a discrete bolt pattern, flange separation varying with circumferential angle, nonuniform gasket seating, nozzle loads, piping moments with circumferential harmonics, or any other non-axisymmetric response.

**Qualification status:** **BLOCKED.**

No flange-hub application deck may be credited until the axisymmetric element, load normalization, stress components, reaction recovery, and postprocessing have passed the independent registration defined in the axisymmetric registration gate.

After registration, the application record shall contain the following.

#### MESH record

A meridional Q8 mesh with separate named regions for cylinder, hub, flange ring, gasket or load band, and bolt-resultant band. Material interfaces must be conformal or use an explicitly registered bonded formulation. M1 shall have at least four Q8 elements through nominal cylinder thickness and six through the hub-shell transition; M2 doubles those counts. The radial coordinate must remain strictly nonnegative, and no element may cross the symmetry axis.

#### CORE record

Three linear load cases are required: pressure-only, bolt-resultant-only, and combined pressure plus bolt resultant. Pressure-only far-field cylinder stresses and radial displacement are compared with the Lamé thick-cylinder reference. Bolt-only total axial reaction must equal the prescribed full-circumference bolt resultant. The combined solution must equal the numerical superposition of the first two cases within `1.0e-8` relative tolerance for displacements and reactions, confirming that no hidden nonlinear option has been activated.

#### OUT record

Through-wall SCLs are required at the cylinder far field, hub-shell transition, hub neck, flange root, gasket or load band, and bolt-load band. Each SCL shall report `σr`, `σz`, `σθ`, `τrz`, component-wise membrane and bending parts, stress intensity or equivalent stress as required by the frozen code map, and equilibrium resultants. Hoop stress must never be reconstructed from a planar assumption; it must come from the axisymmetric continuum solution.

### `C2D-NOZZLE-REPAD-SECTION`

**Applicability declaration:** `PLANE_STRAIN`.

This is not a general two-dimensional representation of a circular nozzle in a cylindrical or spherical vessel. It qualifies an **out-of-plane extruded slot-nozzle and reinforcement-pad section** for which geometry and loading are invariant along the extrusion and out-of-plane strain is constrained to zero. A real isolated circular nozzle generally has three-dimensional circumferential load redistribution and is outside this record.

#### Controlled normalized geometry

| Feature | Dimension |
|---|---:|
| Vessel wall thickness | `T` |
| Nozzle wall thickness | `0.75T` |
| Nozzle half-width | `2T` |
| Repad thickness | `0.50T` |
| Repad half-width | `4T` |
| Junction and repad edge radii | At least `0.25T` |
| Out-of-plane convention | Unit depth |

#### MESH record

Vessel, nozzle, and repad are separate named regions with conformal or registered bonded interfaces. M1 contains at least four Q8 elements through the vessel and nozzle walls and three through the repad; M2 doubles these counts. Junction fillets and repad edges use mapped refinement with a maximum adjacent-size ratio of 1.5 in the SCL zones. The bonded-interface normal and tangent directions are frozen.

#### CORE record

Pressure-only and pressure-plus-section-load cases are required. Remote boundary tractions shall impose documented membrane force `N` and bending moment `M` per unit out-of-plane depth. An unperforated companion wall is compared with elementary section response, while the complete nozzle-repad assembly is compared with an independently generated refined continuum model. Interface equilibrium is checked by integrating tractions independently on both sides of every bonded boundary.

#### OUT record

SCLs are frozen in the vessel wall on both sides of the junction, through the nozzle wall, and through the repad at its inner region and edge. Vessel SCLs include stations at nominal offsets `1T`, `2T`, and `4T` from the junction where geometry permits. The record shall preserve total stress, membrane, bending, residual peak, and pressure-correction convention.

Stress linearization must operate on stress components before forming derived measures; membrane and bending stresses are related to section force and moment resultants rather than to a linear fit of already-calculated principal stress.

**Pass statement:** Qualified only for the declared extruded plane-strain section. The qualification report must carry the caveat `NOT VALID FOR ISOLATED CIRCULAR NOZZLE`.

### `C2D-PIPE-PAD-SECTION`

**Applicability declaration:** `PLANE_STRAIN`.

This module represents the transverse section of a long pipe with a pad that is constant over a sufficiently long out-of-plane distance and whose axial strain is constrained or negligible. It does not qualify a finite-length pad, axial pad termination, pad corner wrapping, local pipe bending along the axis, debonding, weld throat response, or contact between pad and pipe.

The pressure-only companion model is a plane-strain thick cylinder. For inner radius `a`, outer radius `b`, internal pressure `pi`, and external pressure `po`:

```text
A = (pi a^2 - po b^2) / (b^2 - a^2)
B = a^2 b^2 (pi - po) / (b^2 - a^2)
σr = A - B/r^2
σθ = A + B/r^2
σz = ν(σr + σθ) = 2νA
```

#### MESH record

The pipe and pad are separately named, with a bonded interface following the exact pipe arc. The pressure-only companion uses a fully mapped annular Q8 mesh. The pad model refines the interface, pad toe, and pad root, with at least eight M1 elements along each finite-radius transition and four elements through the pipe wall. A sharp zero-radius toe or root is prohibited for peak-stress qualification.

#### CORE record

Pressure-only radial displacement and `σr`, `σθ`, and `σz` are compared with the plane-strain Lamé solution. A second case applies an external line load per unit axial length through a cosine or otherwise frozen distributed traction over a finite pad arc. A third combined case verifies superposition. Interface force and moment resultants are computed from the pipe side and pad side independently and must agree within 0.5%.

#### OUT record

Frozen outputs include pipe-side and pad-side interface traction traces, integrated interface equilibrium, radial paths through the pipe and pad, circumferential paths beneath and beside the pad, and finite-radius toe/root stress paths. SCLs are located through the pipe wall at pad center, toe, root, and specified offsets. The closest point to a material-interface endpoint may be reported but is not a convergence quantity if the local idealization produces a mathematical singularity.

**Pass statement:** Qualified only with the caveat `PLANE_STRAIN_LONG_SECTION`. A free-ended or closed-ended pipe requiring nonzero uniform axial strain must use a separately registered generalized-plane-strain or three-dimensional model; it may not silently reuse this record.

## Axisymmetric registration gate

The qualification condition for `C2D-FLANGE-HUB` is satisfied only by completing `AXI-Q8-REG-001` and obtaining an independent approval signature.

### Registration patch case

The first case prescribes the displacement field:

```text
ur = αr
uz = βz
```

on a rectangular meridional domain `a <= r <= b`, `0 <= z <= L`. This produces constant strains:

```text
εr = α
εθ = ur/r = α
εz = β
γrz = 0
```

The test verifies the axisymmetric hoop-strain term, constitutive matrix, radial coordinate convention, integration weighting, and stress-component export. All Q8 integration points must reproduce the analytical constant stress state to within `1.0e-10` relative error, subject to solver precision.

### Thick-cylinder case

Use:

| Parameter | Value |
|---|---:|
| Inner radius `a` | 100 mm |
| Outer radius `b` | 200 mm |
| Axial model length `L` | 100 mm |
| Internal pressure `pi` | 100 MPa |
| External pressure `po` | 0 |
| `E` | 210,000 MPa |
| `ν` | 0.30 |

The lower axial edge has `uz = 0` as a symmetry plane; the upper edge is axially traction-free. The analytical constants and target values are:

```text
A = 33.333333 MPa
B = 1.333333e6 MPa·mm^2
```

| Quantity | Analytical target |
|---|---:|
| `σr(a)` | `-100.000000 MPa` |
| `σθ(a)` | `166.666667 MPa` |
| `σr(b)` | `0.000000 MPa` |
| `σθ(b)` | `66.666667 MPa` |
| `ur(a)` | `0.0936508 mm` |
| `ur(b)` | `0.0634921 mm` |

For the open-ended, axially traction-free state:

```text
ur(r) = [(1 - ν)Ar + (1 + ν)B/r] / E
```

M0, M1, and M2 shall use 2, 4, and 8 Q8 elements through the radial thickness. The finest-mesh targets are 0.25% maximum error in radial displacement and 0.5% in unaveraged `σr` and `σθ` at the defined interior probes.

### Full-circumference load-normalization case

Apply uniform axial pressure `pz` to an annular end face. The full three-dimensional resultant is:

```text
Fz = pz π (b^2 - a^2)
```

The reported axial reaction shall equal this resultant within `1.0e-8` relative error. This test establishes whether the solver’s axisymmetric pressure, line load, concentrated load, and reported reaction are full-circumference quantities, per-radian quantities, or use another convention. The flange bolt-resultant generator may not be approved until that convention is documented and independently checked.

### Independent benchmark requirement

Independent means all of the following:

| Independence item | Requirement |
|---|---|
| Analytical evaluator | Separate script or workbook, not equations embedded in the production postprocessor |
| Model creation | Independently prepared deck or independently reviewed generated deck |
| Result extraction | Separate extraction routine or manual spot check from raw integration-point output |
| Reviewer | Person other than the model author |
| Optional cross-solver check | Strongly preferred for radial displacement, hoop stress, and force normalization |

Only after the patch, thick-cylinder, and load-normalization cases pass may the axisymmetric formulation be assigned:

```text
FORMULATION_REGISTRATION = AXI-Q8-REG-001
STATUS = APPROVED
```

Until then, `C2D-FLANGE-HUB` remains `BLOCKED`.

## Frozen stress extraction and code assessment

### Path and probe conventions

All stress paths shall be defined in geometry-normalized coordinates. A path must remain fixed when the mesh changes; the nearest node is not an acceptable path definition. For a circular path, the record stores center, radius, angular origin, direction, and sample angles. For a wall SCL, it stores inner-surface anchor, outer-surface anchor, local normal, and station order.

Qualification uses unaveraged element stress. Nodal averaging may hide interelement stress jumps and mesh inadequacy, so averaged contours are retained only as visualization products.

### SCL calculation

For a through-wall coordinate `s`, with `s = 0` at the wall mid-surface and total thickness `t`, each tensor component is linearized independently:

```text
σm = (1/t) ∫[-t/2,t/2] σ(s) ds
σb± = ±(6/t^2) ∫[-t/2,t/2] s σ(s) ds
σpeak(s) = σ(s) - σm - σb(s)
```

The frozen script shall calculate membrane and bending from the tensor components, then calculate stress intensity, von Mises stress, principal stresses, or other code measure from the linearized tensors. It shall not average or linearize an already derived scalar stress.

A qualifying SCL shall:

- span the complete material thickness;
- be approximately normal to the local wall mid-surface;
- avoid crossing voids or unrelated material regions;
- have a documented pressure-treatment convention;
- avoid known point-load, fixed-corner, zero-radius, and tie-end singularities;
- demonstrate membrane and bending convergence;
- satisfy section-resultant equilibrium within 1%.

### Singularities and finite radii

A stress that increases without bound under mesh refinement does not pass merely because displacement and reaction have converged. The record shall classify each hotspot as one of:

```text
FINITE_GEOMETRIC_CONCENTRATION
INTERFACE_DISCONTINUITY
LOAD_OR_CONSTRAINT_SINGULARITY
REENTRANT_CORNER_SINGULARITY
UNKNOWN_REQUIRES_REVIEW
```

For a singular point, the OUT record may report distance-based stresses, section resultants, structural stress, or a code-approved extrapolation, but it may not publish the maximum nodal or integration-point stress as a converged material stress.

### Code-assessment release

A code assessment is releasable only when the OUT record contains:

| Required code field | Example |
|---|---|
| Code and edition | ASME VIII-2, 2025 |
| Assessment paragraph map | Project-controlled Part 5 map |
| Material allowable source | Section II-D table and temperature |
| Load combination | Pressure, bolt load, external load, thermal load as applicable |
| Stress category | General membrane, local membrane, bending, secondary, peak, or project equivalent |
| SCL identity | Geometry-anchored path ID |
| Stress convention | Component order and Tresca/von Mises choice |
| Pressure correction | Included, removed, or separately handled |
| Acceptance equation | Exact project-approved formula |
| Reviewer | Named independent checker |
| Script identity | Version and checksum |

The benchmark qualifies the computation of stresses and section quantities. It does not grant design approval to a component whose loads, materials, fabrication details, fatigue cycles, weld class, or code jurisdiction have not been established.

## Qualification matrix and release criteria

| Module | MESH qualification evidence | CORE qualification evidence | OUT qualification evidence | Release state |
|---|---|---|---|---|
| `C2D-LUG-PINHOLE` | Annular O-grid, exact hole, positive Jacobian, fixed angular topology | Reaction, energy, displacement, Kirsch companion, bearing-case convergence | Frozen hole traces, radial paths, ligament linearization, approved structural code map if used | Executable |
| `C2D-BRACKET-GUSSET` | Fillet, load-edge, and support-edge refinement | Deflection and reactions against beam/plate and independent continuum references | Fillet paths, reaction density, arm/support section linearization | Executable |
| `C2D-CLAMP-EAR` | Hole conformity, fixed pressure-arc endpoints, support-region topology | Open-hole analytical case, bearing response, reaction split | Radial/circumferential paths and reaction split; explicit no-contact metadata | Executable |
| `C2D-FLANGE-HUB` | Axisymmetric meridional Q8, interfaces, through-wall refinement | Lamé pressure reference, bolt resultant, linear superposition | Hub-shell and bolt-region through-wall SCLs | **Blocked** |
| `C2D-NOZZLE-REPAD-SECTION` | Multi-region plane-strain mesh, bonded interfaces, edge radii | Pressure plus membrane/bending section response and interface equilibrium | Vessel, nozzle, and repad SCL paths | Executable with extruded-section caveat |
| `C2D-PIPE-PAD-SECTION` | Plane-strain pipe/pad interface and finite-radius edge refinement | Plane-strain Lamé pressure case plus distributed line-load response | Interface equilibrium and toe/root paths | Executable with long-section caveat |

Bucket B is qualified only when all of the following conditions are satisfied:

| Gate | Required result |
|---|---|
| Formulation declarations | Explicit and correct for all six modules |
| Planar module execution | All five non-flange records pass MESH, CORE, and OUT gates |
| Axisymmetric registration | `AXI-Q8-REG-001` independently approved |
| Flange execution | `C2D-FLANGE-HUB` passes only after registration |
| Configuration control | Geometry, mesh, solver, material, and postprocessor hashes retained |
| Numerical uncertainty | M0/M1/M2 convergence evidence accepted for every critical response |
| Equilibrium and energy | Common balance limits satisfied |
| Singularity treatment | Every hotspot classified; no singular maximum accepted as converged stress |
| Code mapping | Code edition and assessment procedure frozen before pass/fail publication |
| Independent review | Review signatures on formulation, mesh, reference calculations, and OUT script |

The final release status shall use one of three values:

```text
QUALIFIED
QUALIFIED_WITH_SCOPE_LIMITATIONS
NOT_QUALIFIED
```

At issue, the correct Bucket B status is:

```text
BUCKET_B_STATUS = NOT_QUALIFIED
REASON = AXISYMMETRIC_FORMULATION_NOT_YET_REGISTERED
PLANAR_RECORDS = READY_FOR_CONTROLLED_EXECUTION
FLANGE_RECORD = BLOCKED
```

This status directly enforces the qualification condition: `C2D-FLANGE-HUB` cannot proceed on the basis of a generic two-dimensional template, and the other five records cannot proceed without their explicit plane-stress or plane-strain declarations and associated scope limitations.

## Research references

1. [ASME V&V 10 — Standard for Verification and Validation in Computational Solid Mechanics](https://www.asme.org/codes-standards/find-codes-standards/standard-for-verification-and-validation-in-computational-solid-mechanics)
2. [NASA-STD-7009B — Standard for Models and Simulations](https://standards.nasa.gov/sites/default/files/standards/NASA/B/1/NASA-STD-7009B-Final-3-5-2024.pdf)
3. [ASME BPVC Section VIII, Division 2 — 2025 Edition](https://www.asme.org/codes-standards/find-codes-standards/bpvc-viii-2-bpvc-section-viii-rules-construction-pressure-vessels-division-2-alternative-rules-%281%29)
4. [ASME 2025 BPVC editions](https://www.asme.org/codes-standards/bpvc-standards/bpvc-2025)
5. [Abaqus documentation — continuum elements](https://docs.software.vt.edu/abaqusv2024/English/SIMACAEGSARefMap/simagsa-c-elmcontinelem.htm)
6. [Abaqus documentation — choosing element dimensionality](https://docs.software.vt.edu/abaqusv2024/English/SIMACAEELMRefMap/simaelm-c-dimension.htm)
7. [Abaqus benchmark — pressurization of a thick-walled cylinder](https://docs.software.vt.edu/abaqusv2024/English/?show=SIMACAEBMKRefMap%2Fsimabmk-c-prcyl.htm)
8. [Ansys documentation — two-dimensional analyses](https://ansyshelp.ansys.com/public/views/secured/corp/v251/en/wb_sim/ds_2d_simulations.html)
9. [Ansys documentation — PLANE183](https://ansyshelp.ansys.com/public/Views/Secured/corp/v252/en/ans_elem/Hlp_E_PLANE183.html)
10. [NAFEMS — procedural benchmarks for finite-element modelling](https://www.nafems.org/downloads/FENet_Meetings/Barcelona_Spain_Feb_2003/FENET_Barcelona_Feb2003_DLE_Wood.pdf)
11. [NAFEMS — Finite Element Analysis for Engineers: A Primer](https://www.nafems.org/publications/resource_center/r0110/)
12. [Altair verification — plane-strain pressure-vessel analysis](https://help.altair.com/hwsolvers/os/topics/solvers/os/analysis_of_pressure_vessel_problem_r.htm)
