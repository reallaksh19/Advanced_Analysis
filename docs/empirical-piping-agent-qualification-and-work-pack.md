# Agent Qualification Gate and Selected-Agent Work Pack

## Standalone Empirical Piping Beam, Contact, Action-Recovery, Sustained-Stress and Structural-Screening Program

**Mode:** `EMPIRICAL_PIPING_MECHANICS_SPECIALIST_5Q`  
**Qualification format:** five technical questions only  
**Repository:** `reallaksh19/Advanced_Analysis`  
**Core engineering specification:** `docs/empirical-piping-engineering-basis-and-benchmark.md`  
**Engineering document ID:** `EMP-PROD-05B-EBR-001`  
**Observed specification PR at prompt preparation:** PR `#696`  
**Observed specification head:** `3a6fe7356127251f834d1e8f2e0e11b781af9f79`  
**Method family:** `EMPIRICAL_BEAM_CONTACT_V1`  
**Future structural-screening family:** `EMPIRICAL_SUPPORT_FRAME_SCREEN_V1`  
**Authority status:** qualification and implementation authority withheld until the candidate passes Part A

---

# Part A — Technical Qualification Gate

## A1. Candidate role

You are qualifying as the principal engineering and implementation agent for a standalone empirical piping-mechanics method that calculates:

- pipe and component weight;
- sustained and operating displacement;
- support reactions;
- unilateral rest lift-off;
- axial force, shear, bending moment and torsion where qualified;
- ASME B31.3 sustained longitudinal stress;
- auditable benchmark evidence;
- future preliminary structural-support screening for cantilevers, T-posts and goalposts.

This role requires genuine competence in:

- piping flexibility and beam mechanics;
- ASME B31.3 Appendix S and Appendix D interpretation;
- unilateral contact and load-case decomposition;
- member action recovery;
- deterministic numerical software;
- engineering verification and benchmark design;
- strict separation between piping mechanics, code stress and structural steel screening.

A generalist software answer is insufficient.

---

## A2. Governing boundary

The method shall have **no numerical or runtime dependency on LFEA**.

It shall not consume:

- LFEA stiffness or flexibility matrices;
- LFEA displacement or rotation results;
- LFEA reactions;
- LFEA member actions or recovered stresses;
- LFEA mesh, element, solver or result contracts;
- any other solver-generated quantity as an ordinary runtime input.

The candidate may discuss an external solver only as an independent comparison tool. It may never be the source of truth for the empirical method.

Appendix S values are benchmark targets only. They may not be used as hidden calibration constants.

---

## A3. Response instructions

Answer all five questions in your first response, then stop.

For every question:

1. state the engineering source of truth;
2. distinguish `DIRECT_MECHANICS`, `CODE_FORMULA`, `DERIVED_RELATION`, `ADOPTED_EMPIRICAL`, `NUMERICAL_ALGORITHM`, `BENCHMARK_REFERENCE` and `ACCEPTANCE_RULE` where applicable;
3. write the governing formulas;
4. define units and sign conventions;
5. describe the runtime data flow;
6. identify failure modes and blocking conditions;
7. provide representative TypeScript or precise pseudocode;
8. define measurable acceptance criteria;
9. specify unit, integration, benchmark and anti-drift tests;
10. state what must never be mutated or imported.

For code-derived claims, cite the exact standard, edition, paragraph, table or note. Where you cannot verify an exact code citation, write `SOURCE_CITATION_UNRESOLVED`; do not fill the gap from memory.

Do not write repository code, create issues, propose a merge, dispatch other agents or claim production qualification during Part A.

Recommended answer limit: 18 pages. Technical density is preferred over narrative length.

---

## A4. Scoring and qualification

| Question | Marks |
|---|---:|
| Question 1 — Authority, section states and empirical member formulation | 20 |
| Question 2 — Unilateral contact, lift-off and load-case decomposition | 20 |
| Question 3 — Action recovery and Appendix S sustained-stress calculation | 20 |
| Question 4 — Elbow accuracy, convergence, benchmark policy and RCA | 20 |
| Question 5 — Production architecture, evidence and structural roadmap | 20 |
| **Total** | **100** |

Qualification requires:

- at least **90/100** overall;
- no question below **17/20**;
- no critical disqualifier.

### Critical disqualifiers

Any one of the following is an automatic fail:

- proposing LFEA or another solver result as a runtime input;
- calibrating ordinary runtime formulas against Appendix S output values;
- clipping an inadmissible support reaction to zero without complete recalculation;
- using one silent wall thickness for stiffness, weight and code stress;
- treating a near-zero reference percentage as the sole qualification metric;
- applying bend SIFs directly to stiffness without a declared flexibility rule;
- mixing pressure thrust, mechanical axial force and published table forces without a sign convention;
- claiming cantilever, T-post or goalpost code adequacy without a separate structural authority and benchmark;
- omitting force and moment equilibrium checks;
- silently converting missing engineering evidence to zero.

---

# Question 1 — Authority, Section States and Empirical Member Formulation

A 16 in carbon-steel piping system has:

```text
outside diameter, Do              = 0.406400 m
nominal wall, tn                  = 0.009525 m
corrosion allowance, c            = 0.0016002 m
elastic modulus, E                = 203.4 GPa
mass density, rho                 = 7,833.4 kg/m3
contents mass per length          = 117.841 kg/m
insulation mass per length        = 37.456 kg/m
gravity, g                        = 9.80665 m/s2
```

The proposed implementation needs separate section states for:

- mechanical stiffness;
- physical weight;
- B31.3 sustained-stress evaluation.

Design the section, member and load formulation.

Your answer shall include all of the following.

### 1.1 Section authority

Define, without silently equating them:

- nominal wall thickness;
- stiffness wall thickness;
- weight wall thickness;
- corroded code-stress wall thickness;
- any mill-tolerance-adjusted wall thickness if introduced later.

Explain which values are source data, which are project decisions and which are code-owned.

Derive:

\[
D_i=D_o-2t
\]

\[
A=\frac{\pi}{4}(D_o^2-D_i^2)
\]

\[
I=\frac{\pi}{64}(D_o^4-D_i^4)
\]

\[
J=2I
\]

\[
Z=\frac{2I}{D_o}
\]

State which thickness enters each expression for stiffness, weight and stress.

### 1.2 Weight formulation

Derive the pipe-wall mass and total line load:

\[
m_p=\rho A_w
\]

\[
w=g(m_p+m_f+m_i+m_d)
\]

Explain how the method shall represent:

- uniform pipe, contents and insulation weight;
- finite-length valves and meters;
- flange pairs;
- point masses with eccentric centres of gravity;
- unsupported or unknown component mass.

### 1.3 Straight-member formulation

Write the local planar beam coefficient structure using:

\[
EA/L,\quad 12EI/L^3,\quad 6EI/L^2,\quad 4EI/L,\quad 2EI/L
\]

Explain the transformation to global axes and the treatment of a uniform global gravity vector on an inclined member.

Write the consistent local equivalent nodal load for a uniform transverse load and explain the sign of:

\[
qL/2,\qquad \pm qL^2/12
\]

### 1.4 Thermal strain

Explain why:

\[
\epsilon_{th}=\alpha\Delta T
\]

and:

\[
N_{fully\ restrained}=EA\alpha\Delta T
\]

do not justify imposing `EA alpha DeltaT` as a universal system force.

Show how initial thermal strain enters member compatibility and how the final force depends on route geometry and restraints.

### 1.5 Elbow authority

Separate:

- elbow centreline geometry;
- physical arc length used for mass;
- code-derived flexibility factor `k`;
- pressure correction to `k`;
- stress intensification factors;
- the adopted segmented representation.

Explain why flexibility factor and SIF are not interchangeable.

### 1.6 Implementation and tests

Provide contracts or pseudocode for:

```text
resolveSectionStates()
buildDistributedWeight()
compileEmpiricalMember()
compileInitialStrainLoad()
```

Define tests that would fail if:

- the code-stress wall is accidentally used for physical weight;
- the nominal wall is accidentally used after a declared corrosion deduction in `S_L`;
- a valve mass is double counted;
- gravity is projected incorrectly on an inclined member;
- thermal strain is converted to an uncontrolled universal force.

---

# Question 2 — Unilateral Contact, Lift-Off and Load-Case Decomposition

Appendix S Example 2 has anchors at the two ends and candidate vertical rests at nodes 20, 50 and 120.

The cold sustained state has all three rests active. In the attached operating trial, node 50 requires a tensile vertical reaction and must lift off.

Design the complete contact and load-case method.

### 2.1 Governing contact conditions

Use a clear support-on-pipe sign convention and define:

\[
R_i\ge0
\]

\[
g_i\ge0
\]

\[
R_i g_i=0
\]

Explain the physical meaning of each condition.

Define the difference between:

- a bilateral anchor or clamp;
- a frictionless Y+ rest;
- a gapped rest;
- an inactive rest;
- an unsupported location.

### 2.2 Active-set algorithm

Give precise pseudocode for an active-set solution that:

1. begins from a deterministic candidate support set;
2. solves the complete compatibility problem;
3. recovers signed reactions;
4. releases inadmissible tensile rests;
5. completely rebuilds and resolves the model;
6. supports simultaneous release of multiple rests;
7. retains trial reactions and iteration evidence;
8. terminates deterministically;
9. detects oscillation or nonconvergence;
10. defines a future re-contact rule for finite gaps without pretending that it is already qualified.

Explain why this is wrong:

```text
if reaction < 0:
    reaction = 0
```

### 2.3 Load-case decomposition

Define and distinguish:

\[
W_{cold}=W(A_{cold})
\]

\[
OPE=(W+T)(A_{hot})
\]

\[
W_{hot}=W(A_{hot})
\]

\[
\Delta M_{W,lift}=M(W,A_{hot})-M(W,A_{cold})
\]

\[
M_{T,hot}=M(W+T,A_{hot})-M(W,A_{hot})
\]

Explain why:

\[
M_{OPE}-M_{SUS}
\]

is not necessarily a pure thermal moment when the support set changes.

### 2.4 Equilibrium and state evidence

Define checks for:

- global vertical-force closure;
- full three-dimensional force closure when extended;
- global moment closure about an origin independent of node ordering;
- active support admissibility;
- released support separation;
- joint action balance;
- repeat-run determinism.

### 2.5 Example 2 evidence

Using the supplied benchmark facts:

```text
attached trial reaction at N50  ≈ -12.842 kN
final N50 reaction              = 0
final N50 uplift                ≈ +22.050 mm
final active rests              = N20 and N120
```

explain what is benchmark evidence and what is merely a calculated result.

### 2.6 Failure modes and tests

Cover at least:

- singularity after support release;
- rigid-body motion;
- all supports released;
- near-zero reaction chatter;
- inconsistent gap direction;
- simultaneous release ordering;
- incorrect reuse of cold displacement in the hot solve;
- stale support-state evidence.

Provide unit and integration tests for each.

---

# Question 3 — Member Action Recovery and Appendix S Sustained-Stress Calculation

The method has solved nodal displacements but does not yet have a production member-action or sustained-stress contract.

Design and numerically verify the complete calculation chain.

## 3.1 Member end-action recovery

For each member, derive:

\[
\mathbf d_e^{local}=\mathbf T_e\mathbf d_e^{global}
\]

\[
\mathbf f_e^{local}=\mathbf k_e^{local}\mathbf d_e^{local}-\mathbf f_e^{0,local}
\]

For a planar member, define the ordering and signs of:

\[
[N_i,V_i,M_i,N_j,V_j,M_j]^T
\]

Explain how to prove joint equilibrium when adjacent members use opposite end conventions.

## 3.2 Internal force and moment extrema

For a member carrying a uniform transverse load, derive:

\[
M(x)=M_i+V_i x-\frac{q x^2}{2}
\]

\[
V(x)=V_i-qx
\]

and the internal extremum location:

\[
x_{ext}=V_i/q
\]

State the checks required before accepting `x_ext` as an internal maximum.

Explain how point loads or piecewise UDLs change the recovery procedure.

## 3.3 Bend-station axial force

Table S302.6.3 reports global forces at stations, while sustained axial force is resolved along the local centreline tangent.

Define:

\[
N_m=\mathbf F\cdot\mathbf t
\]

for:

- a straight station;
- a bend near point;
- a bend midpoint;
- a bend far point.

Explain why choosing one adjacent chord's local x-axis at a shared bend midpoint is incorrect.

## 3.4 Sustained stress numerical calculation

Use the following Appendix S Sustained Condition 3 values at Node 20:

```text
Do                              = 0.406400 m
tn                              = 0.009525 m
corrosion allowance, c          = 0.0016002 m
pressure, P                     = 3.795 MPa
mechanical axial-force magnitude= 12.575 kN
bending moment magnitude, Mz    = 82.845 kN·m
published SL                    = 129.975 MPa
sustained bending index         = 1.0 at this straight station
out-of-plane moment             = 0
torsional moment                = 0
```

Calculate, showing substitutions and units:

1. corroded stress wall `tc`;
2. stress area `Asp`;
3. elastic section modulus `Z`;
4. pressure-force area `Asf` using the adopted internal-diameter basis;
5. pressure force `FP=P Asf`;
6. signed sustained axial force `Fsa` under the declared cut convention;
7. axial stress `Ssa`;
8. sustained bending stress `Ssb`;
9. torsional stress `Sst`;
10. sustained longitudinal stress:

\[
S_L=\sqrt{(|S_{sa}|+S_{sb})^2+4S_{st}^2}
\]

11. percentage error against `129.975 MPa`;
12. allowable disposition for `Sh=124.5 MPa`.

Your numerical result shall be close to the Appendix S value. A discrepancy greater than 0.5% must be diagnosed, not hidden by tolerance.

## 3.5 Pressure and table-force interpretation

Explain why the published mechanical force column is not automatically the complete sustained axial force used in `S_L`.

State:

- the pressure-force sign convention;
- whether the table force is pipe-on-cut or cut-on-pipe;
- where magnitude is permitted;
- how a sign error can produce an apparently plausible but wrong stress.

## 3.6 Bend sustained stress

Explain how a bend station differs from Node 20:

- local tangent projection;
- in-plane and out-of-plane moments;
- sustained indices;
- pressure correction where applicable;
- use of code-stress wall rather than stiffness wall.

Do not quote a bend index from memory. State the required exact source citation or mark it unresolved.

## 3.7 Implementation and tests

Provide contracts or pseudocode for:

```text
recoverMemberActions()
recoverInternalExtrema()
projectStationActions()
calculateB31SustainedStress()
```

Define tests that independently verify:

- a fixed-fixed beam under UDL;
- a cantilever under UDL;
- action reversal when element I/J orientation is reversed;
- bend tangent projection;
- Node 20 Table S302.6.3 result;
- a pressure-sign mutation;
- nominal-versus-corroded wall mutation;
- deterministic formula trace.

---

# Question 4 — Elbow Accuracy, Convergence, Benchmark Policy and Root-Cause Control

The first empirical benchmark used two 45° chord members per 90° elbow. At Appendix S Example 1 Bend 30 far, the published vertical displacement is `+0.400 mm` and the two-segment result was approximately `+1.174 mm`.

The raw pointwise percentage appeared as `193.55%`, although the absolute discrepancy was `0.774 mm`.

Refinement produced approximately:

| Segments per 90° elbow | Bend 30 far displacement | Absolute error | Bend 40 far displacement | N20 reaction error |
|---:|---:|---:|---:|---:|
| 2 | 1.174 mm | 0.774 mm | 20.183 mm | 1.372% |
| 4 | 0.751 mm | 0.351 mm | 19.556 mm | 0.628% |
| 8 | 0.646 mm | 0.246 mm | 19.401 mm | 0.445% |
| 16 | 0.620 mm | 0.220 mm | 19.363 mm | 0.400% |
| 32 | 0.613 mm | 0.213 mm | 19.353 mm | 0.389% |

Design the production accuracy and qualification policy.

## 4.1 RCA

Explain why the two-segment representation disproportionately affects a displacement station near a zero crossing.

Separate:

- geometry discretisation error;
- flexibility-factor error;
- load-length treatment;
- published rounding/program-average variance;
- near-zero denominator artefact;
- possible station-mapping or sign errors.

State how each cause is tested independently.

## 4.2 Production bend rule

Decide whether the interim qualified rule should use:

- a fixed eight-segment elbow;
- adaptive segmentation;
- a direct curved-member transfer matrix;
- another method.

Justify the choice for the initial production implementation and define the future migration path.

Do not tune `k` merely to force one benchmark ordinate.

## 4.3 Convergence

Define both relative and absolute 8-to-16 segment convergence criteria for:

- displacement;
- support reaction;
- end moment;
- peak internal moment;
- sustained stress.

Explain how to handle near-zero quantities in a convergence ratio.

## 4.4 Error policy

Define:

\[
e_a=|X_{emp}-X_{ref}|
\]

\[
e_r=100\frac{|X_{emp}-X_{ref}|}{|X_{ref}|}
\]

and a near-zero rule using an absolute floor or benchmark-scale normalisation.

Specify exactly when the report shall emit:

```text
N/A_NEAR_ZERO_REFERENCE
```

instead of a governing pointwise percentage.

## 4.5 Benchmark ladder

Design a mandatory hierarchy including:

1. exact closed-form beam cases;
2. member action-recovery cases;
3. Appendix S Example 1 displacement and reactions;
4. Appendix S Example 2 lift-off and redistributed reactions;
5. Table S302.6.3 axial force, bending moment and `S_L`;
6. deterministic replay and mutation tests.

Explain why passing Appendix S alone does not prove the correctness of the formulation.

## 4.6 Benchmark isolation

Design a machine-readable benchmark manifest that production code cannot import.

Explain:

- source-value ownership;
- station mapping;
- tolerance profiles;
- semantic hashes;
- formula IDs;
- reference-versus-calculated separation;
- source guards preventing benchmark values from entering runtime calculations.

## 4.7 Acceptance proposal

Provide numeric acceptance thresholds for the initial release, including special treatment for the small Node 10 sustained moment.

Your proposal shall be strict enough to catch a real formulation defect but shall not misuse a percentage against a near-zero target.

---

# Question 5 — Production Architecture, Evidence and Structural-Support Roadmap

Design the repository implementation and future architecture.

## 5.1 Production ownership

Propose module boundaries for a standalone production package, for example:

```text
src/core/empirical-piping-mechanics/
  contracts.ts
  section.ts
  weight.ts
  member.ts
  assemble.ts
  contact.ts
  actions.ts
  identity.ts
  stress/
    b31-sustained.ts
  index.ts
```

You may propose a different structure, but it must preserve:

- no LFEA imports;
- no benchmark-to-production imports;
- immutable source inputs;
- separate mechanics and code-stress ownership;
- formula traceability;
- deterministic identity.

## 5.2 Runtime contracts

Define versioned contracts for:

- calculation request;
- section-state evidence;
- load-case definition;
- active-set iteration record;
- displacement and reaction result;
- member end actions;
- station resultants;
- sustained-stress result;
- benchmark evidence;
- failure disposition.

State which fields participate in semantic identity and which are report-only metadata.

## 5.3 Numerical controls

Specify:

- DOF ordering;
- deterministic node and member ordering;
- matrix scaling and pivot policy;
- singularity and conditioning checks;
- residual definitions;
- unit normalisation;
- floating-point serialisation;
- repeat-run byte identity;
- stale-result invalidation.

A hardcoded absolute pivot threshold without scaling is not an adequate answer.

## 5.4 Evidence and CI

Design CI gates that prove:

- zero forbidden imports;
- zero benchmark values in production modules;
- closed-form mechanics pass;
- Appendix S replay pass;
- exact-head execution;
- deterministic output;
- formula and requirement traceability;
- changed-path scope;
- no default UI/runtime cutover before qualification.

Define the evidence archive contents.

## 5.5 Structural-support screening extension

The piping method may later provide immutable interface actions:

```text
Fx, Fy, Fz, Mx, My, Mz
application point
coordinate frame
load case
support/contact state
source and result identity
```

Design a separate future method `EMPIRICAL_SUPPORT_FRAME_SCREEN_V1` for preliminary screening only.

### Cantilever post

Define direct screening relations for a post of height `H` receiving a horizontal force, vertical force and applied moments, including:

- base shear;
- base overturning moment;
- axial force;
- elastic tip displacement;
- biaxial elastic stress;
- an Euler buckling screen where applicable.

### T-post

Describe how to transfer one or more pipe interface loads through crossarm eccentricities to:

- crossarm shear and bending;
- stem axial force and biaxial bending;
- torsion from eccentric load placement;
- base actions.

### Goalpost

Describe a defensible preliminary approach for:

- beam and two-column frame action;
- symmetric and asymmetric loading;
- load sharing;
- frame sway;
- beam bending and column moments;
- base reactions.

Explain why a simple 50/50 vertical split is not generally sufficient.

## 5.6 Structural authority boundary

State what this future screening method may report and what it must block.

It shall not claim code-qualified adequacy of:

- structural steel members;
- local buckling or lateral-torsional buckling;
- welded or bolted connections;
- base plates;
- anchor bolts;
- concrete pedestals or foundations;
- fatigue, seismic or dynamic response.

Define the separate code datasets and benchmarks required before those capabilities can be enabled.

## 5.7 Delivery sequence

Propose a reviewable multi-PR sequence that separates:

1. authority and benchmark manifests;
2. production mechanics and action recovery;
3. sustained-stress calculation;
4. runtime/report integration;
5. future structural-screening design and later implementation.

For every PR, state:

- exact scope;
- files or module families;
- non-goals;
- tests;
- evidence;
- rollback boundary.

---

# Part A — Evaluator Rubric

## Question 1 rubric

| Criterion | Marks |
|---|---:|
| Correct separation of section states and wall bases | 4 |
| Correct weight, beam and thermal formulation | 5 |
| Correct distinction between bend flexibility and SIF | 4 |
| Strong data contracts and source authority | 3 |
| Failure modes and tests | 4 |

## Question 2 rubric

| Criterion | Marks |
|---|---:|
| Correct complementarity and support semantics | 4 |
| Complete deterministic active-set algorithm | 5 |
| Correct cold/hot load decomposition | 5 |
| Equilibrium and state evidence | 3 |
| Failure modes and tests | 3 |

## Question 3 rubric

| Criterion | Marks |
|---|---:|
| Correct action recovery and internal extrema | 4 |
| Correct bend tangent projection | 3 |
| Numerically correct Node 20 sustained calculation | 7 |
| Correct pressure/table-force interpretation | 3 |
| Implementation and tests | 3 |

## Question 4 rubric

| Criterion | Marks |
|---|---:|
| Correct RCA separation | 4 |
| Defensible bend representation and convergence | 5 |
| Correct near-zero error policy | 4 |
| Strong benchmark hierarchy and isolation | 4 |
| Numeric acceptance criteria | 3 |

## Question 5 rubric

| Criterion | Marks |
|---|---:|
| Clean standalone production architecture | 5 |
| Numerical, identity and CI controls | 4 |
| Correct structural load-transfer concepts | 5 |
| Strict structural authority boundary | 3 |
| Reviewable delivery sequence | 3 |

---

# Part B — Selected-Agent Work Pack

## B1. Release condition

Part B becomes active only after the candidate passes Part A and the owner explicitly grants implementation authority.

Passing the qualification does not itself authorize:

- direct changes to `main`;
- issue closure;
- release promotion;
- UI cutover;
- structural code claims;
- use of LFEA results inside the empirical method.

---

## B2. Mission

Implement and qualify the standalone empirical piping method defined by `EMP-PROD-05B-EBR-001` so that it can independently calculate and evidence:

1. declared section and weight states;
2. straight and segmented-elbow compatibility;
3. gravity and thermal displacement;
4. bilateral and unilateral support reactions;
5. lift-off through active-set recalculation;
6. member axial force, shear, bending moment and qualified torsion;
7. station resultants at straights and bends;
8. ASME B31.3 sustained longitudinal stress through an edition-bound code dataset;
9. Appendix S benchmark comparisons;
10. deterministic machine-readable evidence.

The initial implementation shall not activate the future structural-support screening method. It shall only establish the immutable interface-load contract and a design-ready roadmap for later work.

---

## B3. Source-of-truth hierarchy

The agent shall use:

1. `docs/empirical-piping-engineering-basis-and-benchmark.md` as the controlled engineering specification;
2. exact licensed standard evidence supplied by the owner for code formulas;
3. direct mechanics derivations for closed-form tests;
4. Appendix S benchmark values only inside benchmark fixtures or manifests;
5. existing standalone empirical benchmark scripts as migration evidence, not permanent production architecture.

Where source evidence conflicts:

```text
BLOCK
→ record SOURCE_AUTHORITY_CONFLICT
→ do not choose a convenient value
```

---

## B4. Non-negotiable boundaries

### B4.1 No LFEA dependency

Production modules and ordinary runtime paths shall not import from, call, deserialize or consume:

```text
src/core/linear-fea-*
src/core/centerline-beam-fea
LFEA result or model schemas
existing LFEA Appendix S fixtures
```

An AST-based or equivalent import guard shall enforce this boundary.

### B4.2 Benchmark isolation

Production modules shall not import benchmark manifests, published Appendix S tables or acceptance tolerances.

Allowed direction:

```text
benchmark → production core
```

Forbidden direction:

```text
production core → benchmark/reference values
```

### B4.3 Immutable engineering inputs

The calculation shall create a separate immutable request and result package. It shall not mutate imported geometry, supports, components or source datasets.

### B4.4 No silent assumptions

Missing critical geometry, section, mass, support direction, material, pressure or code dataset shall block or produce an explicitly scoped result.

No blank or unsupported input may silently become zero.

### B4.5 No premature structural qualification

The piping-action output may feed a future structural screen, but the present lot shall not claim T-post, goalpost, cantilever, connection, base plate, anchor or foundation adequacy.

---

## B5. Required repository deliverables

### Production package

Recommended target:

```text
src/core/empirical-piping-mechanics/
```

Minimum modules:

```text
contracts.ts
section.ts
weight.ts
axes.ts
member.ts
assembly.ts
linear-system.ts
contact.ts
actions.ts
stations.ts
identity.ts
failure-codes.ts
stress/b31-sustained.ts
index.ts
```

Equivalent names are acceptable if ownership remains clear.

### Machine-readable authority

```text
benchmarks/empirical-piping/formula-register.json
benchmarks/empirical-piping/requirements-register.json
benchmarks/empirical-piping/appendix-s/manifest.json
benchmarks/empirical-piping/appendix-s/example1.json
benchmarks/empirical-piping/appendix-s/example2.json
benchmarks/empirical-piping/appendix-s/table-s302.6.3.json
```

Licensed text shall not be reproduced. Store only the minimum benchmark values, station identities and source citations permitted for the repository.

### Qualification scripts

Recommended scripts:

```text
scripts/empirical-piping-source-boundary-check.mjs
scripts/empirical-piping-closed-form-check.mjs
scripts/empirical-piping-contact-check.mjs
scripts/empirical-piping-action-recovery-check.mjs
scripts/empirical-piping-appendix-s-example1-check.mjs
scripts/empirical-piping-appendix-s-example2-check.mjs
scripts/empirical-piping-s302.6.3-check.mjs
scripts/empirical-piping-determinism-check.mjs
scripts/empirical-piping-anti-drift-check.mjs
```

### Evidence outputs

Each exact-head qualification run shall emit:

```text
calculation request
formula profile
source and edition identities
section-state derivations
member and load derivations
active-set iteration history
displacement and reaction results
member actions and station resultants
sustained-stress formula trace
benchmark comparison table
equilibrium and convergence evidence
semantic hashes
changed-path evidence
workflow and exact-head identity
```

---

# B6. Work Package 0 — Baseline and Authority Freeze

## Objective

Establish a reviewable baseline and prevent engineering-authority drift before numerical implementation.

## Tasks

1. Confirm the exact current `main` and engineering-specification commit.
2. Create a dedicated implementation branch from current `main` after the engineering specification is merged or otherwise frozen by the owner.
3. Record the source hierarchy and unresolved code citations.
4. Convert the formula register into machine-readable form.
5. Create the requirements-to-test register.
6. Create source-boundary and benchmark-isolation guards.
7. Record the legacy standalone benchmark outputs for migration comparison.

## Acceptance

- zero production calculation changes;
- formula register covers every implemented or planned equation;
- each code formula has a standard, edition and rule ID or is blocked;
- source guard fails on a synthetic forbidden import;
- benchmark-isolation guard fails if a production module imports a reference fixture;
- semantic hashes are deterministic.

## Non-goals

- no solver implementation;
- no UI;
- no stress calculation;
- no structural screening.

---

# B7. Work Package 1 — Section, Weight and Member Core

## Objective

Implement the independent mechanics foundation.

## Tasks

1. Implement distinct section states:
   - stiffness;
   - weight;
   - code stress.
2. Implement pipe and component weight derivations.
3. Implement deterministic local axes.
4. Implement straight planar member coefficients.
5. Implement consistent distributed-load vectors.
6. Implement initial thermal strain.
7. Implement eight-segment 90° elbows with physical arc weight.
8. Preserve an explicit future hook for a curved-member formulation without exposing an unqualified option.

## Required tests

- pipe section closed forms;
- independent annular section modulus;
- simply supported UDL beam;
- cantilever UDL beam;
- fixed-fixed UDL beam;
- inclined-member gravity projection;
- fully restrained thermal bar;
- free thermal bar;
- valve and point-mass force/moment closure;
- wall-state mutation tests;
- elbow 8-to-16 convergence fixture.

## Acceptance

Closed-form quantities shall agree to a scaled floating-point tolerance. A tolerance shall not be selected merely because the current output passes.

---

# B8. Work Package 2 — Assembly, Solution and Contact

## Objective

Implement deterministic compatibility and unilateral-rest lift-off.

## Tasks

1. Define DOF ordering and model ordering.
2. Implement scaled linear-system solution with pivot/rank diagnostics.
3. Implement bilateral constraints.
4. Implement unilateral Y+ rest active set.
5. Retain every active-set trial.
6. Rebuild the system after each support-set change.
7. Define deterministic simultaneous-release ordering.
8. Return blocking diagnostics for singular or unstable released states.
9. Add future-facing gap/re-contact contract fields but keep unqualified behavior disabled.

## Required tests

- one active rest;
- one rest requiring release;
- two simultaneous releases;
- release producing rigid-body motion;
- near-zero reaction tolerance;
- deterministic active-set iteration history;
- Example 2 attached trial and final state;
- force and moment closure after release;
- input immutability.

## Acceptance

For Appendix S Example 2, reproduce the correct qualitative contact transition and final symmetric reaction distribution without using the published reactions as inputs.

---

# B9. Work Package 3 — Member Actions and Station Recovery

## Objective

Recover auditable member and station actions from the empirical solution.

## Tasks

1. Implement local end-action recovery:

\[
f_e=k_ed_e-f_e^0
\]

2. Publish signed local and global actions.
3. Implement internal force and moment functions for UDL and point-load segments.
4. Recover internal extrema.
5. Implement bend near/mid/far station tangents.
6. Project global forces onto the physical station tangent.
7. Implement joint action closure evidence.
8. Define the action decomposition fields:
   - cold weight;
   - hot-set weight;
   - lift-off redistribution;
   - thermal-on-hot-set;
   - operating total.

## Required tests

- fixed-fixed beam end moments;
- cantilever root moment;
- element reversal invariance;
- joint equal-and-opposite balance;
- internal moment maximum;
- piecewise load discontinuity;
- bend tangent projection at 0°, 45° and 90°;
- 8-to-16 bend action convergence;
- Example 1 and Example 2 action-recovery snapshots.

## Acceptance

No station action may depend on arbitrary adjacent-element selection.

---

# B10. Work Package 4 — B31.3 Sustained-Stress Calculator

## Objective

Implement an edition-bound sustained-stress calculator that consumes empirical actions but owns no mechanics solution.

## Tasks

1. Define the code dataset contract.
2. Implement code-stress section state using declared corrosion and other applicable deductions.
3. Implement pressure-force derivation.
4. Implement mechanical axial-force sign mapping.
5. Implement sustained axial stress.
6. Implement indexed in-plane and out-of-plane bending stress.
7. Implement torsional stress.
8. Implement `S_L` and allowable comparison.
9. Retain a complete formula trace and source identity.
10. Reject missing or unresolved code factors.

## Benchmark stations

At minimum, compare the Table S302.6.3 stations already retained in the engineering basis:

```text
Node 10
Node 20
Bend 30 far
Bend 40 mid
Node 50
```

## Initial acceptance targets

Subject to independent source verification:

- axial-force error: `<= 0.5%` at ordinary stations;
- bending-moment error: `<= 1.0%` where the reference magnitude is not small;
- Node 10 small moment: absolute error `<= 0.25 kN·m`, with relative error reported but not governing alone;
- sustained `S_L` error: `<= 0.5%`;
- same governing station as Appendix S;
- same allowable pass/fail disposition;
- formula recomputation from published actions shall match the published stress within documented rounding.

## Mutation tests

The gate shall fail when intentionally changing:

- pressure-force sign;
- corroded wall to nominal wall;
- bend tangent;
- sustained index;
- section modulus definition;
- force units;
- moment units.

---

# B11. Work Package 5 — Benchmark, Reporting and Production Integration

## Objective

Make qualification repeatable without prematurely enabling ordinary runtime use.

## Tasks

1. Replace or wrap legacy script-only logic with production-core imports.
2. Keep published targets inside benchmark fixtures.
3. Generate side-by-side tables with:
   - empirical value;
   - reference value;
   - absolute deviation;
   - ordinary percentage where valid;
   - near-zero disposition;
   - tolerance utilisation;
   - status.
4. Emit calculation and benchmark semantic hashes.
5. Add exact-head workflow registration.
6. Add repeat-run byte comparison.
7. Add anti-drift checks for formula IDs and station mappings.
8. Document migration from the original two-chord benchmark.
9. Preserve `ordinaryRuntimeCutover: false` until the owner separately authorizes integration.

## Acceptance

- all mandatory benchmarks pass at the exact reviewed head;
- evidence archive is complete and reproducible;
- no published reference value appears in production source;
- no UI or default calculation path changes;
- changed paths remain within the approved package.

---

# B12. Work Package 6 — Future Structural-Support Screening Design

## Objective

Prepare a separate, non-authorizing design package for future structural screening using immutable piping interface actions.

This work package is **design and benchmark planning only** unless the owner grants a second implementation gate.

## B12.1 Interface-load contract

Define:

```text
interface point and coordinate frame
Fx, Fy, Fz
Mx, My, Mz
load-case identity
support/contact state
piping request and result hashes
sign convention
units
source timestamp as report metadata only
```

The structural method shall not recalculate or alter piping reactions.

## B12.2 Cantilever screening concept

For a simple prismatic cantilever post, document direct formulas for:

- base axial force;
- base shear;
- base moments from force eccentricity and applied moments;
- elastic tip displacement;
- elastic rotation;
- biaxial normal stress;
- shear stress screening;
- Euler buckling indicator.

State all end-fixity assumptions explicitly.

## B12.3 T-post screening concept

Document load transfer from pipe interfaces to the crossarm and stem using:

\[
\mathbf M_{ref}=\mathbf M+\mathbf r\times\mathbf F
\]

Include:

- crossarm bending and shear;
- stem axial force;
- stem biaxial bending;
- torsion from lateral eccentricity;
- base action envelope;
- asymmetric pipe loading;
- multiple simultaneous interface loads.

## B12.4 Goalpost screening concept

Document alternatives for:

- simple beam with column springs;
- rigid-jointed planar frame;
- symmetric and asymmetric loading;
- beam-to-column stiffness-dependent load sharing;
- sway and no-sway assumptions;
- column base fixity;
- preliminary member action envelope.

A fixed 50/50 reaction split may be used only in a separately declared symmetric screening case.

## B12.5 Structural qualification ladder

Plan independent benchmarks for:

1. cantilever point load;
2. cantilever applied moment;
3. cantilever combined axial and lateral load;
4. simply supported crossarm;
5. fixed crossarm;
6. symmetric goalpost;
7. asymmetric goalpost;
8. eccentric T-post torsion;
9. frame joint equilibrium;
10. load-transfer invariance under coordinate translation.

## B12.6 Required blockers

The structural screen shall return a blocking or limited disposition for:

```text
STRUCTURAL_CODE_DATASET_UNRESOLVED
CONNECTION_STIFFNESS_UNRESOLVED
BASE_FIXITY_UNRESOLVED
LOCAL_BUCKLING_NOT_EVALUATED
LATERAL_TORSIONAL_BUCKLING_NOT_EVALUATED
BASE_PLATE_NOT_EVALUATED
ANCHOR_BOLTS_NOT_EVALUATED
FOUNDATION_NOT_EVALUATED
DYNAMIC_LOAD_OUTSIDE_SCOPE
```

---

# B13. Pull-Request Sequence

## PR 1 — Authority and benchmark manifests

**Scope**

- machine-readable formula and requirements registers;
- Appendix S benchmark manifests;
- source-boundary guards;
- benchmark-isolation guards;
- no numerical production behavior.

**Rollback**

Delete the new registries and guards. No runtime behavior is affected.

## PR 2 — Empirical mechanics and contact core

**Scope**

- section states;
- weight;
- member coefficients;
- thermal strain;
- eight-segment elbows;
- assembly and contact;
- displacement and reactions.

**Non-goals**

- no sustained stress;
- no UI;
- no structural screen.

## PR 3 — Member action and station recovery

**Scope**

- end actions;
- internal extrema;
- bend tangent projection;
- action decomposition;
- equilibrium evidence.

## PR 4 — Sustained-stress calculator and S302.6.3 benchmark

**Scope**

- edition dataset;
- pressure force;
- `S_sa`, `S_sb`, `S_st`, `S_L`;
- Appendix S comparison;
- allowable disposition.

## PR 5 — Evidence, workflow and opt-in integration contract

**Scope**

- deterministic reports;
- exact-head CI;
- anti-drift;
- evidence archive;
- explicit no-cutover status.

## PR 6 — Structural-screening design package

**Scope**

- interface-action schema;
- cantilever, T-post and goalpost formulation note;
- benchmark plan;
- failure boundaries.

**Non-goal**

No structural adequacy calculation is authorized in this PR.

Each PR shall be independently reviewable and revertible. Do not combine all phases into one monolithic change.

---

# B14. Mandatory Acceptance Matrix

| Area | Required evidence |
|---|---|
| Source boundary | no forbidden imports or solver-result inputs |
| Section states | stiffness, weight and stress states independently derived |
| Weight | force and moment closure including components |
| Straight members | closed-form displacement, reaction and moment parity |
| Elbows | declared 8-segment rule and 8→16 convergence |
| Thermal | free and fully restrained bar benchmarks |
| Contact | active-set trial, release, complete recomputation and final state |
| Actions | signed end actions, internal extrema and joint closure |
| Appendix S Example 1 | reactions and displacements within governed tolerance |
| Appendix S Example 2 | correct lift-off state and redistributed reactions |
| Table S302.6.3 | axial force, moment and `S_L` comparison |
| Error reporting | near-zero guard and absolute tolerance use |
| Determinism | byte-identical repeated outputs |
| Identity | source, formula, request and result hashes |
| Structural roadmap | separate method and explicit non-qualification boundary |

---

# B15. Evidence Archive

The selected agent shall provide one exact-head archive containing:

```text
README.md
manifest.json
formula-register.json
requirements-register.json
source-boundary-report.json
closed-form-results.json
contact-results.json
action-recovery-results.json
appendix-s-example1-results.json
appendix-s-example2-results.json
appendix-s-s302.6.3-results.json
convergence-results.json
determinism-report.json
changed-path-report.json
workflow-run.json
```

The archive manifest shall include SHA-256 digests for every file.

---

# B16. Final Delivery Requirements

The selected agent's final handoff shall state:

1. branch and exact head;
2. PR numbers and dependency order;
3. changed files by work package;
4. engineering formulas implemented;
5. unresolved source citations;
6. benchmark results and errors;
7. equilibrium and convergence results;
8. CI workflow and artifact identities;
9. ordinary runtime/UI cutover status;
10. remaining limitations;
11. structural-screening status;
12. explicit rollback instructions.

A green workflow is not sufficient if the engineering evidence or authority trace is incomplete.

---

# B17. Stop Conditions

Stop and return a blocking report rather than continuing when:

- a required code formula lacks verifiable source authority;
- Appendix S source data are inconsistent;
- the implementation requires LFEA or another solver result;
- the active-set state is nonconvergent;
- the model becomes singular after release;
- elbow convergence fails;
- force or moment equilibrium exceeds tolerance;
- the sustained-stress result requires an unresolved sign or section basis;
- production code would need benchmark values;
- a structural adequacy claim would exceed the future screening boundary.

---

# B18. Completion Definition

The initial program is complete only when:

```text
engineering authority is traceable
AND production mechanics are standalone
AND contact is recomputed, not clipped
AND member actions are recovered and equilibrated
AND sustained stress reproduces the governed Appendix S table
AND elbow accuracy is converged
AND benchmark values remain isolated
AND outputs are deterministic
AND no default runtime/UI cutover has occurred
AND structural screening remains a separate, explicitly limited future method
```
