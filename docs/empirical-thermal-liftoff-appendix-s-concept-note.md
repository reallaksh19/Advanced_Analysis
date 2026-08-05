# Standalone Empirical Vertical Response and Thermal Lift-Off Concept Note

**Method family:** `EMPIRICAL_BEAM_CONTACT_V1`  
**Benchmark:** ASME B31.3-2006 Appendix S Examples 1–3  
**Date:** 5 August 2026  
**Status:** qualified concept and deterministic benchmark; no default runtime/UI cutover

---

## 1. Executive decision

The empirical vertical-load and lift-off method shall have **no numerical or runtime dependency on LFEA**.

It shall not consume:

- LFEA displacement results;
- LFEA reactions;
- LFEA stiffness or flexibility matrices;
- LFEA element or mesh records;
- LFEA result-recovery records;
- any solver-generated value as a runtime input.

All calculated values are derived directly from declared engineering inputs:

```text
centreline geometry
+ pipe/component dimensions
+ material E, G, density and thermal expansion
+ fluid/insulation/component weight
+ bend or tee flexibility factors
+ temperatures
+ support type, direction and gap
-> empirical closed-form member coefficients
-> SUS response
-> OPE response
-> unilateral-contact active set
-> vertical reactions, displacement and lift-off state
```

Appendix S published values are used only as independent benchmark targets. They are never calculation inputs.

---

## 2. Intended outputs

For every support and declared load case, the method produces:

- vertical reaction;
- vertical displacement;
- support state: `ACTIVE`, `LIFTED` or `BILATERAL_ACTIVE`;
- cold/SUS reaction;
- OPE reaction after thermal redistribution;
- attached trial reaction for any released rest;
- active-set iteration history;
- total vertical force residual;
- method and input identity.

The initial application classes are:

```text
SUS  = gravity and sustained weight state
OPE  = SUS + thermal strain + support-contact changes
```

Pressure may modify an elbow flexibility factor when the selected code-derived factor requires it. Pressure thrust and Bourdon effects are excluded unless separately declared.

---

## 3. Empirical mechanical basis

The term *empirical* here means a bounded, standalone reduced engineering method assembled from closed-form member relations. It is not connected to the repository’s general LFEA architecture and does not expose a general-purpose finite-element contract.

### 3.1 Pipe section

For outside diameter `Do` and inside diameter `Di`:

```text
A = pi/4 (Do^2 - Di^2)
I = pi/64 (Do^4 - Di^4)
J = 2I            [circular section]
```

Pipe-wall mass per unit length:

```text
m_pipe = A rho
```

Total sustained line load:

```text
w = g (m_pipe + m_contents + m_insulation)
```

Component masses are represented by their declared finite body or exact point-load location. No hidden default mass is permitted.

### 3.2 Axial and bending coefficients

Each straight or reduced bend segment uses direct closed-form beam coefficients.

Axial coefficient:

```text
k_a = EA/L
```

Principal bending coefficients:

```text
12EI/L^3
6EI/L^2
4EI/L
2EI/L
```

These coefficients are rotated from the member centreline basis to the declared global basis and assembled only over the route nodes required by the empirical model.

### 3.3 Distributed load equivalents

For a uniform transverse load `q` over member length `L`:

```text
end shear = qL/2
end moment = +/- qL^2/12
```

For a uniform axial load `qx`:

```text
end axial load = qx L/2
```

The equivalent member loads preserve total force and member-level moment.

### 3.4 Thermal strain

For a constant mean thermal-expansion coefficient:

```text
epsilon_th = alpha DeltaT
Delta_free = alpha DeltaT L
N_th,restrained = EA alpha DeltaT
```

`EA alpha DeltaT` is not imposed as a universal system force. It enters each member’s compatibility equations; the route geometry, flexibility and boundary conditions determine the final displacements and reactions.

### 3.5 Elbow flexibility

For the Appendix S Example 1 and 2 benchmark, each 90-degree elbow is represented by two centreline chord segments. The bending rigidity of those segments is reduced as:

```text
(EI)_effective = EI/k
```

where `k` is the independently derived pressure-corrected elbow flexibility factor.

The physical arc length is retained for gravity weight. The chord geometry is used for displacement compatibility.

### 3.6 Tee and meter representation

For Appendix S Example 3:

- tee flexibility factor is `k = 1` for the declared Appendix D welding-tee basis;
- each tee is represented by exact 0.10 m centreline stubs;
- each 2,000 lb meter occupies its full 1.52 m published length;
- the meter annular area is derived from its stated mass, material density and length.

---

## 4. Sustained response

The SUS calculation contains gravity and declared sustained weights.

For bilateral anchors, vertical reactions may act upward or downward.

For unilateral rest supports:

```text
R_i >= 0
```

A gravity-only support with a negative reaction is released and the complete gravity state is recalculated. A negative value is never clamped to zero while other reactions are retained.

SUS displacement is the elastic gravity deflection relative to the declared cold support positions.

---

## 5. Operating response and lift-off

OPE starts with the converged SUS contact set and adds uniform member thermal strain.

For an assumed active support set:

1. assemble gravity and thermal member coefficients;
2. solve route compatibility;
3. calculate support reactions;
4. release every unilateral rest requiring downward tension;
5. rebuild the support set and recalculate the entire response;
6. repeat until no inadmissible contact remains.

The contact conditions are:

```text
R_i >= 0
g_i >= 0
R_i g_i = 0
```

where `R_i` is upward support-on-pipe reaction and `g_i` is pipe-to-support separation.

A released support has:

```text
R_i = 0
g_i > 0
```

The method retains the attached trial reaction as lift-off evidence.

---

## 6. Buckling boundary

The present benchmark is a small-displacement, pre-buckling calculation.

All axial force required for stability screening must be calculated internally from the same empirical member network. No external solver force may be injected.

For a qualified isolated span, the first screening quantity is:

```text
P_cr = pi^2 E I_eff / (K_L L_eff)^2
eta_b = P_compression / P_cr
```

The check is repeated after every support release because `L_eff` and end restraint may change.

The method shall return `DETAILED_NONLINEAR_METHOD_REQUIRED` rather than publish final reactions when:

- the approved pre-buckling utilisation is exceeded;
- tangent stiffness becomes non-positive or near-singular;
- large displacement or snap-through is indicated;
- local pipe-wall buckling, ovalisation or wrinkling may govern.

Post-buckling reactions are outside `EMPIRICAL_BEAM_CONTACT_V1`.

---

## 7. Appendix S benchmark authority

This concept uses independently declared facts from the Appendix S examples. It does not import the repository’s existing LFEA fixtures.

### 7.1 Example 1

Principal benchmark facts:

- NPS 16 standard-wall carbon-steel route;
- two 90-degree elbows;
- anchors at nodes 10 and 50;
- vertical rest at node 20;
- installation temperature 21 degrees C;
- operating temperature 260 degrees C;
- pressure-corrected bend flexibility `k = 9.506141774188135`;
- published operating vertical displacements and support loads are available.

### 7.2 Example 2

Principal benchmark facts:

- symmetric extension of the Example 1 route;
- anchors at nodes 10 and 110;
- vertical rests at nodes 20, 50 and 120 in the cold trial state;
- installation temperature 21 degrees C;
- operating temperature 288 degrees C;
- pressure-corrected bend flexibility `k = 9.36566184176338`;
- the apex rest at node 50 lifts in the operating case;
- published operating vertical support loads are available;
- no retained published numeric apex uplift is used as a target.

### 7.3 Example 3

Principal benchmark facts:

- NPS 24 header and NPS 20 branches;
- six tee junctions;
- two 2,000 lb meters over 1.52 m each;
- all centreline geometry lies in the global X-Z plane;
- vertical gravity acts in global Y;
- Appendix S Example 3 principally publishes thermal actions and stress ranges, not a vertical support-load/displacement table.

Accordingly, Example 3 is used to demonstrate internally calculated SUS vertical response and exact first-order vertical invariance between SUS and OPE. It is not represented as an external vertical-value validation.

---

## 8. Calculated benchmark results

All values below are produced by the standalone script `scripts/empirical-appendix-s-vertical-benchmark.mjs`.

### 8.1 Example 1 — vertical support results

Positive reaction is upward support-on-pipe.

| Support | SUS reaction, N | SUS displacement, mm | OPE reaction, N | OPE displacement, mm | Published OPE reaction, N |
|---|---:|---:|---:|---:|---:|
| 10 | 11,695.913 | 0 | 12,794.816 | 0 | 12,710 |
| 20 | 46,315.526 | 0 | 63,914.785 | 0 | 63,050 |
| 50 anchor | 15,003.287 | 0 | -3,694.875 | 0 | -2,810 |

Force equilibrium:

```text
SUS applied weight      = 73,014.725842 N
SUS support total       = 73,014.725842 N
OPE applied weight      = 73,014.725842 N
OPE support total       = 73,014.725842 N
```

The downward OPE reaction at node 50 is admissible because node 50 is an anchor, not a unilateral rest.

### 8.2 Example 1 — published operating vertical displacement benchmark

| Location | Empirical OPE, mm | Published, mm | Absolute deviation, mm |
|---|---:|---:|---:|
| 10 | 0.000 | 0.0 | 0.000 |
| 15 | -1.312 | -1.3 | 0.012 |
| 20 | 0.000 | 0.0 | 0.000 |
| 30 near | -3.247 | -3.7 | 0.453 |
| 30 mid | -1.701 | -2.3 | 0.599 |
| 30 far | 1.174 | 0.4 | 0.774 |
| 40 near | 15.832 | 15.1 | 0.732 |
| 40 mid | 18.715 | 17.8 | 0.915 |
| 40 far | 20.183 | 19.2 | 0.983 |
| 45 | 14.305 | 13.5 | 0.805 |
| 50 | 0.000 | 0.0 | 0.000 |

Maximum absolute displacement deviation:

```text
0.983443 mm
```

The benchmark uses the existing Appendix S interpretation that the published values are rounded commercial-program averages. The acceptance tolerance is the larger of 8% or 1.5 mm.

### 8.3 Example 2 — sustained state

| Support | SUS reaction, N | SUS displacement, mm | State |
|---|---:|---:|---|
| 10 | 11,707.289 | 0 | anchor |
| 20 | 46,313.227 | 0 | active rest |
| 50 | 29,988.418 | 0 | active rest |
| 120 | 46,313.227 | 0 | active rest |
| 110 | 11,707.289 | 0 | anchor |

Maximum absolute SUS free-node displacement:

```text
-7.433820 mm at the B140 far-side tangent location
```

### 8.4 Example 2 — operating state with lift-off

The first attached-support trial gives:

```text
R_50,attached = -12,841.828518 N
```

A unilateral rest cannot supply this downward tensile force. Node 50 is therefore released and the full operating case is recalculated.

| Support | Final OPE reaction, N | Final OPE displacement, mm | Published OPE reaction, N | State |
|---|---:|---:|---:|---|
| 10 | 14,353.690 | 0 | 14,050 | anchor |
| 20 | 58,661.036 | 0 | 58,900 | active rest |
| 50 | 0 | +22.050 | not published numerically | lifted |
| 120 | 58,661.036 | 0 | 58,900 | active rest |
| 110 | 14,353.690 | 0 | 14,050 | anchor |

Operating force equilibrium after release:

```text
applied weight          = 146,029.451683 N
active-support total    = 146,029.451683 N
force residual          = approximately 1.3e-8 N
```

The maximum calculated OPE vertical displacement is:

```text
+27.650551 mm at node 145
```

The apex uplift of `+22.050123 mm` is a calculated empirical result. It is not claimed as an Appendix S numeric displacement validation because no retained published apex displacement target is used.

### 8.5 Example 3 — calculated vertical response

| Support | SUS reaction, N | OPE Case 1 reaction, N | OPE Case 2 reaction, N | Vertical displacement, mm |
|---|---:|---:|---:|---:|
| 10 | 3,785.332 | 3,785.332 | 3,785.332 | 0 |
| 110 | 10,233.077 | 10,233.077 | 10,233.077 | 0 |
| 140 | 10,233.077 | 10,233.077 | 10,233.077 | 0 |
| 210 | 10,233.077 | 10,233.077 | 10,233.077 | 0 |
| 240 | 10,233.077 | 10,233.077 | 10,233.077 | 0 |
| 310 | 3,785.332 | 3,785.332 | 3,785.332 | 0 |

Maximum gravity deflection:

```text
-0.034445 mm at a meter end
```

Total vertical load and reactions:

```text
applied weight          = 48,502.970409 N
support total           = 48,502.970409 N
```

For this exact planar benchmark:

```text
OPE vertical reaction - SUS vertical reaction = 0
OPE vertical displacement - SUS displacement = 0
```

This is a geometric first-order result: uniform thermal strain acts in the X-Z route plane and has no global-Y term. This does not imply that thermal expansion has no vertical effect in a general three-dimensional route.

---

## 9. Benchmark disposition

| Example | SUS vertical calculated | OPE vertical calculated | Lift-off | External vertical benchmark |
|---|---|---|---|---|
| Appendix S 1 | yes | yes | no unilateral release | published loads and displacements |
| Appendix S 2 | yes | yes | node 50 released | published support loads; no numeric uplift target used |
| Appendix S 3 | yes | yes | none | no published vertical target; invariance demonstration only |

The benchmark demonstrates that the standalone formulas can reproduce the Appendix S Example 1 and 2 vertical behavior without consuming any LFEA result or model object.

---

## 10. Applicability and exclusions

`EMPIRICAL_BEAM_CONTACT_V1` is suitable only when:

- material response is linear elastic;
- displacement and rotation remain small;
- centreline geometry is known;
- section and mass data are declared;
- bend/tee flexibility treatment is within its source applicability;
- supports can be represented as fixed, bilateral or frictionless unilateral vertical contacts;
- there is no significant friction coupling;
- spring supports are either excluded or represented by a separately qualified linear rule;
- the pre-buckling stability gate passes.

It does not presently include:

- Coulomb friction;
- guide and line-stop gaps in horizontal directions;
- nonlinear spring hanger curves;
- large-displacement geometry;
- snap-through or post-buckling;
- local shell ovalisation or wrinkling;
- code stress evaluation;
- nozzle flexibility;
- soil interaction.

These exclusions shall produce explicit blockers, not silent zero effects.

---

## 11. Production architecture

The production path should remain separate from the existing gravity-only V2/V3 methods:

```text
empirical route/member input
-> EMPIRICAL_BEAM_CONTACT_V1 package
-> SUS calculation
-> OPE thermal calculation
-> unilateral-contact active set
-> stability gate
-> immutable vertical-response receipt
-> opt-in report/presenter
```

Proposed contracts:

```text
empirical-beam-contact-input/v1
empirical-beam-contact-execution/v1
empirical-beam-contact-benchmark/v1
```

No ordinary workspace or UI cutover is authorized by this concept note.

---

## 12. Acceptance gates for production promotion

1. No import or dependency on LFEA modules.
2. All runtime values trace to declared empirical inputs and formulas.
3. Example 1 published OPE vertical loads and displacements pass the declared tolerance.
4. Example 2 attached apex reaction is tensile and causes deterministic support release.
5. Example 2 final reactions recover total gravity force after lift-off.
6. Example 3 identifies the absence of a published vertical target and does not fabricate one.
7. SUS and OPE results are deterministic and hash-bound.
8. Negative rest reactions are never merely clamped.
9. Source inputs remain immutable.
10. Buckling or large-displacement risk blocks final empirical reaction publication.
11. Existing V2/V3 gravity methods remain unchanged.
12. Results are labelled empirical reduced-order calculations, not code compliance or general nonlinear analysis.

---

## 13. Conclusion

A fully standalone empirical method is feasible for the requested vertical SUS, SUS displacement, OPE reaction, OPE displacement and thermal lift-off outputs.

The Appendix S benchmark demonstrates:

- close reproduction of Example 1 operating vertical displacement and support load;
- correct Example 2 apex lift-off and complete load redistribution;
- correct Example 3 first-order vertical invariance for an exactly planar route;
- no numerical dependency on LFEA.

The next step is to convert this benchmark-only method into a governed input/execution/receipt contract while preserving the same hard separation and applicability limits.
