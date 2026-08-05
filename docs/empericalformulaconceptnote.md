# Empirical Piping Load Calculation Concept Note

**Repository:** `reallaksh19/Advanced_Analysis`  
**Document purpose:** calculation basis, validation status, accuracy boundary and production roadmap  
**Current revision date:** 5 August 2026  
**Qualified gravity methods:** `CHAINAGE_TRIBUTARY_SPAN_V2`, `CHAINAGE_TRIBUTARY_SPAN_V3_COG`  
**Moment-demand policy:** `SEPARATE_SUPPORT_CIVIL_DEMAND_NOT_DISTRIBUTED`  
**Filename note:** the requested spelling `empericalformulaconceptnote.md` is retained intentionally.

---

## 1. Executive disposition

The empirical load subsystem is a governed, deterministic gravity-load screening calculation. It derives pipe, insulation, fluid and component weight from approved source/master data; positions each contribution on a one-dimensional route chainage; distributes it to qualified vertical support sites; verifies force and moment equilibrium; and publishes immutable authorization and calculation evidence.

The subsystem now supports two explicitly versioned vertical-reaction methods:

```text
CHAINAGE_TRIBUTARY_SPAN_V2
  component point load at governed route/entity midpoint

CHAINAGE_TRIBUTARY_SPAN_V3_COG
  component point load at qualified on-route component CoG chainage
```

V3 is not inferred automatically. It is selected only by a method-bound runtime package and explicit opt-in configured consumer. The ordinary production route remains V2 unless separately authorized.

Off-route CoG and source explicit point moments are not converted into fictitious vertical reactions. PROD-03 closes them through a separate immutable moment-demand ledger. That ledger records source moments and the gravity couple from an eccentric CoG, but assigns the downstream disposition:

```text
SEPARATE_SUPPORT_CIVIL_DEMAND_NOT_DISTRIBUTED
```

Structural distribution of that moment belongs to EMP-PROD-04 or a qualified structural/LFEA model.

The calculation remains screening-level. It is not a flexibility analysis, continuous-beam solution, contact solver, nonlinear support analysis, code-stress calculation or continuum FEA.

---

## 2. Production authority and data flow

### 2.1 Authorized V2 path

```text
approved source/master data
  -> authorized empirical input/v1
  -> authorized empirical runtime package/v1
  -> current project/dataset/hash validation
  -> authorized empirical execution/v1
  -> CHAINAGE_TRIBUTARY_SPAN_V2
  -> immutable support reaction result
  -> SupportLoadPresenter
```

### 2.2 Explicit method-bound path

```text
approved source/master data
  -> authorized empirical input/v1
  -> authorized empirical runtime package/v2 + method
  -> explicit configured-method consumer
  -> authorized empirical execution/v2
  -> V2 or V3, exactly as requested
  -> immutable method-bound result
```

The method field is hash-bound. Unknown, missing, altered or package-inconsistent methods reject. V1 and V2 authorization stores remain independent.

### 2.3 Fail-closed rule

A load case is `CALCULATED` only when every required contribution is qualified and the equilibrium check passes. When a required contribution, route, support, identity or authority is unresolved:

- case status is `BLOCKED`;
- final `verticalForceN` values are `null`;
- qualified partial values remain audit-only;
- stale or partial results are not represented as current calculated reactions.

---

## 3. Governed inputs

### 3.1 Geometry and topology

- immutable normalized dataset identity and SHA-256;
- canonical source entity identity;
- route-partition model and route chainages;
- support-site model and exact support-site identity;
- port-match tolerance;
- support-type vertical-capability map;
- component CoG source evidence and units where V3/moment capture is used.

### 3.2 Pipe and load data

- outside diameter and wall thickness;
- material density;
- insulation thickness and density;
- operating and hydrotest fluid density;
- component catalogue mass or exact source-entity mass;
- gravity acceleration;
- load factor;
- active `EMPTY`, `OPE`, `HYD` cases;
- force and moment equilibrium tolerances.

### 3.3 Identity and freshness

Runtime evidence binds:

- project ID;
- dataset ID/version/source hash;
- shared-model hash;
- support-site and route-model hashes;
- Project Data profile hash;
- master-source hashes;
- authorized input and overlay hashes;
- execution identity and canonical timestamps;
- explicit numerical method for runtime package V2.

Any mismatch blocks execution.

---

## 4. Calculation concepts and formula basis

All section dimensions are converted from millimetres to metres for mass calculations. Forces are in newtons. Chainages are in millimetres. Point moments are retained in newton-metres in the separate moment ledger and in newton-millimetres where used by route equilibrium.

### 4.1 Pipe inside diameter

```text
D_i = D_o - 2t
```

Required:

```text
D_o > 0
t > 0
D_i > 0
```

Invalid geometry blocks the contribution.

### 4.2 Pipe metal mass

```text
A_m = pi/4 * (D_o^2 - D_i^2)
m_m = A_m * L * rho_m
```

Implemented millimetre-area conversion:

```text
A_m [m2] = pi * (D_o^2 - D_i^2) / 4,000,000
```

**Concept:** uniform annular pipe over the source-backed edge length.  
**Basis:** volume multiplied by approved density.  
**Not independently included:** corrosion allowance, lining, cladding or local fitting geometry unless represented in the governed source data.

### 4.3 Internal fluid mass

```text
A_i = pi/4 * D_i^2
m_f = A_i * L * rho_f
```

Case selection:

| Case | Fluid term |
|---|---|
| `EMPTY` | zero |
| `OPE` | approved operating density for the exact line |
| `HYD` | approved hydrotest density for the exact line |

### 4.4 Insulation mass

```text
D_ins = D_o + 2t_ins
A_ins = pi/4 * (D_ins^2 - D_o^2)
m_ins = A_ins * L * rho_ins
```

Zero thickness gives zero insulation mass. Positive thickness requires approved positive insulation density.

### 4.5 Total pipe mass

```text
EMPTY: m_pipe = m_m + m_ins
OPE:   m_pipe = m_m + m_ins + m_operatingFluid
HYD:   m_pipe = m_m + m_ins + m_hydroFluid
```

The ledger retains the individual metal, insulation and fluid terms.

### 4.6 Component mass

Lookup authority is exact:

```text
1. exact source CATALOG_KEY
2. exact sourceEntityId fallback
```

```text
m_component = approved component mass
```

No nearest, partial or first-row catalogue match is permitted.

### 4.7 Mass-to-force conversion

```text
P = m * g * LF
```

Conventions:

```text
source axis: global Z-up
source gravity force: negative global Z
reported support reaction: positive upward/opposing gravity
```

### 4.8 V2 component application point

V2 applies a concentrated component force at the governed route/entity point chainage. This preserves the original qualified numerical method.

### 4.9 V3 component CoG application point

V3 consumes the component-load authority audit and uses the exact CoG chainage only when:

- component identity is exact;
- CoG coordinates and units are qualified;
- route membership is unique;
- projection is unambiguous;
- the CoG lies on the route within approved tolerance;
- no unsupported positive explicit point moment is present.

Zero-offset/on-route cases preserve V2 parity. Off-route or ambiguous CoG remains blocked in V3.

### 4.10 Point-load support distribution

For point force `P` at chainage `x`, bracketed by supports `x_1`, `x_2`:

```text
R_1 = P * (x_2 - x) / (x_2 - x_1)
R_2 = P * (x - x_1) / (x_2 - x_1)
```

This satisfies:

```text
R_1 + R_2 = P
R_1*x_1 + R_2*x_2 = P*x
```

An exact support-chainage load is assigned wholly to that support. An unbracketed load blocks.

### 4.11 Uniform pipe-load distribution

A uniform pipe contribution is cut at internal active vertical support chainages. Each piece is replaced by its statically equivalent midpoint force, then distributed to its bracketing supports using the point-load relation.

This is exact for the resultant and first moment of each constant-load segment. It does not solve continuous-beam compatibility or stiffness-based redistribution.

### 4.12 Reaction accumulation and equilibrium

```text
R_site = sum(all allocations to supportSiteId)

force residual  = sum(R)    - sum(P)
moment residual = sum(R*x)  - sum(P*x)
```

Both residuals must fall within approved tolerances.

---

## 5. Component moment-demand concept

### 5.1 Source explicit moment

A qualified positive source point moment is retained with:

- exact entity/source identity;
- route and application chainage;
- source-declared axis;
- magnitude and original source evidence;
- deterministic semantic hash.

It is not distributed as a vertical-force pair because support spacing, structural attachment and moment-transfer capability are not yet governed.

### 5.2 Eccentric CoG gravity couple

For CoG position `r_CoG`, nearest unambiguous route projection `r_route`, and gravity force vector `W`:

```text
r = r_CoG - r_route
M = r cross W
W = {0, 0, -m*g*LF}
```

The ledger records:

- offset vector in millimetres;
- gravity force in newtons;
- global moment vector and magnitude in newton-metres;
- each active gravity load case;
- source mass, CoG, profile and authority hashes.

Zero eccentricity produces no moment demand. Off-route CoG may be captured as a separate couple only when the nearest route projection is unique and all mass/CoG authority is exact. It remains ineligible for V3 vertical-reaction calculation.

### 5.3 Downstream policy

```text
SEPARATE_SUPPORT_CIVIL_DEMAND_NOT_DISTRIBUTED
```

The ledger explicitly states:

```text
verticalReactionDistribution = NOT_PERFORMED
numericalVerticalReactionMethodChanged = false
```

EMP-PROD-04 must decide structural distribution using authorized support assembly geometry and stiffness or delegate it to LFEA/structural analysis.

---

## 6. Benchmarks completed

### 6.1 Symmetric V2 fixture

| Case | Support 1 | Support 2 |
|---|---:|---:|
| `EMPTY` | `108.54227332218605 N` | `108.54227332218605 N` |
| `OPE` | `133.5056827068759 N` | `133.5056827068759 N` |
| `HYD` | `139.74653505304835 N` | `139.74653505304835 N` |

For each case:

```text
force residual = 0
moment residual = 0
```

### 6.2 V3 CoG fixture

For a 10 kg component between supports at `0` and `1000 mm`:

```text
V2 midpoint at 500 mm:
  108.54227332218605 / 108.54227332218605 N

V3 CoG at 250 mm:
  133.06727332218605 / 84.01727332218604 N

force residual  = 0 N
moment residual = 0 N.mm
```

### 6.3 Configured execution lifecycle

Qualified exact-head execution demonstrated:

```text
configured state: AUTHORIZED_CURRENT
executed state:   EXECUTED_CURRENT
method:           CHAINAGE_TRIBUTARY_SPAN_V3_COG
stale state:      EXECUTED_STALE after binding change
V1 coexistence:   true
ordinary bootstrap exposure: false
```

### 6.4 Moment-demand fixtures

The PROD-03 closure benchmark covers:

- positive source explicit point moment;
- 25 mm eccentric CoG gravity couple;
- zero eccentricity and zero explicit moment;
- ambiguous route projection;
- missing component mass;
- stale authority binding;
- semantic-hash tamper;
- deterministic execution and source non-mutation.

For a 10 kg component with 25 mm transverse eccentricity and `g = 9.80665 m/s2`:

```text
W = 98.0665 N
|M| = 98.0665 * 0.025 = 2.4516625 N.m
```

The exact global vector sign follows `M = r cross W`.

### 6.5 Presentation validation

The authorized WebGL fixture retained:

```text
support-site: support-site:1000|0|0
entity:       SUP-A1
kind:         EMPIRICAL_SUPPORT_REACTION
force:        84.45568270687588 N
label:        Vertical=0.084kN
```

Presentation does not alter the engineering force or sign.

---

## 7. Accuracy and engineering use

### 7.1 Demonstrated

- formula arithmetic for registered closed-form fixtures;
- deterministic mass and force calculation;
- exact two-support statics within floating-point precision;
- force/moment equilibrium for qualified cases;
- V2 parity and controlled V3 CoG shift;
- exact eccentric gravity-couple vector for the benchmark;
- stale/tamper/non-mutation controls;
- presentation identity and value preservation.

### 7.2 Not demonstrated

No general percentage accuracy is claimed against:

- CAESAR II or another flexibility program over broad project classes;
- measured field support loads;
- elastic continuous-beam reaction distribution;
- nonlinear contact, gaps, lift-off or friction;
- support steel/baseplate/foundation distribution;
- full three-dimensional moment transfer.

Current accuracy classification:

```text
SCREENING-LEVEL, METHOD-BOUNDED, PROJECT-INPUT-DEPENDENT
```

### 7.3 Appropriate use

- preliminary gravity/civil support-load input;
- `EMPTY`, `OPE`, `HYD` comparison;
- missing-data and route/support completeness review;
- component CoG sensitivity where V3 authority is qualified;
- separate capture of eccentric/source moment demand;
- early screening before detailed flexibility or structural analysis.

Detailed analysis remains mandatory when stiffness, imposed displacement, thermal movement, nonlinear contact, friction, structural member forces, code stress or nozzle loads govern.

---

## 8. Validation still pending

- unequal support spans and multiple internal supports;
- exact-at-support and coincident point loads;
- mixed distributed/component loads;
- route reversal and coordinate-orientation invariance;
- controlled continuous-beam/flexibility correlation;
- real-project classes and measured-data correlation;
- uncertainty/sensitivity for mass, density, CoG and support position;
- structural distribution of separate moment demands;
- temperature-driven contact/lift-off redistribution.

No arbitrary `+/-X%` claim is permitted until the correlation programme establishes applicability-specific bounds.

---

## 9. Production roadmap

### EMP-PROD-01 — Authorized cutover and presentation

**Status:** completed.

Delivered authorization, current/stale lifecycle, fail-closed production route, 2D/right-panel/WebGL presentation and exact identity trace.

### EMP-PROD-02 — Formula register and benchmark catalogue

**Status:** completed.

Delivered machine-readable formula register, independent closed-form oracle, benchmark catalogue, deterministic hashes and aggregate exact-head checks without changing V2 output.

### EMP-PROD-03 — Component CoG and explicit moments

**Status:** completed.

Delivered:

- exact CoG/source evidence audit;
- on-route V3 application point;
- V2/V3 method-selecting receipt;
- method-bound runtime package V2;
- explicit configured V2/V3 execution with independent V1 state;
- fail-closed off-route/ambiguous CoG handling;
- separate source/eccentric moment-demand ledger;
- no silent vertical-reaction conversion;
- thermal-lift-off handoff plan.

### EMP-PROD-04 — Support assemblies and civil reaction envelope

**Status:** next production phase.

Required:

- preserve piping support-site reaction as upstream demand;
- define structural support assembly identity and geometry;
- distribute force/moment only with authorized structural stiffness or exact statics;
- produce `EMPTY`, `OPE`, `HYD` civil envelopes and governing-case trace;
- block unsupported support-steel member-force approximations.

### EMP-PROD-05 — Thermal/imposed displacement screening

Introduce governed temperature/displacement authority and bounded reaction-reserve screening. `F = k*Delta` is allowed only with qualified effective stiffness and applicability.

### EMP-PROD-06 — Gaps, rests, line stops, guides and lift-off

Implement the separately versioned `THERMAL_LIFTOFF_ACTIVE_SET_V1` concept defined in `docs/empirical-thermal-liftoff-plan.md`. It must redistribute after contact release and satisfy one-way-contact complementarity.

### EMP-PROD-07 — Coulomb friction screening

Use solved normal reactions and movement direction; retain stick/slip/unresolved state and convergence evidence.

### EMP-PROD-08 — Correlation and applicability classes

Correlate against hand calculations, controlled beam/flexibility models and project datasets; quantify accuracy only per qualified class.

### EMP-PROD-09 — Governed project reporting/export

Publish formula trace, reaction/moment envelope, blockers, completeness, benchmark references, civil export and immutable receipt.

---

## 10. Final position

PROD-03 completes the component load-location and moment-policy boundary without altering the qualified V2 gravity method. V3 moves only qualified on-route component point loads to their CoG chainage. Off-route eccentricity and source point moments are retained as explicit downstream demands, not invented reaction pairs.

The next production priority is EMP-PROD-04. Temperature-driven lift-off is planned as a separate active-set method under EMP-PROD-05/06 and must not be added by clamping negative reactions or applying an unqualified `kDelta` formula to arbitrary routed piping.
