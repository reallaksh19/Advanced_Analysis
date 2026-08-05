# Empirical Thermal Lift-Off and Reaction Redistribution Plan

**Repository:** `reallaksh19/Advanced_Analysis`  
**Plan date:** 5 August 2026  
**Proposed method family:** `THERMAL_LIFTOFF_ACTIVE_SET_V1`  
**Status:** engineering plan only; no production numerical authority  
**Relationship to current methods:** downstream of `CHAINAGE_TRIBUTARY_SPAN_V2` and `CHAINAGE_TRIBUTARY_SPAN_V3_COG`

---

## 1. Purpose

This plan defines how a future empirical screening method can capture:

1. temperature-driven vertical movement at piping supports;
2. loss of contact at one-way rest supports;
3. redistribution of gravity and displacement-driven reactions after a support lifts off;
4. possible re-contact when another active-set configuration closes a gap.

The method is intended for bounded engineering screening. It is not a piping flexibility solver, nonlinear finite-element solver, code-stress calculation or substitute for CAESAR II/LFEA where full system stiffness, friction, large rotations, nonlinear springs or equipment interaction govern.

---

## 2. Governing physical concept

A rest support can provide an upward compressive reaction but cannot pull the pipe downward. Heating may move the pipe upward, rotate a span, or redistribute bending sufficiently that the calculated contact reaction becomes tensile. A tensile reaction is physically inadmissible for an unrestrained rest support; the support must be released and the load redistributed to the remaining contacts.

The governing one-way-contact conditions are:

```text
R_i >= 0

g_i >= 0

R_i * g_i = 0
```

where:

- `R_i` is the upward contact reaction at support `i`;
- `g_i` is the separation gap between pipe and support;
- `R_i > 0, g_i = 0` means active contact;
- `R_i = 0, g_i > 0` means lifted/open contact;
- `R_i < 0` or `g_i < 0` is an inadmissible trial state that requires active-set correction.

A negative reaction must **not** be clamped to zero while leaving all other reactions unchanged. Removing a contact changes the support system and requires redistribution.

---

## 3. Required authority inputs

### 3.1 Temperature and movement authority

At least one qualified source is required:

1. **Preferred:** source-backed hot vertical displacements at support sites from an approved flexibility/LFEA result, equipment movement schedule or measured survey;
2. **Allowed for bounded templates:** a qualified reduced displacement model with geometry-specific influence coefficients;
3. **Not sufficient by itself for a routed system:** `alpha * DeltaT * L` without a proven mapping from axial expansion to vertical support displacement.

Required fields include:

- reference/cold temperature;
- operating or excursion temperature by case;
- thermal expansion coefficient or integrated thermal strain source;
- imposed nozzle/equipment/support movement;
- direction and sign convention;
- active thermal length or exact source displacement;
- source identity, revision and semantic hash.

For a uniform straight member with qualified constant expansion coefficient:

```text
epsilon_th = alpha * DeltaT
Delta_free = alpha * DeltaT * L
```

For temperature-dependent expansion:

```text
epsilon_th = integral(alpha(T) dT)
Delta_free = L * integral(alpha(T) dT)
```

These relations produce free expansion. They do not by themselves determine vertical displacement or restraint force in an arbitrary routed piping system.

### 3.2 Support/contact authority

Each support site requires:

- exact support-site identity and route chainage;
- support capability: rest, hold-down, spring, guide, stop or bilateral restraint;
- vertical contact direction;
- cold gap or clearance;
- support vertical movement, settlement or thermal movement;
- contact tolerance;
- whether tensile reaction is permitted;
- active/inactive initial state.

A simple rest is unilateral. A hold-down or clamp may be bilateral only when its tensile capability and stiffness are explicitly authorized.

### 3.3 Stiffness or influence authority

Final thermal reaction distribution requires one of:

- a qualified reduced vertical stiffness matrix `K`;
- a qualified vertical flexibility/influence matrix `C = K^-1`;
- exact template coefficients for a narrowly defined beam/route class;
- source reactions/displacements from a higher-authority solver used as governed input.

A guessed support stiffness or a single generic stiffness applied to all supports is not acceptable.

Required stiffness evidence includes:

- pipe `E`, section properties and span geometry;
- support/spring vertical stiffness where applicable;
- boundary conditions and restraint directions;
- matrix units, ordering and sign convention;
- method/version and benchmark identity;
- applicability limits.

### 3.4 Gravity preload

The cold gravity preload comes from a current authorized empirical execution:

```text
CHAINAGE_TRIBUTARY_SPAN_V2
or
CHAINAGE_TRIBUTARY_SPAN_V3_COG
```

The execution must provide current support-site reactions, load-case identity, contribution ledger, source hashes and equilibrium evidence.

---

## 4. Proposed calculation architecture

```text
authorized cold gravity execution
  + authorized thermal/imposed displacement field
  + authorized contact/gap capability
  + qualified reduced stiffness/influence model
  -> thermal-liftoff input package
  -> active-set contact solver
  -> redistributed reaction candidates
  -> complementarity + equilibrium checks
  -> immutable thermal-liftoff receipt
  -> separate presenter/report consumer
```

The proposed schemas are:

```text
empirical-thermal-liftoff-input/v1
empirical-thermal-liftoff-active-set/v1
empirical-thermal-liftoff-execution/v1
```

No existing V2/V3 gravity result is modified in place.

---

## 5. Two-stage engineering method

### 5.1 Stage A — local lift-off screening

A local screening demand may be estimated only where a qualified effective vertical stiffness exists:

```text
U_i = k_i,eff * delta_i,up
R_i,trial = R_i,cold - U_i
```

where:

- `delta_i,up` is the upward pipe-to-support relative thermal movement;
- `k_i,eff` is a qualified effective vertical stiffness;
- `R_i,cold` is the cold gravity reaction.

Classification:

```text
R_i,trial > reactionTolerance     -> CONTACT_RETAINED_CANDIDATE
R_i,trial <= reactionTolerance    -> LIFTOFF_CANDIDATE
missing/unsupported k or delta    -> UNRESOLVED_GATE
```

This stage is a **screen only**. For a multi-support or routed system, it does not provide final redistributed reactions because support interactions are coupled.

### 5.2 Stage B — coupled active-set redistribution

Final screened reactions require a qualified reduced system model.

For an assumed active contact set `A`, the method solves the linear compatibility problem for the active contacts using the authorized stiffness or influence matrix. A generic reduced form is:

```text
DeltaR_A = -K_AA * delta_free,A
R_A,trial = R_gravity,A(A) + DeltaR_A
```

or, using flexibility coefficients:

```text
C_AA * DeltaR_A = -delta_free,A
R_A,trial = R_gravity,A(A) + DeltaR_A
```

The exact sign and matrix form must be fixed by the approved convention and benchmark. `R_gravity,A(A)` means gravity reactions are recomputed for the current active support set; it is not the original all-support vector with negative entries merely removed.

The equivalent displacement-driven load vector and its source must be retained so force and moment balance can be checked against gravity plus imposed-displacement actions.

---

## 6. Active-set algorithm

For each load/temperature case:

1. **Initialize** the active set from cold-contact support states.
2. **Recompute gravity reactions** on the current active set using the qualified gravity distribution method or reduced beam model.
3. **Assemble thermal relative movement** at every support from source displacement, support movement and cold gap.
4. **Solve active-contact compatibility** using the qualified stiffness/influence model.
5. **Form total trial reactions** from redistributed gravity and thermal increments.
6. **Release inadmissible contacts:** any unilateral rest with reaction below negative tolerance is removed from the active set.
7. **Check inactive gaps:** calculate separation/penetration at released supports. Add a support back only when the solved state closes/penetrates its authorized gap beyond tolerance.
8. **Repeat** until the active set is unchanged and all complementarity conditions pass.
9. **Verify equilibrium:** retain vertical force, moment and displacement-equivalent-load residuals.
10. **Publish immutable state history:** every added/removed support, iteration, residual and reason is retained.

Termination requirements:

```text
active set unchanged
all active unilateral reactions >= -reactionTolerance
all inactive gaps >= -gapTolerance
complementarity residual <= complementarityTolerance
force and moment residuals within approved limits
iterationCount <= approved maximum
```

Failure to converge returns `BLOCKED_NONCONVERGENT`, never a partial calculated reaction set.

---

## 7. Reaction redistribution rules

### 7.1 Gravity redistribution

When support `j` lifts:

```text
R_j = 0
```

The gravity contributions previously allocated to `j` must be redistributed using the new active support set. For the current chainage method, every distributed or point load is re-bracketed by the nearest active qualified supports and the full case equilibrium is recomputed.

The following is prohibited:

```text
R_j := max(0, R_j)
leave all other R_i unchanged
```

because it violates force and usually moment equilibrium.

### 7.2 Thermal reaction redistribution

Thermal reaction increments are solved simultaneously for the current active set. A purely local `k_i * delta_i` result may be reported as a candidate uplift reserve, but it cannot be represented as the final multi-support reaction distribution unless off-diagonal coupling is proven negligible for the qualified applicability class.

### 7.3 Re-contact

A lifted support may re-enter the active set if redistribution causes the pipe-support separation to close. The algorithm therefore permits both removal and addition of contacts, with cycle detection and deterministic tie-breaking.

---

## 8. Output contract

Each support-site result should retain:

- exact `supportSiteId` and route chainage;
- cold gravity reaction;
- thermal incremental reaction;
- final total reaction;
- cold gap and calculated hot gap;
- state: `ACTIVE`, `LIFTED`, `BILATERAL_ACTIVE`, `UNRESOLVED`;
- iteration at which the state last changed;
- source displacement and stiffness evidence;
- contributor IDs and formula trace;
- reaction/gap/complementarity residuals;
- applicability class;
- blockers and warnings.

The case receipt should retain:

- initial and final active sets;
- complete active-set iteration history;
- equivalent thermal/imposed load vector;
- force and moment equilibrium;
- convergence status;
- deterministic semantic hash;
- source and method versions.

---

## 9. Applicability classes

### Class TL-A — source-displacement contact screening

Use source-backed hot support displacements and a qualified local/contact stiffness model. Suitable for identifying probable lift-off and reaction reserve. Final redistribution requires qualified coupling data.

### Class TL-B — qualified simple reduced beam

Use exact closed-form or matrix coefficients for narrowly defined straight/planar beam templates with known spans, constant properties and vertical rests. Final redistributed reactions may be reported only inside the benchmark envelope.

### Class TL-C — full routed system

Bends, branches, equipment nozzles, mixed restraints, springs, friction or substantial three-dimensional coupling require LFEA/flexibility analysis. The empirical method returns `DETAILED_ANALYSIS_REQUIRED` unless a separately qualified reduced model exists.

---

## 10. Mandatory blockers

The future method must fail closed for:

- missing or stale temperature/displacement authority;
- missing support gap or unilateral/bilateral capability;
- missing vertical stiffness/influence authority;
- unsupported spring hanger curve or nonlinear support;
- ambiguous support direction or coordinate basis;
- routed geometry outside the qualified template class;
- significant friction coupling not included in the method;
- large displacement/rotation outside small-displacement assumptions;
- active-set cycling or nonconvergence;
- failed force, moment or complementarity checks;
- double counting of reactions already supplied by LFEA/flexibility analysis.

---

## 11. Benchmark programme

### 11.1 Analytical benchmarks

1. zero temperature change — exact cold-gravity parity;
2. two supports with no lift-off;
3. three supports with imposed upward displacement at the middle support;
4. middle support release followed by full gravity redistribution;
5. support gap smaller/larger than free upward movement;
6. symmetric geometry and symmetric temperatures;
7. unequal spans and unequal stiffnesses;
8. re-contact after another support releases;
9. bilateral hold-down versus unilateral rest;
10. deterministic active-set ordering and cycle detection.

### 11.2 Independent solver correlation

For each qualified template:

- use identical geometry, properties, gravity, gaps, temperatures and support directions;
- compare support state, reactions, gaps and displacement;
- separate linear no-lift cases from nonlinear contact-change cases;
- record absolute and percentage differences only within the validated class.

Controlled CAESAR II/LFEA correlation is required before claiming final reaction accuracy for routed systems.

### 11.3 Negative and governance tests

- missing stiffness/displacement/gap;
- stale dataset or Project Data;
- sign/axis tamper;
- matrix ordering/hash tamper;
- nonconvergence;
- source non-mutation;
- deterministic semantic hashes;
- ordinary gravity UI remains unchanged.

---

## 12. Implementation work packs

### TL-00 — authority and sign convention

Define units, axes, reaction sign, gap sign, unilateral/bilateral capability and exact source fields.

### TL-01 — thermal displacement intake

Accept approved source displacements and bounded `alpha DeltaT L` template inputs. No reactions yet.

### TL-02 — stiffness/influence registry

Register qualified matrices/template coefficients with ordering, units, benchmarks and semantic hashes.

### TL-03 — local lift-off screen

Implement reaction-reserve screening and explicit `LIFTOFF_CANDIDATE` status. Do not claim final redistribution.

### TL-04 — active-set redistribution

Implement support removal/addition, gravity re-bracketing, coupled thermal increments, convergence and complementarity.

### TL-05 — benchmark and correlation

Qualify simple templates, compare against controlled beam/LFEA/flexibility models and publish applicability classes.

### TL-06 — governed production integration

Add separately authorized runtime package, immutable receipt, presenter, stale suppression and reporting. No default cutover.

---

## 13. Acceptance criteria

The method may be promoted only when:

1. zero-temperature results reproduce the authorized cold gravity execution;
2. every lifted support has zero final compressive reaction within tolerance;
3. every active unilateral support has nonnegative reaction;
4. every inactive support has nonnegative separation gap;
5. released gravity loads are fully redistributed;
6. force, moment and complementarity residuals pass;
7. active-set history is deterministic and convergent;
8. source inputs remain immutable;
9. stale/tampered evidence blocks execution;
10. accuracy is stated only for qualified applicability classes;
11. the existing V2/V3 gravity methods remain unchanged;
12. the result is clearly labelled empirical screening, not FEA/code compliance.

---

## 14. Recommended disposition

The first production implementation should **not** attempt to derive vertical thermal movement for arbitrary routed piping from `alpha DeltaT L`. It should begin with source-backed hot vertical displacements or a small catalogue of independently benchmarked reduced-beam templates.

The safe sequence is:

```text
source displacement intake
  -> local lift-off candidate screening
  -> qualified influence-matrix active-set redistribution
  -> controlled LFEA/flexibility correlation
  -> opt-in production integration
```

This preserves the current gravity calculation while providing a technically defensible path to temperature-driven lift-off and reaction redistribution.
