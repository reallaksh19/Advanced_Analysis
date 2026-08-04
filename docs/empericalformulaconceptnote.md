# Empirical Piping Load Calculation Concept Note

**Repository:** `reallaksh19/Advanced_Analysis`  
**Document purpose:** production calculation basis, validation status, limitations and development roadmap  
**Document date:** 4 August 2026  
**Current production method:** `CHAINAGE_TRIBUTARY_SPAN_V2`  
**Primary implementation:** `src/workspace/engineering-loads/support-load-distribution-v3.js`  
**Filename note:** the requested filename spelling, `empericalformulaconceptnote.md`, is retained intentionally.

---

## 1. Executive summary

The current empirical calculation is a **governed gravity-load screening method** for estimating vertical piping support reactions from source-backed piping geometry, pipe properties, fluid densities, insulation data, component masses, route chainage and qualified vertical support locations.

The production calculation:

1. resolves pipe metal, insulation, fluid and component mass;
2. converts mass to gravity force using approved gravity and load-factor inputs;
3. places distributed and concentrated loads on a one-dimensional route-chainage basis;
4. distributes each load to the two bracketing qualified vertical supports using static equilibrium;
5. accumulates support reactions;
6. verifies force and moment equilibrium;
7. fails closed when any required input, support qualification, route attachment, bracketing condition or equilibrium check is incomplete.

The method is suitable for **first-pass gravity reaction estimation and load-screening** where the route can be represented as supported one-dimensional chainage segments and where support stiffness, nonlinear restraint behavior and structural interaction are outside the required decision.

It is **not** a piping flexibility analysis, beam analysis, frame analysis, contact analysis or continuum FEA. It does not presently calculate thermal reactions, friction reactions, gap closure, guide/line-stop reactions, support liftoff redistribution, support-group structural distribution, code stress or nozzle loads.

---

## 2. Authority and engineering boundary

### 2.1 Production authority

The numerical method is implemented by:

```text
calculateSupportLoadDistribution()
  schema: support-load-distribution/v3
  method: CHAINAGE_TRIBUTARY_SPAN_V2
```

The authorized production route is:

```text
approved source/master data
  -> authorized empirical input
  -> authorized runtime package
  -> current project/dataset/hash validation
  -> calculateSupportLoadDistribution()
  -> immutable authorized execution receipt
  -> SupportLoadPresenter
  -> 2D/3D/right-panel presentation
```

The ordinary production UI is permitted to calculate only from a current, calculation-eligible authorized package. Stale historical results may remain available for audit, but they are not presented as current engineering results.

### 2.2 Fail-closed rule

A load case is `CALCULATED` only when all required contributions are qualified and the equilibrium check passes. If any required contribution is excluded or any blocker is raised:

- the load case is `BLOCKED`;
- final support `verticalForceN` values are `null`;
- any qualified partial values remain audit-only as `qualifiedReactionCandidateN`;
- the partial values must not be represented as calculated reactions.

### 2.3 Explicit exclusions

The current empirical engine does not claim authority for:

- elastic piping flexibility;
- beam/frame stiffness distribution;
- thermal expansion force;
- imposed displacement force;
- guide, line-stop or anchor reaction caused by displacement;
- Coulomb friction;
- support gaps or line-stop gaps;
- one-way contact, liftoff or nonlinear support-state changes;
- support steel flexibility or civil-foundation distribution;
- eccentric support-frame member forces;
- dynamic, slug, surge, wind, seismic, relief, vibration, FIV or AIV loads;
- nozzle-load qualification;
- ASME code stress, SIF or flexibility factors;
- LFEA, LAFEA or continuum FEA substitution.

Any future extension into these areas requires a separately versioned method, explicit authority data and independent benchmarks.

---

## 3. Required governed inputs

The calculation depends on current, approved evidence for the following groups.

### 3.1 Dataset and topology

- immutable normalized dataset identity and source SHA-256;
- canonical piping entities and source identity;
- route-partition model and route chainages;
- support-site model and exact support-site identity;
- port-match tolerance;
- support-type capability map, including whether a source support type provides vertical support.

### 3.2 Pipe and load data

- outside diameter;
- wall thickness;
- material code and material density;
- insulation code, insulation thickness and insulation density;
- operating-fluid density by line;
- hydrotest-fluid density by line;
- component mass by governed catalogue key or exact source entity identity;
- gravity acceleration;
- load factor;
- active load cases;
- force and moment equilibrium tolerances.

### 3.3 Identity and freshness

The runtime package binds, at minimum:

- project identity;
- dataset identity and version;
- source dataset hash;
- shared-model hash;
- support-site-model hash;
- route-partition-model hash;
- Project Data profile hash;
- master-source hashes;
- authorized input hash;
- overlay hash;
- execution ID and canonical timestamps.

A mismatch or stale binding blocks execution rather than silently recalculating against different data.

---

## 4. Calculation concepts and equations

All geometry dimensions used in area equations are converted from millimetres to metres through the implemented factors. Forces are reported in newtons. Route positions and moments are retained in millimetres and newton-millimetres.

### 4.1 Pipe inside diameter

For outside diameter `D_o` and wall thickness `t`:

```text
D_i = D_o - 2t
```

Acceptance requirements:

```text
D_o > 0
t > 0
D_i > 0
```

Failure to satisfy these conditions blocks the contribution with an invalid-section or invalid-inside-diameter exclusion.

### 4.2 Pipe metal mass

The metal cross-sectional area is:

```text
A_m = π/4 × (D_o² - D_i²)
```

For length `L` and material density `ρ_m`:

```text
m_m = A_m × L × ρ_m
```

Implementation form, with diameters in millimetres:

```text
A_m [m²] = π × (D_o² - D_i²) / 4,000,000
```

**Concept:** the pipe is represented as a uniform straight annulus over the source-backed edge length.

**Basis:** elementary volume and density calculation.

**Current limitations:** corrosion allowance, mill tolerance, lining, cladding and local fitting geometry are not independently added unless already represented through the governed section or component-mass data.

### 4.3 Internal fluid mass

The internal flow area is:

```text
A_i = π/4 × D_i²
```

For fluid density `ρ_f`:

```text
m_f = A_i × L × ρ_f
```

Load-case selection is:

| Load case | Fluid contribution |
|---|---|
| `EMPTY` | `0` |
| `OPE` | approved operating-fluid density for the exact line |
| `HYD` | approved hydrotest-fluid density for the exact line |

The authorized production use is based on the named `EMPTY`, `OPE` and `HYD` cases. Additional case IDs should not be introduced without an explicit case-to-density authority because the current low-level resolver treats a non-`EMPTY`, non-`OPE` case as hydro-density based.

### 4.4 Insulation mass

For insulation thickness `t_i`:

```text
D_ins = D_o + 2t_i
A_ins = π/4 × (D_ins² - D_o²)
m_ins = A_ins × L × ρ_ins
```

Rules:

- `t_i = 0` gives zero insulation mass;
- positive thickness requires a positive approved insulation density;
- missing thickness, code or density blocks the contribution.

**Concept:** uniform full-circumference insulation over the pipe length.

**Current limitations:** cladding, tracing, partial insulation, removable boxes and local insulation discontinuities are not separately modelled unless incorporated into governed mass data.

### 4.5 Total pipe mass by load case

```text
m_pipe = m_m + m_ins + m_f
```

Therefore:

```text
EMPTY: m_pipe = m_m + m_ins
OPE:   m_pipe = m_m + m_ins + m_operating fluid
HYD:   m_pipe = m_m + m_ins + m_hydro fluid
```

The contribution ledger retains the separate metal, insulation and fluid mass terms, supporting review and recalculation.

### 4.6 Concentrated component mass

Non-pipe entities obtain mass from the governed component-weight map.

Lookup order:

```text
1. exact CATALOG_KEY from source attributes;
2. exact sourceEntityId fallback.
```

The engine does not select a nearest, partial, substring or first matching catalogue row.

```text
m_component = approved catalogue mass
```

**Concept:** valves, flanges and other non-pipe items are represented as point masses at the entity chainage.

**Current limitations:** the point is presently the entity chainage supplied by the route model. Separate centre-of-gravity offsets and eccentric moments are not yet included.

### 4.7 Mass-to-force conversion

For qualified mass `m`, approved gravity `g` and approved load factor `LF`:

```text
P = m × g × LF
```

The source-axis convention is:

```text
source axis: Z-up
reported vertical reaction: positive when opposing gravity
```

No absolute-value conversion or sign correction is applied downstream for presentation.

### 4.8 Support qualification

A support site is eligible for vertical reaction only when:

1. an assembly member has a source type declared as vertically capable in the approved support-capability map;
2. the support position projects onto a physical route edge within the approved port-match tolerance;
3. a finite route chainage is obtained.

Each route requires at least two qualified vertical supports. Fewer than two raises:

```text
ROUTE_REQUIRES_TWO_QUALIFIED_VERTICAL_SUPPORTS
```

### 4.9 Point-load reaction distribution

For a point force `P` at chainage `x`, bracketed by supports at `x_1` and `x_2`:

```text
R_1 = P × (x_2 - x) / (x_2 - x_1)
R_2 = P × (x - x_1) / (x_2 - x_1)
```

This satisfies:

```text
R_1 + R_2 = P
R_1 x_1 + R_2 x_2 = Px
```

If the point lies exactly at a support chainage, the full force is assigned to that support.

If no lower and upper qualified support bracket the point, the contribution is blocked as:

```text
UNBRACKETED_ROUTE_LOAD
```

**Concept:** statically determinate two-support distribution on a one-dimensional chainage line.

### 4.10 Uniform pipe-load distribution

Each pipe force is treated as uniformly distributed along its chainage interval.

The interval is cut at every internal qualified support chainage. Each resulting uniform segment is replaced by its statically equivalent point force at the segment midpoint. That point force is then distributed to its two bracketing supports using the point-load equations above.

For a segment from `a` to `b` carrying total force `P_s`:

```text
x_c = (a + b) / 2
P_s = P_total × (b - a) / (full pipe chainage length)
```

The segment contribution is then distributed at `x_c`.

**Concept:** piecewise exact resultant replacement for a constant line load, with reaction allocation governed by adjacent support chainages.

**Current limitations:** the method does not solve continuous-beam stiffness compatibility. Intermediate supports divide load by tributary statics, not by elastic support/pipe stiffness.

### 4.11 Reaction accumulation

Each allocation is accumulated by exact `supportSiteId`:

```text
R_site = Σ allocation to that site
```

The contribution ledger records:

- load case;
- route ID;
- entity ID and source identity;
- mass and force;
- application chainage;
- formula breakdown;
- source references;
- allocation to each support.

### 4.12 Equilibrium verification

For each load case:

```text
force residual = ΣR - ΣP
moment residual = Σ(Rx) - Σ(Px)
```

The residuals are checked against approved tolerances:

```text
|force residual|  ≤ force tolerance
|moment residual| ≤ moment tolerance
```

Failure raises:

```text
EQUILIBRIUM_CHECK_FAILED
```

Missing or invalid tolerance authority raises:

```text
MISSING_EQUILIBRIUM_TOLERANCE
```

---

## 5. Calculation completeness and blocker model

The production cutover includes explicit fail-closed evidence for the following conditions:

1. missing pipe section;
2. missing material density;
3. missing operating-fluid density;
4. missing hydro-fluid density;
5. missing insulation density;
6. missing component mass;
7. invalid inside diameter;
8. fewer than two qualified vertical supports;
9. unbracketed point load;
10. missing or invalid route chainage;
11. failed equilibrium;
12. non-finite authorized numerical value;
13. wrong project binding;
14. stale/tampered baseline continuity;
15. projection-payload mismatch or tamper;
16. handoff mismatch or tamper.

The first eleven are mechanical/completeness blockers. The remaining blockers protect authorization, identity and freshness.

---

## 6. Benchmarks and validation completed

### 6.1 Closed-form symmetric gravity fixture

A complete analytical fixture covers `EMPTY`, `OPE` and `HYD` on a symmetric two-support route. The authorized and legacy numerical projections were required to match exactly.

Recorded support reactions were:

| Load case | Support 1 | Support 2 |
|---|---:|---:|
| `EMPTY` | `108.54227332218605 N` | `108.54227332218605 N` |
| `OPE` | `133.5056827068759 N` | `133.5056827068759 N` |
| `HYD` | `139.74653505304835 N` | `139.74653505304835 N` |

For all three cases:

```text
force residual = 0
moment residual = 0
unexplained authorized/legacy numerical delta = 0
```

This validates the implemented arithmetic, load-case mass selection, symmetric reaction distribution, deterministic execution and non-mutation for the fixture.

### 6.2 Authorized-versus-legacy parity

Before ordinary UI access was cut over to the authorized route, the same complete fixture was executed through both low-level paths. The numerical support-reaction projection was identical.

The remaining low-level legacy seams are retained only for migration/parity checks and are not ordinary production callers.

### 6.3 Anti-drift and tamper validation

The authorized input, runtime package and execution receipt are semantic-hash protected. Tests cover:

- deterministic repeated execution;
- hash mismatch rejection;
- project mismatch rejection;
- stale baseline rejection;
- overlay/projection/handoff tamper rejection;
- source and dataset non-mutation;
- current-versus-stale presentation behavior.

### 6.4 Production caller validation

The cutover inventory established:

```text
ordinary legacy calculate callers:       0
ordinary authorized bypass callers:      0
configured authorized execution callers: 1
unknown production callers:              0
```

### 6.5 Presentation integration validation

The WebGL support-load presentation fixture performs a genuine authorized empirical execution and then presents the result through `SupportLoadPresenter`.

Recorded fixture result:

```text
support-site ID:  support-site:1000|0|0
primary entity:   SUP-A1
result kind:      EMPIRICAL_SUPPORT_REACTION
vertical force:   84.45568270687588 N
displayed label:  Vertical=0.084kN
```

The browser checks exact identity, one callout per physical support, camera reprojection, off-screen hiding, zone filtering, stale suppression, one-canvas ownership and teardown.

### 6.6 Contract and property validation

Repository checks cover:

- load-case and primitive contract evolution;
- distributed gravity, point gravity and explicit-moment primitive projection;
- readiness and blocker propagation;
- stale and wrong-dataset rejection;
- immutability and deterministic semantic hashes;
- workspace consumer availability;
- support-load calculation and presentation contracts.

### 6.7 Build and syntax validation

The production bundle, strict syntax checks and focused empirical/presentation suites have passed on qualified exact heads. General current-main regressions outside the empirical engine must remain separately disclosed; a green focused calculation test must not be used to conceal an unrelated repository failure.

---

## 7. Accuracy statement

### 7.1 What has been demonstrated

For the closed-form fixtures used:

- the implemented mass equations reproduce their expected values;
- two-support static allocation satisfies force and moment equilibrium to floating-point precision;
- repeated execution is deterministic;
- authorized and retained legacy numerical projections have zero unexplained difference;
- presentation does not alter the calculated force.

This is evidence of **formula implementation accuracy** for the tested configurations.

### 7.2 What has not yet been demonstrated

No general percentage accuracy is presently claimed against:

- CAESAR II or another piping flexibility program across a broad real-project sample;
- measured field support loads;
- an elastic continuous-beam model;
- nonlinear support/contact behavior;
- civil/support-frame flexibility.

Therefore the current physical-model accuracy should be described as:

```text
SCREENING-LEVEL, METHOD-BOUNDED, PROJECT-INPUT-DEPENDENT
```

It should not be advertised as “within ±X%” for arbitrary piping systems until a governed correlation campaign establishes that number for defined applicability classes.

### 7.3 Main uncertainty sources

The dominant uncertainty is expected to come from:

1. pipe dimensions and material density;
2. actual operating/hydro fluid density;
3. insulation thickness and density;
4. component catalogue masses;
5. component centre-of-gravity location;
6. support position and vertical-capability classification;
7. route chainage and attachment accuracy;
8. the difference between tributary statics and real elastic stiffness distribution;
9. unmodelled gaps, friction, liftoff and thermal displacement.

### 7.4 Appropriate engineering use

Appropriate uses include:

- preliminary civil/support load input;
- support-load completeness review;
- route and support screening;
- comparison of `EMPTY`, `OPE` and `HYD` gravity envelopes;
- identification of missing engineering data;
- early-stage check before detailed flexibility/FEA.

A detailed stress/flexibility or local structural analysis remains required when stiffness, displacement, nonlinear restraint behavior, code compliance or local support stresses govern.

---

## 8. Validation still pending

The following validation should be completed before extending the method’s claimed applicability.

### 8.1 Expanded analytical benchmark catalogue

Required cases:

- unequal support spacing;
- multiple internal supports;
- load exactly at a support;
- concentrated load between unequal spans;
- multiple coincident contributions;
- mixed pipe and component loads;
- support close to route tolerance boundary;
- route reversal and deterministic ordering;
- vertical, horizontal and mixed-coordinate routes on the same chainage basis;
- blocked end overhang and intentionally bracketed end load;
- sensitivity to equilibrium tolerances.

### 8.2 Independent hand calculations

Each benchmark should retain:

- input drawing or geometric definition;
- equations and intermediate calculations;
- independent expected reactions;
- force and moment balance;
- source-data citations;
- review sign-off and revision.

### 8.3 Gravity-only flexibility-program correlation

A controlled comparison should be run against a piping program using:

- identical geometry and support coordinates;
- rigid vertical supports only;
- no friction, gaps, springs, thermal, pressure thrust or nonlinear effects;
- identical masses and gravity;
- clearly separated determinate and indeterminate cases.

The purpose is to quantify where tributary statics agrees with or diverges from elastic stiffness distribution.

### 8.4 Real-project correlation

At least three project classes should be assessed:

1. simple rack or sleeper-supported straight lines;
2. routed lines with multiple fittings and equipment weights;
3. systems with support gaps, guides or potential liftoff, used to establish the current method’s exclusion boundary.

### 8.5 Uncertainty and sensitivity

Future reports should show reaction sensitivity to:

- density variation;
- component-weight tolerance;
- support-location tolerance;
- insulation uncertainty;
- CoG offset;
- support classification.

---

## 9. Future improvements and production roadmap

### Phase EMP-PROD-01 — Authorized production cutover and presentation

**Status:** completed.

Delivered:

- authorized runtime package and immutable execution receipt;
- current/stale state machine;
- fail-closed production UI route;
- numerical parity and blocker matrix;
- qualified 2D/right-panel presentation;
- qualified WebGL support-reaction callouts.

### Phase EMP-PROD-02 — Formula register and benchmark catalogue

**Status:** next production-hardening phase.

Objectives:

- create a machine-readable formula/method register;
- bind each equation to input authority, units, applicability and blocker codes;
- add an independently reviewable analytical benchmark catalogue;
- register exact-head benchmark checks;
- publish a coverage matrix showing done, partial and pending validation;
- make no change to `CHAINAGE_TRIBUTARY_SPAN_V2` numerical output.

Exit criterion:

```text
all registered formula terms have an oracle, authority source, unit contract,
positive and negative benchmark, and deterministic evidence hash
```

### Phase EMP-PROD-03 — Component centre of gravity and explicit moment

Objectives:

- add source-backed component CoG chainage and offset authority;
- calculate point load at the actual CoG rather than nominal entity midpoint;
- represent eccentric gravity moment explicitly;
- define whether moments are transferred to adjacent supports or reported as a separate support/civil demand;
- version the method rather than silently changing V2 results.

Required validation:

- eccentric point-load hand calculations;
- equal and unequal support spans;
- sign and axis conventions;
- zero-offset parity with the current method;
- source non-mutation and deterministic identity.

### Phase EMP-PROD-04 — Support assemblies and civil reaction envelope

Objectives:

- separate piping support-site reaction from structural distribution within an eccentric support assembly;
- support group/baseplate or multi-leg distribution only where structural geometry and stiffness authority are available;
- retain the current site reaction unchanged as the upstream piping demand;
- provide `EMPTY`, `OPE` and `HYD` civil reaction envelopes and governing-case trace.

This phase must not approximate support-steel member forces without an explicit structural model and benchmark.

### Phase EMP-PROD-05 — Imposed and thermal displacement screening

Objectives:

- introduce a separately governed screening method for displacement-driven force;
- require explicit axial/lateral stiffness authority, restraint direction, temperature/displacement source and active length;
- distinguish free thermal movement from restrained movement;
- prevent double counting with LFEA/flexibility results;
- provide screening status, not code compliance.

Potential elementary axial screening relation, where applicability is proven:

```text
F = k × Δ
k = EA/L
```

This relation must not be applied to routed systems, bends, branches or multi-restraint systems without a qualified reduced-stiffness model.

### Phase EMP-PROD-06 — Gaps, line stops, guides and one-way support state

Objectives:

- model open/closed gap state from imposed movement;
- distinguish guide, stop, rest, hold-down and one-way contact capability;
- represent unresolved state as blocked, not as zero reaction;
- add explicit liftoff detection and prevent compressive/tensile reaction misuse;
- define bounded iteration or state enumeration for small screening systems.

This is nonlinear behavior and requires a separately versioned execution method and convergence evidence.

### Phase EMP-PROD-07 — Coulomb friction screening

Objectives:

- calculate bounded friction demand `|T| ≤ μN`;
- use solved normal reaction and relative movement direction;
- distinguish stick, slip and unresolved states;
- solve coupled friction supports simultaneously or with a proven convergent outer iteration;
- retain iteration count, residual and state history.

Friction must not be represented by a fixed percentage force without movement and normal-load authority.

### Phase EMP-PROD-08 — Correlation, uncertainty and applicability classes

Objectives:

- compare against independent hand calculations and controlled flexibility models;
- establish applicability classes such as determinate sleeper/rack lines, simple multi-support routes and excluded nonlinear systems;
- quantify accuracy or bias only for each qualified class;
- publish uncertainty bands and sensitivity;
- define when detailed LFEA/FEA is mandatory.

### Phase EMP-PROD-09 — Reporting and governed project deliverables

Objectives:

- formula trace and input-source schedule;
- support reaction table with case envelope;
- blocked/missing-data register;
- calculation completeness statement;
- benchmark and method revision references;
- civil-load export with exact site identity;
- immutable calculation package and audit receipt;
- clear label separating empirical screening from LFEA/FEA.

---

## 10. Recommended production sequence

```text
EMP-PROD-02 formula register and benchmark catalogue
  -> EMP-PROD-03 CoG and explicit moments
  -> EMP-PROD-04 support/civil reaction envelope
  -> EMP-PROD-05 displacement screening
  -> EMP-PROD-06 gaps, guides, stops and liftoff
  -> EMP-PROD-07 friction
  -> EMP-PROD-08 correlation and quantified applicability
  -> EMP-PROD-09 governed reporting/export
```

Parallel work is permitted only where file ownership and authority boundaries do not overlap. Nonlinear phases must not modify the qualified gravity method in place.

---

## 11. Minimum acceptance rules for every future phase

Each production phase must provide:

1. an explicit engineering concept and applicability statement;
2. units, axes and sign conventions;
3. source/Project Data authority for every input;
4. fail-closed blocker codes;
5. independent positive benchmarks;
6. negative/tamper/stale cases;
7. force and moment equilibrium where applicable;
8. deterministic semantic hashes;
9. source non-mutation evidence;
10. exact production caller inventory;
11. browser/UI validation when results are presented;
12. a statement of accuracy demonstrated and accuracy not demonstrated;
13. rollback and method-version strategy;
14. no claim that empirical screening replaces detailed LFEA/FEA.

---

## 12. Final disposition

The present gravity method is a controlled, auditable and deterministic empirical screening calculation with strong formula-level and execution-authority validation for its tested cases. Its static reaction allocation is exact for the implemented one-dimensional determinate assumptions. Its general physical accuracy for arbitrary piping systems has not yet been quantified and must not be overstated.

The immediate production priority is to formalize the method and benchmark catalogue before adding new mechanics. CoG, displacement, gaps, liftoff and friction should then be introduced as separately versioned, independently benchmarked phases with explicit nonlinear and FEA boundaries.
