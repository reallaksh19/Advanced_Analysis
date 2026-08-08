# AGENT 13 — Runtime SIF & K-Factor Calculator (B31J / B31.3 App. D) — Expert Work Pack

**Target audience:** an expert agent with genuine ASME B31J / B31.3 piping-mechanics
background, not a generalist coder. **Do not proceed past Part 1 until you have
answered every gate question with clause/table citations.** If you cannot cite a
specific clause, table, or appendix for a claim, say so explicitly — do not fill the
gap from memory. This repo has already been burned once by a memorized formula
(see Part 3.6); treat that as a standing instruction, not a one-off anecdote.

Scope of this first lot: **bends/elbows, tees/branch connections, and reducers.**
Output is a runtime calculator that ingests *live* geometry (staged canonical JSON
or CAESAR-style InputXML) and produces declared, sourced SIF (`i`) and flexibility
(`k`) factor records — it does **not** apply those factors to stiffness or stress
itself (see Part 4, ownership boundary).

---

## Part 1 — Expert Gate Questions (answer first, in writing, before touching code)

1. **Elbow pressure correction.** B31.3 Appendix D (pre-2020) derives a bend's `i_i`,
   `i_o` from a single flexibility characteristic `h` with no pressure term. B31J
   adds an internal-pressure stiffening correction to both `k` and `i` for elbows
   and bends. State the two independent variables that correction depends on
   besides `h`, and explain *physically* why raising internal pressure **reduces**
   both `k` and `i` (name the ovalization mechanism it suppresses) rather than
   increasing them, as intuition about "pressure adds stress" might suggest.

2. **Tee run vs. branch split.** B31.3 Appendix D Table D300 assigns a welding tee
   (per B16.9) **one** `i` value, shared identically by run and branch. B31J Table
   1-1 assigns run and branch **independent** `i_i`, `i_o`, `i_t` and `k` values,
   each from its own flexibility characteristic. Give the `h` formula B31J uses for
   the branch leg, name the geometric parameter that enters it with no equivalent
   in the shared pre-2020 formula, and explain why applying the old shared-`i`
   value at the branch of a tee with a large branch/run diameter ratio can be
   non-conservative.

3. **Reducer applicability.** Pre-2020 B31.3 Appendix D assigned reducers a flat
   `i = 1` with zero flexibility contribution. Under B31J, a computed reducer
   `i`/`k` is only valid inside stated cone-angle and diameter/thickness bounds.
   When a live-geometry reducer falls outside those bounds, is the code-compliant
   fallback (a) silently reuse `i = 1`, (b) refuse to emit a numeric factor and
   require a declared user override, or (c) something else — and where in the
   standard's own applicability language is that answer stated?

4. **Sustained index vs. displacement SIF.** B31J's Nonmandatory Appendix D
   (sustained stress factors) is a distinct deliverable from the ordinary
   displacement `i`. Name the B31.3 stress equation(s) each one is legitimately
   allowed to appear in (302.3.5 sustained vs. 302.3.6 expansion), and state what a
   code-compliant engine must do when a component has a published displacement `i`
   but no published sustained index — reuse displacement `i` for sustained stress,
   fall back to B31.3's own historic sustained multiplier, or refuse to compute
   sustained stress for that component? Justify from the standard, not convenience.

5. **Matching-pipe section modulus.** SIF/`k` must be applied with "the section
   modulus of the matching pipe," not the fitting's own average wall. For a
   concentric reducer whose large-end and small-end nominal wall thickness differ,
   which end's section modulus governs the stress computed at each end of the
   reducer element, and how must a runtime engine avoid silently using the wrong
   end's `Z` when the live geometry stream may expose only one generic
   `thickness`/`section` field per component (this repo's canonical geometry today
   stores a single declared thickness per segment — see Part 4.3)?

**Acceptance bar:** answers must cite clause/table numbers or Appendix letters, not
just paraphrase the concept. If your honest answer to any question is "I am not
certain without the primary text," say that, and treat resolving it as work item
0 of Part 5 — do not silently substitute your best guess into shipped code.

---

## Part 2 — Prerequisite: re-verify you're actually unblocked

Before writing any code, re-read `docs/OWNER_ROADMAP.md` in full (not a cached
summary). As of the last audit for this work pack, it explicitly deferred exactly
this work — "converting hardcoded engineering defaults — Appendix D SIFs/
flexibility, thermal coefficients, flexibility-matrix options, pressure-correction
options — into configurable/disclosed items" — until after a named benchmark arc
(M013/#496, M016/#517, M018/#531, M019/#535), which was merged at last check. **You
must independently confirm the current state of that arc and this deferral before
starting** — roadmaps drift, and this document will go stale. If the arc is not
actually closed, stop and escalate rather than proceeding on this document's
say-so.

Also, at last check the next free bucket slots were `check:lfea-b3.18` and
`check:lfea-b4.5` (`package.json`). **Do not assume that number.** Confirm the real
next free slot the same way M018 did: `git show origin/main:package.json` (or
current default branch) immediately before you name any script, bucket ID, or
`ruleId` string.

---

## Part 3 — Core Concepts You Must Get Right

### 3.1 The two-tier factor model
A component produces **two independent, related record types**, not one:
- a **flexibility factor** (`k`, and for tees the directional `k` set) consumed by
  whoever assembles element stiffness, and
- **SIF indices** (`i_i`, `i_o`, `i_t`, further split into displacement / sustained
  / occasional) consumed by whoever combines stress terms.
These are computed from overlapping but not identical geometry, and B31J treats
them as separate appendices (Appendix A = SIF development, Appendix B = branch
flexibility factors, Appendix C = how to use branch `k` in elastic analysis,
Appendix D = sustained stress factors). Don't conflate them into one blob.

### 3.2 Flexibility characteristic `h` is component-specific
Every component's `k` and `i` derive from its own `h`. Elbow, tee-run, and
tee-branch each have a **different** `h` formula; a reducer's applicability
condition is expressed differently again (cone angle / diameter ratio, not `h`).
Do not reuse one `h` formula across component types.

### 3.3 In-plane / out-of-plane / torsional are not the same number
B31J gives independent `i_i`, `i_o`, `i_t` (torsional need not be 1 — this is a
real change from legacy B31.3 practice of assuming `i_t = 1`). Carrying a single
"the SIF" number forward loses information the rest of this codebase's contract
(`displacementSifs.{axial,torsional,inPlaneBending,outOfPlaneBending}`) already
expects to keep.

### 3.4 Pressure stiffening is optional-but-real, and must be declared
B31J allows (and, for large-diameter thin-wall bends, expects) a pressure
correction to both `k` and `i`. It must be an explicit, toggleable, sourced input
(the existing contract already has a `pressureCorrectionApplied` / `pressureBasis`
pair for exactly this) — never silently baked in or silently omitted.

### 3.5 Reducers are a post-2020 code discontinuity
Pre-2020 B31.3 Appendix D: `i = 1`, flat, no flexibility. B31J (current): a
computed `i` that can run materially higher (public commentary cites values
approaching 2 for some geometries) — meaning any system previously qualified under
the old flat value may not automatically re-qualify. Treat "which edition is
active" as a first-class config input (Part 7), not an assumption.

### 3.6 The house rule: never assert a memorized formula as ground truth
This exact mistake already happened once in this repo (`docs/OWNER_ROADMAP.md`,
the M013 narrative): a recalled elbow formula (`h=tR/r_m²`, `k=1.65/h`,
`i=0.9/h^(2/3)` in-plane, `0.75/h^(2/3)` out-of-plane) was checked against
SIMFLEX-II's own published SIFs for that elbow (`i_i≈1.949`, `i_o≈1.624`) and came
out **~2.1× too high** — wrong coefficient or missing term, not a rounding
artifact. The fix was to derive every formula from the primary B31J/Appendix D
text with shown work and a citation, and to carry vendor cross-checks as
sanity-only, never as the source of truth. Do the same here: every numeric
constant/exponent in your implementation must have a `// SOURCE:` comment naming
the exact clause/table/appendix it came from. A magic number with no citation is a
defect, full stop.

---

## Part 4 — Repository Integration Contract (read the real files, this is a summary)

### 4.1 Ownership boundary — you are a producer, not a consumer
- `src/core/linear-fea-piping-components/` (bucket **B3.2**) is the *sole* owner
  of applying a flexibility factor to stiffness (`assertSingleFlexibilityOwnership`,
  `FLEXIBILITY_OWNER_PACKAGE_ID`). Its own README states plainly it "computes no
  SIF and reads no allowable... it also computes no B31J factor: a factor arrives
  as a declared factor set... and this package applies it to stiffness."
  Read `piping-component-contract.js`, `bend-component.js`, `branch-component.js`
  before writing anything — do not duplicate its stiffness-application logic.
- `src/core/linear-fea-b31-code-engine/` (bucket **B4.0**) owns combining stress
  terms (`stress-terms.js`) from an already-supplied `fea-b31-stress-factor-set/v1`
  record (`code-engine-contract.js`). It does not compute indices either.
- **Your new module computes both factor sets and emits them as sealed records.
  It must never call a stiffness-mutation function from B3.2 or a stress
  combination function from B4.0.** Enforce this with an import-boundary
  lint/test (Part 9.3), not a comment.

### 4.2 Exact record shapes you must produce
Flexibility side — schema `fea-linear-component-factor-set/v1`
(`COMPONENT_FACTOR_SET_KEYS`): `schema, factorSetId, componentType,
sourceIdentity{standard, edition, ruleId, sourceRevision, sourceSemanticHash},
applicability{status, evaluatedBy, ...}, flexibilityFactor{value, source},
flexibilityGeometryBasis, directionalFlexibilityFactors, pressureCorrectionApplied,
pressureBasis, userOverride, semanticHash`, sealed via `sealComponentFactorSet`.
`applicability.status` is one of `WITHIN_RANGE | OUTSIDE_RANGE |
USER_FACTOR_REQUIRED` — this is exactly your B31J/App-D range check, and
`flexibilityGeometryBasis` (`ARC_GEOMETRY_{EXCLUDED|INCLUDED}_V1` /
`JUNCTION_GEOMETRY_{EXCLUDED|INCLUDED}_V1`) is the explicit double-count boundary
you must declare correctly for bends vs. branch junctions.

Stress side — schema `fea-b31-stress-factor-set/v1` (`STRESS_FACTOR_SET_KEYS`):
`schema, factorSetId, componentId, sourceIdentity, applicability,
momentDirectionMapping{inPlaneField, outOfPlaneField}, sustainedIndices,
occasionalIndices, displacementSifs, userOverride, semanticHash` — each of
`sustainedIndices/occasionalIndices/displacementSifs` is a
`{axial, torsional, inPlaneBending, outOfPlaneBending}` set of independently
sourced `{value, source}` entries. `FLEXIBILITY_SIF_STANDARD = 'ASME_B31J_2023'`
is the current default standard tag — confirm this hasn't moved before reusing it.

Fixture precedent to match style-for-style:
`scripts/lfea-b3.2-piping-component-fixtures.mjs`'s `bendFactorSet()` uses
`sourceIdentity.standard: 'ASME_B31J_2023'`, `ruleId: 'TABLE-1-1-BEND'`,
`flexibilityFactor.source: 'PROJECT-B31J-FACTOR-DATASET'`. Your calculator is what
should be *generating* records like this from real geometry instead of a
hand-declared fixture — that is the entire point of this work pack.

### 4.3 A real, currently-open geometry gap — do not paper over it
- Bend geometry is present and usable today: InputXML `<BEND>` → canonical
  `segment.meta.bendDeclaredRadius / bendAngle1 / bendAngle2 / numMiter /
  bendArcCentre / bendComputedRadius`; `centerline-beam-fea/bend-geometry.js`
  (`discretiseBend`) derives radius/sweep from tangent points.
- **Tee run/branch diameters are not extracted anywhere yet.** Tees are currently
  detected only via the InputXML `SIF` tag's `TYPE` code (`SIF_TYPE_WELDING_TEE=3`,
  `SIF_TYPE_WELDOLET=5`) → canonical `type: 'TEE'`. `branch-component.js`
  classifies branch legs purely from direction vectors and explicitly *never*
  reads nominal diameter (`classification.diameterConsulted` is permanently
  `false`). Your `h_branch` formula needs a real branch/run diameter and
  thickness — that field does not exist in the canonical schema today.
- **Reducers have no large/small-diameter+length shape today.** The component
  contract's reducer input is `start, end, stations[{fraction, section}]`
  (`REDUCER_STEPPED_SECTION_V1`); a simple tapered/cone shape
  (`REDUCER_TAPERED_SECTION_V1`) is named but explicitly blocked/unimplemented.
  InputXML reducer tags are detected but classified merely as `type: 'PIPE'` with
  no distinct reducer geometry extracted.
- **InputXML SIF tags are parsed but deliberately not consumed** — retained as
  evidence only, with warning code `INPUTXML_SIF_PRESENT_NOT_COMPILED`, precisely
  so a vendor-declared SIF can't silently override a computed one. Your module
  should read this evidence and **report a diagnostic if your computed value
  disagrees with it**, never silently prefer one over the other without surfacing
  both.

**Work item 0, not an afterthought:** decide, and get sign-off, on whether closing
the branch/reducer geometry gap is (a) in-scope for this work pack as an explicit
canonical-geometry-schema extension (coordinate with whoever owns
`src/core/geometry/`), or (b) taken as a separate, versioned supplementary input
contract your module defines and requires. Either is acceptable; *inventing ad hoc
fields silently inside your module* is not — it will desync from the canonical
schema the first time someone else touches it.

---

## Part 5 — Technical Requirements

**Functional**
1. Pure, deterministic factor calculators for: bend/elbow (long-radius,
   short-radius, closely-spaced miter, widely-spaced miter — these have different
   `h` formulas, don't merge them), welding tee / reinforced fabricated tee /
   unreinforced fabricated tee / extruded outlet (each is a distinct B31J row, not
   one generic "tee"), and concentric/eccentric reducer.
2. Each calculator takes normalized geometry + material + (optional) design
   pressure and returns **both** record types from 4.2, fully sealed, never
   partially populated.
3. Explicit standard/edition selection (B31J 2017 / 2022 / 2023, legacy B31.3
   Appendix D pre-2020) as a required input, not a hardcoded default — see Part 7.
4. Applicability range checks are mandatory and gate the output status
   (`WITHIN_RANGE | OUTSIDE_RANGE | USER_FACTOR_REQUIRED`); out-of-range never
   silently degrades to a numeric guess.
5. Pressure-stiffening correction is implemented but independently toggleable and
   its basis recorded (`pressureCorrectionApplied`, `pressureBasis`).
6. Ingests both staged canonical JSON and InputXML-derived geometry through the
   same normalized internal shape — do not write two divergent code paths.

**Non-functional**
7. No I/O, no global state, no reliance on wall-clock or randomness — same input
   must always produce byte-identical output (needed for `semanticHash`).
8. Every public function has JSDoc stating its clause/table source.
9. Matches repo conventions exactly (Part 6) — this is a hard requirement, not a
   style preference; the existing review/gate tooling checks for it.

---

## Part 6 — Code Snippets & Conventions to Follow

Repo convention observed directly: pure ESM `.js`, no TypeScript, kebab-case
filenames, `SCREAMING_SNAKE` frozen constants/enums, camelCase functions, a
domain-specific `Error` subclass constructed as `(message, code)`, `fail(message,
code)` throw helper, and `require*` guard functions (`requireFinite`,
`requirePositive`, `requireMember`, `requireExactKeys`, `requireHash`).

```js
// src/core/linear-fea-b31-factor-calculator/errors.js
export class FactorCalculatorError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'FactorCalculatorError';
    this.code = code;
  }
}

export function fail(message, code) {
  throw new FactorCalculatorError(message, code);
}
```

```js
// src/core/linear-fea-b31-factor-calculator/bend-factors.js
//
// SOURCE: ASME B31J-2023, Table 1-1, "Butt Welding Elbow or Pipe Bend".
// h formula, k/i exponents, and the pressure-correction term below MUST be
// transcribed from the primary text with the clause/table number attached to
// EVERY constant. Do not fill in remembered coefficients — see AGENT_13
// work pack, Part 3.6. The values below are illustrative placeholders and
// are intentionally left unfilled pending that transcription.

import { fail } from './errors.js';
import { requirePositive, requireFinite } from './guards.js';

/**
 * Flexibility characteristic for a butt-welding elbow / pipe bend.
 * SOURCE: <clause/table — fill in after primary-text derivation>
 * @param {number} nominalWallThickness  T, matching-pipe nominal wall
 * @param {number} bendRadius            R1, centerline bend radius
 * @param {number} meanPipeRadius        r2, mean radius of matching pipe
 */
export function bendFlexibilityCharacteristic({
  nominalWallThickness,
  bendRadius,
  meanPipeRadius,
}) {
  requirePositive(nominalWallThickness, 'nominalWallThickness');
  requirePositive(bendRadius, 'bendRadius');
  requirePositive(meanPipeRadius, 'meanPipeRadius');
  // h = <derive from primary text; cite clause>
  fail('bendFlexibilityCharacteristic: formula not yet transcribed from primary source', 'FORMULA_NOT_SOURCED');
}

/**
 * Applicability verdict for a computed bend factor set.
 * SOURCE: <clause defining the valid h / D/t range — cite it>
 */
export function classifyBendApplicability({ h, diameterToThicknessRatio }) {
  requireFinite(h, 'h');
  requireFinite(diameterToThicknessRatio, 'diameterToThicknessRatio');
  // Never default to WITHIN_RANGE. Absence of a check is a defect, not a pass.
  fail('classifyBendApplicability: range not yet transcribed from primary source', 'RANGE_NOT_SOURCED');
}
```

```js
// src/core/linear-fea-b31-factor-calculator/factor-set-builder.js
//
// Assembles the two sealed records (Part 4.2) from a calculator's raw output.
// This is the ONLY place that talks to the B3.2 / B4.0 contract modules —
// keep every component-specific formula file free of contract-shape knowledge.

import { sealComponentFactorSet } from '../linear-fea-piping-components/piping-component-contract.js';
// NOTE: import the stress-factor-set sealing function from code-engine-contract.js
// once you've confirmed its real export name — do not assume it matches the
// flexibility-side name.

export function buildBendFactorSets({ geometry, standard, pressureInput, sourceIdentity }) {
  // 1. compute h, applicability, k, i_i, i_o, i_t via bend-factors.js
  // 2. assemble COMPONENT_FACTOR_SET_KEYS shape -> sealComponentFactorSet(...)
  // 3. assemble STRESS_FACTOR_SET_KEYS shape -> seal via B4.0's own sealer
  // 4. return { flexibilityFactorSet, stressFactorSet } — never return one
  //    without the other; a caller needing only one still gets both records
  //    so the two stay traceable to the same sourceIdentity/componentId.
}
```

```js
// src/core/linear-fea-b31-factor-calculator/geometry-adapter.js
//
// Normalizes EITHER staged canonical JSON OR InputXML-derived canonical
// geometry into one internal shape, so bend-factors.js / tee-factors.js /
// reducer-factors.js never branch on input source.

export function normalizeComponentGeometry(segment, { source }) {
  if (segment.type === 'BEND') {
    // pull segment.meta.bendDeclaredRadius / bendAngle1 / bendAngle2 / numMiter
  }
  if (segment.type === 'TEE') {
    // GAP (Part 4.3): run/branch diameter is not in canonical geometry today.
    // Fail closed rather than guessing:
    if (segment.meta?.runDiameter == null || segment.meta?.branchDiameter == null) {
      throw Object.assign(
        new Error('TEE geometry missing runDiameter/branchDiameter — see AGENT_13 Part 4.3'),
        { code: 'SIF_K_INPUT_INCOMPLETE' },
      );
    }
  }
  // REDUCER: same fail-closed pattern for largeDiameter/smallDiameter/coneLength.
}
```

---

## Part 7 — Configuration Schema

```js
// src/core/linear-fea-b31-factor-calculator/config.js
export const FACTOR_STANDARD = Object.freeze({
  B31J_2017: 'ASME_B31J_2017',
  B31J_2022: 'ASME_B31J_2022',
  B31J_2023: 'ASME_B31J_2023',
  B31_3_APPENDIX_D_LEGACY: 'ASME_B31_3_APPENDIX_D_LEGACY', // pre-2020, i=1 for reducers
});

export const DEFAULT_FACTOR_CALCULATOR_CONFIG = Object.freeze({
  standard: FACTOR_STANDARD.B31J_2023,       // must be explicit, never implicit
  applyPressureStiffening: true,             // toggleable, recorded on output
  unitSystem: 'SI',                          // resolved once, from canonical geometry units
  benchmarkRelativeTolerance: 0.005,         // 0.5% — see Part 8, these are closed-form
  failClosedOnMissingGeometry: true,         // never defaults to a guessed factor
});
```

Config must be threaded explicitly through every call — no module-level default
that a caller can silently inherit without knowing which standard/edition they got.

---

## Part 8 — Benchmark Requirements (zero errors, non-negotiable)

Follow the repo's existing paired convention exactly:
`scripts/lfea-<bucket>-<name>-fixtures.mjs` (builds sealed inputs/expected outputs)
+ `scripts/lfea-<bucket>-<name>-check.mjs` (asserts via `node:assert/strict`,
`assertClose(actual, expected, relTol, msg)`, `expectCode(body, code)` for
fail-closed paths, a `test(id, name, body)` logger printing `${id} PASS ${name}`).
Wire it into a real `check:lfea-b3.<N>` / `check:lfea-b4.<N>` npm script (confirmed
free slot per Part 2) and into the `check:lfea-linear-core` aggregate.

**Minimum 3 independent, cited benchmark samples per fitting type (9 total
minimum):**

- **Bends (3):** at minimum, reproduce the repo's own known-good anchor —
  Appendix S Example 1's long-radius 90° elbow, cross-checked against
  SIMFLEX-II's published `i_i≈1.949`, `i_o≈1.624` (per `docs/OWNER_ROADMAP.md`,
  M013) — plus two more independently sourced elbows (a different `h` range;
  ideally one short-radius, one large-diameter/thin-wall where pressure
  stiffening materially changes the result).
- **Tees (3):** three distinct fabrication types (e.g., B16.9 welding tee,
  reinforced fabricated tee, unreinforced fabricated tee) with published or
  hand-derived-and-shown reference `i`/`k` for both run and branch legs.
- **Reducers (3):** three cone-angle/diameter-ratio combinations spanning inside
  and outside the applicability envelope, so at least one case must exercise the
  `OUTSIDE_RANGE`/`USER_FACTOR_REQUIRED` path, not just the happy path.

**Tolerance:** these are closed-form deterministic formulas — tolerance should be
tight (≤0.5% relative, per `DEFAULT_FACTOR_CALCULATOR_CONFIG`), not a "close
enough" band. A wide tolerance is itself a signal the formula is unverified.

**"Zero errors" means:** every check script exits 0, no `NaN`/`Infinity`/negative
flexibility or SIF values in any case, no unhandled promise/exception, and every
constant traces to a citation (Part 9.1 enforces this mechanically).

**Every benchmark's source must be recorded** — reuse the existing
`sourceStatus ∈ {VERIFIED, PENDING_NUMERIC_EXTRACTION, HAND_CALC,
SPL2_REFERENCE}` vocabulary from `benchmarks/schema/benchmarkCase.schema.json`. A
case with `sourceStatus: HAND_CALC` must show the hand calculation in the fixture
file's comments, not just assert a bare number.

---

## Part 9 — Anti-Drift Tests (in addition to the benchmark suite above)

9.1 **Formula-provenance lint.** A test that scans the new module's source for
    numeric literals in formula bodies and fails if any lacks an adjacent
    `// SOURCE:` comment naming a clause/table/appendix. No exceptions for
    "obvious" constants (0.9, 0.75, 1.65, etc. are exactly the kind of thing that
    was wrong last time).

9.2 **M013 regression fixture.** Recompute the Appendix S Example 1 elbow and
    assert the result is within tolerance of SIMFLEX-II's published `i_i≈1.949`,
    `i_o≈1.624` — as a literal, permanent regression test, not a one-time sanity
    check during development. This is the exact case that caught the ~2.1×
    error before; keep it running forever.

9.3 **Ownership-boundary import guard.** A static test asserting this module never
    imports a stiffness-mutation export from `linear-fea-piping-components` or a
    stress-combination export from `linear-fea-b31-code-engine` — it may only
    import their *contract* modules (for shape/sealing) and construct records.

9.4 **Monotonicity/property tests over a geometry sweep**, not just point checks:
    for bends, `k` and `i` must strictly decrease as `h` increases (asymptotic
    `1/h`, `1/h^(2/3)` trend); for reducers, `i` must trend toward 1 as cone angle
    approaches 0 (degenerating to straight pipe). A property test sweeping dozens
    of synthetic geometries catches sign/exponent errors a handful of point
    benchmarks can miss.

9.5 **Dual-input-path equivalence test.** Feed the same physical component through
    the staged-JSON path and the InputXML path and assert identical (or
    documented-tolerance) output — catches silent unit mismatches (mm vs. in,
    degrees vs. radians) between the two adapters.

9.6 **Fail-closed applicability test.** Construct geometry deliberately just
    outside the applicability envelope and assert the module returns
    `OUTSIDE_RANGE`/`USER_FACTOR_REQUIRED` — never a numeric factor, never a
    silent clamp to the boundary value.

9.7 **No-default-to-1.0 test.** Assert there is no code path that returns
    `i = 1` or `k = 1` as a catch-all default (the pre-2020 reducer default is a
    real, cited value for a real, cited condition — it must arrive as a sourced
    branch of logic, never as an uncaught-exception fallback).

---

## Part 10 — Deliverables Checklist

- [ ] Written, cited answers to all 5 gate questions (Part 1)
- [ ] Re-verification note confirming Part 2's prerequisite is still true, with
      the actual current next-free bucket slot
- [ ] Bend, tee, reducer calculator modules with every constant sourced
- [ ] Config module (Part 7) with explicit standard/edition selection
- [ ] Geometry gap decision recorded (Part 4.3, work item 0) — schema extension
      PR or a versioned supplementary contract, not silent invention
- [ ] ≥9 benchmark fixtures (3 per fitting type) + paired check scripts, wired
      into a real npm script and the `check:lfea-linear-core` aggregate, all
      exiting 0
- [ ] All 7 anti-drift tests (Part 9) implemented and passing
- [ ] A short handoff doc (`docs/agent-handoffs/AGENT_14_...md`, confirm the real
      next number) summarizing what was built, what standard/edition was used,
      and any applicability gaps discovered
