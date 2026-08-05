# Standalone Empirical Piping Beam, Contact, Action-Recovery and Sustained-Stress Method

## Engineering Basis, Calculation Specification and ASME B31.3 Appendix S Benchmark

**Document ID:** `EMP-PROD-05B-EBR-001`  
**Method family:** `EMPIRICAL_BEAM_CONTACT_V1`  
**Repository:** `reallaksh19/Advanced_Analysis`  
**Date:** 5 August 2026  
**Status:** core engineering specification for implementation and qualification; no default runtime/UI authority  
**Supersedes:** the narrow vertical-response concept basis only where this document explicitly extends it  

---

## 1. Executive decision

`EMPIRICAL_BEAM_CONTACT_V1` is a standalone reduced-order piping-mechanics method. It shall calculate displacement, reaction, support-contact state, axial force, shear, bending moment, torsion where qualified, and sustained-stress input quantities directly from declared geometry, material, mass, pressure, temperature and support evidence.

It shall have **no numerical or runtime dependency on LFEA**. It shall not consume:

- LFEA stiffness or flexibility matrices;
- LFEA displacement or rotation results;
- LFEA reactions;
- LFEA element actions or recovered stresses;
- LFEA mesh, element or solver records;
- any general solver result as a runtime input.

The calculation chain is:

```text
source-bound engineering inputs
→ direct mechanics and code-derived formulas
→ adopted empirical member/contact representation
→ SUS and OPE compatibility solution
→ active-set support state
→ member action recovery
→ code-stress calculation
→ equilibrium, convergence and benchmark evidence
```

ASME B31.3 Appendix S values are independent qualification targets. They shall never be used as ordinary runtime inputs, tuning constants or hidden calibration values.

---

## 2. Purpose

This document is the engineering source of truth for:

1. direct mechanics formulas;
2. code-derived formulas and their edition authority;
3. adopted empirical approximations;
4. input and output definitions;
5. calculation sequence;
6. worked numerical examples;
7. Appendix S benchmark evidence;
8. error metrics and acceptance criteria;
9. failure and applicability boundaries;
10. implementation contracts and tests;
11. controlled future enhancements, including preliminary structural-support screening.

Where code and this document disagree, the implementation is unqualified until the discrepancy is resolved and benchmarked.

---

## 3. Authority classification

Every formula, rule and numerical value shall be classified.

| Classification | Meaning |
|---|---|
| `DIRECT_MECHANICS` | Closed-form mechanics relation independent of a piping code |
| `CODE_FORMULA` | Formula or factor bound to a named standard and edition |
| `DERIVED_RELATION` | Algebraic combination of direct or code formulas |
| `ADOPTED_EMPIRICAL` | Deliberate reduced-order representation selected for this method |
| `NUMERICAL_ALGORITHM` | Assembly, solution, active-set or convergence procedure |
| `BENCHMARK_REFERENCE` | Published target used only for qualification |
| `ACCEPTANCE_RULE` | Project qualification tolerance or blocking rule |

Example notation:

```text
[DIRECT_MECHANICS — EMP-SEC-001]
A = π/4 (Do² − Di²)
```

```text
[ADOPTED_EMPIRICAL — EMP-BND-010]
A 90° elbow is represented by eight deterministic equal-angle centreline segments.
```

A developer shall not treat an `ADOPTED_EMPIRICAL` rule as a code requirement.

---

## 4. Source hierarchy

Use the following priority:

1. licensed governing code or standard, exact edition;
2. project-approved material, section and allowable datasets;
3. Appendix S benchmark tables and example geometry;
4. direct mechanics relations;
5. this method's declared empirical approximations;
6. benchmark tolerances and regression controls.

No formula may be sourced from memory when an edition-specific authority is required. The implementation shall retain the source identity, edition, table/paragraph identifier where available, and any applied note or correction.

Primary benchmark references for this method are:

- ASME B31.3-2006 Appendix S Examples 1, 2 and 3;
- ASME B31.3-2006 Appendix D, Table D300 and applicable notes for flexibility and stress factors;
- Appendix S Table S302.6.3, sustained forces, moments and stresses for Sustained Condition 3;
- direct Euler–Bernoulli beam and frame relations used as independent mechanics benchmarks.

The repository shall not reproduce licensed code text beyond the minimum numerical and formula evidence required for an auditable benchmark.

---

## 5. Scope

### 5.1 Qualified method intent

The initial method is intended for:

- linear-elastic piping centreline models;
- small displacement and small rotation;
- straight pipe members;
- qualified segmented elbows with declared flexibility factors;
- declared tee/junction approximations;
- distributed pipe, contents and insulation weight;
- finite component weights and point masses;
- uniform member thermal strain;
- bilateral anchors and restraints;
- frictionless unilateral vertical rests;
- lift-off through active-set recalculation;
- SUS and OPE displacement and reaction;
- member end actions and internal bending-moment extrema;
- sustained longitudinal stress using a separately declared B31.3 edition dataset.

### 5.2 Explicit exclusions until separately qualified

The following are outside the current qualified scope:

- large-displacement geometry;
- post-buckling response;
- local pipe ovalisation, wrinkling or shell effects;
- plasticity, creep or ratcheting;
- friction and sliding contact;
- nonlinear springs, snubbers or hysteresis;
- soil interaction;
- dynamic, seismic, water-hammer or slug-flow response;
- fatigue and cumulative usage;
- nozzle flexibility or equipment-shell compliance;
- unqualified branch flexibility or SIF application;
- structural steel code qualification;
- base plate, anchor bolt or foundation design.

A request outside the qualified scope shall return a blocking disposition rather than a plausible-looking extrapolation.

---

## 6. Coordinate, sign and reporting conventions

### 6.1 Global and local axes

Each member has:

- a local axial direction `x` along its centreline from end `I` to end `J`;
- local transverse directions `y` and `z` formed by a deterministic axis rule;
- global axes declared by the model.

Appendix S Examples 1 and 2 are treated as planar systems. Example 3 is treated as a grillage-type vertical response in the global X–Z route plane with global Y vertical.

### 6.2 Force and moment signs

The implementation shall publish:

- signed global actions;
- signed local end actions;
- magnitudes only where the code formula explicitly requires them;
- the projection tangent used at each bend station.

For support reporting:

- positive vertical reaction means upward support-on-pipe force;
- a negative reaction at a unilateral rest is inadmissible tension and triggers release;
- a negative reaction at a bilateral anchor may be admissible.

### 6.3 Error reporting

Ordinary relative error is:

\[
e_r = 100\frac{|X_{emp}-X_{ref}|}{|X_{ref}|}
\]

Absolute error is:

\[
e_a = |X_{emp}-X_{ref}|
\]

For a near-zero reference, raw percentage shall not govern. Report:

- absolute error;
- tolerance utilisation;
- error normalised to the benchmark peak or another declared scale;
- `N/A_NEAR_ZERO_REFERENCE` for pointwise percentage.

---

## 7. Formula register

| Formula ID | Quantity | Class | Formula or rule |
|---|---|---|---|
| `EMP-SEC-001` | Pipe metal area | Direct mechanics | \(A=\pi(D_o^2-D_i^2)/4\) |
| `EMP-SEC-002` | Second moment of area | Direct mechanics | \(I=\pi(D_o^4-D_i^4)/64\) |
| `EMP-SEC-003` | Polar second moment | Direct mechanics | \(J=2I\) for a circular section |
| `EMP-SEC-004` | Elastic section modulus | Direct mechanics | \(Z=2I/D_o\) |
| `EMP-WGT-001` | Pipe mass/length | Derived | \(m_p=\rho A\) |
| `EMP-WGT-002` | Total line load | Derived | \(w=g(m_p+m_f+m_i+m_d)\) |
| `EMP-BM-001` | Axial coefficient | Direct mechanics | \(EA/L\) |
| `EMP-BM-002` | Bending coefficient | Direct mechanics | \(12EI/L^3\) |
| `EMP-BM-003` | Bending coefficient | Direct mechanics | \(6EI/L^2\) |
| `EMP-BM-004` | Bending coefficient | Direct mechanics | \(4EI/L\) |
| `EMP-BM-005` | Bending coefficient | Direct mechanics | \(2EI/L\) |
| `EMP-LOD-001` | UDL end shear | Direct mechanics | \(qL/2\) |
| `EMP-LOD-002` | UDL fixed-end moments | Direct mechanics | \(\pm qL^2/12\) |
| `EMP-THM-001` | Thermal strain | Direct mechanics | \(\epsilon_{th}=\alpha\Delta T\) |
| `EMP-THM-002` | Free expansion | Derived | \(\Delta_{free}=\alpha\Delta TL\) |
| `EMP-BND-001` | Bend characteristic | Code formula | \(h=tR/r^2\) |
| `EMP-BND-002` | Bend flexibility | Code formula | edition-bound Appendix D relation |
| `EMP-BND-003` | Pressure correction | Code formula | edition-bound Appendix D note |
| `EMP-BND-010` | Segmented elbow | Adopted empirical | eight equal-angle segments per 90° elbow |
| `EMP-CNT-001` | Contact conditions | Direct mechanics | \(R\ge0, g\ge0, Rg=0\) |
| `EMP-ACT-001` | Local end-action recovery | Direct mechanics | \(f_e=k_ed_e-f_e^0\) |
| `EMP-ACT-002` | Internal moment | Direct mechanics | \(M(x)=M_i+V_ix-qx^2/2\) |
| `EMP-ACT-003` | Local axial projection | Direct mechanics | \(N=F\cdot t\) |
| `EMP-STR-001` | Pressure force | Derived/code basis | \(F_P=PA_{sf}\) |
| `EMP-STR-002` | Sustained axial stress | Code formula | \(S_{sa}=F_{sa}/A_{sp}\) |
| `EMP-STR-003` | Sustained bending stress | Code formula | indexed resultant bending moment divided by \(Z\) |
| `EMP-STR-004` | Sustained torsional stress | Code formula | \(S_{st}=M_t/(2Z)\) |
| `EMP-STR-005` | Sustained longitudinal stress | Code formula | Appendix S/B31.3 edition-bound relation |
| `EMP-EQ-001` | Global force closure | Acceptance rule | sum reactions equals applied load |
| `EMP-EQ-002` | Global moment closure | Acceptance rule | external force and moment balance |
| `EMP-CONV-001` | Bend refinement | Acceptance rule | 8→16 segment action/displacement convergence |

Each code implementation shall reference these IDs in its formula trace.

---

## 8. Declared engineering inputs

### 8.1 Geometry

Required geometry includes:

- node coordinates;
- component connectivity;
- member start and end identity;
- bend centreline radius and included angle;
- exact support and component locations;
- eccentric load offsets where applicable.

Zero-length, coincident-but-unjoined, duplicate and ambiguous members are blockers unless a governed junction rule resolves them.

### 8.2 Section and material

Required data include:

- outside diameter;
- nominal wall;
- stiffness wall basis;
- weight wall basis;
- corrosion allowance;
- code-stress wall basis;
- elastic modulus;
- shear modulus where torsion is calculated;
- density;
- thermal-expansion coefficient.

The same wall thickness shall not silently serve all purposes.

### 8.3 Weight

Total sustained mass shall include only declared sources:

\[
m_{total}=m_{pipe}+m_{contents}+m_{insulation}+m_{distributed\ components}
\]

Discrete valves, flanges, meters and concentrated attachments shall be represented by a finite body or explicit point load at the correct centre of gravity.

### 8.4 Pressure and temperature

Pressure may affect:

- code longitudinal stress;
- bend pressure stiffening;
- pressure thrust where declared;
- Bourdon effects only when separately qualified.

Temperature is entered as an initial member strain, not as a universal system force.

### 8.5 Supports

Support inputs include:

- support identity;
- location;
- restrained direction;
- bilateral or unilateral capability;
- initial gap;
- spring stiffness where a future qualified spring rule is selected;
- source and assumption status.

Unsupported interpretation shall remain `UNKNOWN` or `INPUT_INCOMPLETE`.

---

## 9. Direct mechanics formulation

### 9.1 Pipe section properties

For outside diameter \(D_o\), wall thickness \(t\) and inside diameter \(D_i=D_o-2t\):

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
Z=\frac{I}{D_o/2}=\frac{2I}{D_o}
\]

Pipe-wall mass per length is:

\[
m_p=\rho A
\]

Total gravitational line load is:

\[
w=g(m_p+m_f+m_i+m_d)
\]

### 9.2 Straight-member stiffness

For a planar Euler–Bernoulli member of length \(L\):

\[
k_a=\frac{EA}{L}
\]

The principal bending coefficients are:

\[
\frac{12EI}{L^3},\quad \frac{6EI}{L^2},\quad \frac{4EI}{L},\quad \frac{2EI}{L}
\]

These coefficients are assembled into the conventional six-degree planar member relation for:

\[
[u_i,v_i,\theta_i,u_j,v_j,\theta_j]^T
\]

A three-dimensional extension shall use the analogous twelve-degree member relation and independently qualified local-axis rules.

### 9.3 Distributed loads

For uniform local transverse load \(q\):

\[
V_i^0=V_j^0=\frac{qL}{2}
\]

\[
M_i^0=+\frac{qL^2}{12},\qquad M_j^0=-\frac{qL^2}{12}
\]

For uniform local axial load \(q_x\):

\[
N_i^0=N_j^0=\frac{q_xL}{2}
\]

Equivalent loads shall preserve total member force and moment.

### 9.4 Thermal strain

\[
\epsilon_{th}=\alpha\Delta T
\]

\[
\Delta_{free}=\alpha\Delta TL
\]

For a fully restrained isolated axial member:

\[
N_{th}=EA\alpha\Delta T
\]

This isolated result is not imposed on a complete route. Member compatibility and boundary conditions determine final system actions.

---

## 10. Adopted empirical member representation

### 10.1 Straight pipe

Straight pipe is represented by exact centreline members with declared \(EA\), \(EI_y\), \(EI_z\) and \(GJ\) as applicable.

### 10.2 Elbows

The original two-chord elbow representation is retained only as historical benchmark evidence. The preferred interim production candidate is:

```text
8 equal-angle centreline segments per 90° elbow
```

For each bend segment:

\[
(EI)_{effective}=\frac{EI}{k}
\]

where \(k\) is independently calculated from the selected code source and pressure correction.

The method shall preserve:

- physical arc length for weight;
- deterministic equal-angle stationing;
- true tangent direction at near, midpoint and far benchmark stations;
- source-bound \(k\), not a fitted value.

The eight-segment rule is an empirical approximation, not an exact curved-pipe transfer matrix.

### 10.3 Tees and branch junctions

A tee model shall state:

- branch and run connectivity;
- junction point;
- any excluded rigid-zone length;
- directional flexibility factors;
- stress-index source;
- applicability status.

A unity-flexibility tee representation is allowed only for a benchmark or explicit regression control that declares this limitation.

### 10.4 Valves, flanges and meters

Heavy in-line components may be represented by:

- exact finite-length rigid or stiff member;
- declared translational mass;
- declared rotational inertia where needed;
- centre-of-gravity offset;
- connection stiffness only when qualified.

No hidden default weight or centre of gravity is allowed.

---

## 11. Assembly and solution procedure

For each load case:

1. validate geometry, properties, loads and supports;
2. establish deterministic node and member order;
3. calculate member section and stiffness data;
4. calculate fixed-end mechanical and thermal loads;
5. rotate member terms to global coordinates;
6. assemble the empirical route equations;
7. apply the candidate restraint set;
8. solve free displacements;
9. recover reactions and member actions;
10. apply active-set contact rules;
11. repeat where support state changes;
12. calculate equilibrium, convergence and benchmark evidence;
13. serialize a deterministic result and formula trace.

A singular or ill-conditioned system shall not be stabilised by an undeclared artificial spring.

---

## 12. Unilateral contact and lift-off

For each frictionless rest:

\[
R_i\ge0
\]

\[
g_i\ge0
\]

\[
R_ig_i=0
\]

where \(R_i\) is upward support-on-pipe reaction and \(g_i\) is separation.

### 12.1 Active-set algorithm

```text
1. Start with declared candidate rests active.
2. Solve the complete case.
3. Recover each candidate rest reaction.
4. Identify active rests requiring tensile reaction.
5. Release all inadmissible rests.
6. Rebuild and recalculate the complete system.
7. Repeat until all active reactions are admissible.
8. Retain trial reactions, release sequence and final gaps.
9. Check possible re-contact where a positive gap model is qualified.
```

A negative rest reaction shall never be clipped to zero while retaining unrecalculated actions elsewhere.

---

## 13. Load-case decomposition

### 13.1 Weight-only

\[
W=\text{pipe}+\text{contents}+\text{insulation}+\text{components}
\]

### 13.2 Sustained

\[
SUS=W+P
\]

Pressure effects shall be itemised as:

- pressure force used in code stress;
- bend pressure stiffening;
- structural pressure thrust, when qualified;
- Bourdon effect, when qualified.

### 13.3 Operating

\[
OPE=W+P+T
\]

### 13.4 Weight redistribution after lift-off

Let \(A_{cold}\) be the cold support set and \(A_{hot}\) the converged operating set.

\[
M_{W,cold}=M(W,A_{cold})
\]

\[
M_{W,hot}=M(W,A_{hot})
\]

\[
\Delta M_{W,lift-off}=M_{W,hot}-M_{W,cold}
\]

Thermal action on the common hot support set is:

\[
M_{T,hot}=M(W+T,A_{hot})-M(W,A_{hot})
\]

Thus:

\[
M_{OPE}=M_{W,hot}+M_{T,hot}
\]

This prevents a support-state change from being mislabelled as a pure thermal action.

---

## 14. Member action recovery

For member global displacements \(d_e^g\):

\[
d_e^l=T_ed_e^g
\]

Local end actions are:

\[
f_e^l=k_e^ld_e^l-f_e^{0,l}
\]

For a planar member:

\[
f_e^l=[N_i,V_i,M_i,N_j,V_j,M_j]^T
\]

For a three-dimensional member, future action recovery shall include:

\[
[N,V_y,V_z,T,M_y,M_z]
\]

at each end.

### 14.1 Internal bending moment

For uniform transverse loading:

\[
M(x)=M_i+V_ix-\frac{qx^2}{2}
\]

The interior extremum occurs at:

\[
x_{ext}=\frac{V_i}{q}
\]

when \(0\le x_{ext}\le L\).

The reported maximum member bending moment shall compare:

- \(|M_i|\);
- \(|M_j|\);
- \(|M(x_{ext})|\), where applicable.

### 14.2 Bend-station axial force

At any station with unit tangent \(t\):

\[
N=F\cdot t
\]

At bend midpoints, the true station tangent shall be used rather than the local axis of one adjacent straight segment.

---

## 15. Sustained longitudinal stress

### 15.1 Section basis

The document and implementation shall separately identify:

- nominal wall \(t_n\);
- corrosion allowance \(c\);
- code-stress wall \(t_c=t_n-c\), subject to the selected code dataset;
- pressure area \(A_{sf}\);
- stress area \(A_{sp}\);
- section modulus \(Z\).

### 15.2 Pressure force

\[
F_P=PA_{sf}
\]

### 15.3 Sustained axial force

\[
F_{sa}=F_P\pm N_m
\]

The sign depends on the declared cut-force convention and shall be verified against the benchmark table.

### 15.4 Sustained axial stress

\[
S_{sa}=\frac{F_{sa}}{A_{sp}}
\]

### 15.5 Sustained bending stress

\[
S_{sb}=\frac{\sqrt{(I_{s,i}M_{s,i})^2+(I_{s,o}M_{s,o})^2}}{Z}
\]

### 15.6 Sustained torsional stress

\[
S_{st}=\frac{M_{st}}{2Z}
\]

### 15.7 Sustained longitudinal stress

\[
S_L=\sqrt{(|S_{sa}|+S_{sb})^2+4S_{st}^2}
\]

For the planar Table S302.6.3 benchmark:

\[
M_{s,o}=0,\qquad M_{st}=0
\]

therefore:

\[
S_L=|S_{sa}|+S_{sb}
\]

All code factors and indices shall come from an edition-bound dataset. They shall not be hardcoded into the generic mechanics core.

---

## 16. Independent closed-form qualification

Before Appendix S qualification, the mechanics core shall pass exact or near-machine-precision checks.

### 16.1 Simply supported beam under UDL

\[
R_A=R_B=\frac{wL}{2}
\]

\[
M_{max}=\frac{wL^2}{8}
\]

\[
\delta_{max}=\frac{5wL^4}{384EI}
\]

### 16.2 Cantilever under UDL

\[
R_A=wL
\]

\[
M_A=\frac{wL^2}{2}
\]

\[
\delta_{tip}=\frac{wL^4}{8EI}
\]

### 16.3 Fixed-fixed beam under UDL

\[
M_A=M_B=-\frac{wL^2}{12}
\]

\[
M_{mid}=+\frac{wL^2}{24}
\]

\[
\delta_{max}=\frac{wL^4}{384EI}
\]

### 16.4 Axial and thermal members

Qualify:

- axial bar extension \(FL/EA\);
- fixed-fixed thermal force \(EA\alpha\Delta T\);
- free thermal expansion \(\alpha\Delta TL\);
- released-end zero thermal force.

### 16.5 Acceptance

Recommended mechanics tolerances are:

| Quantity | Acceptance |
|---|---:|
| Reactions and end moments | relative error ≤ \(10^{-8}\) |
| Internal extrema | relative error ≤ \(10^{-7}\) |
| Displacements | relative error ≤ \(10^{-7}\) |
| Global force residual | ≤ \(10^{-6}\) N or scaled equivalent |
| Global moment residual | ≤ declared scaled numerical tolerance |

---

## 17. Appendix S Example 1 benchmark

Example 1 qualifies:

- route displacement;
- support reactions;
- retained support state;
- bend flexibility sensitivity;
- future operating member actions.

The historical two-segment benchmark produced a maximum operating vertical displacement deviation of approximately 0.983 mm and primary support reaction errors near 1%. The near-zero Bend 30 far displacement produced a misleading large percentage despite a sub-millimetre absolute difference.

### 17.1 Bend refinement evidence

| Segments per 90° bend | Bend 30 far, mm | Absolute error, mm | Bend 40 far, mm | N20 reaction error |
|---:|---:|---:|---:|---:|
| 2 | 1.174 | 0.774 | 20.183 | 1.372% |
| 4 | 0.751 | 0.351 | 19.556 | 0.628% |
| 8 | 0.646 | 0.246 | 19.401 | 0.445% |
| 16 | 0.620 | 0.220 | 19.363 | 0.400% |

The preferred interim elbow representation is eight segments, with 8→16 convergence retained as evidence.

---

## 18. Appendix S Example 2 lift-off benchmark

### 18.1 Cold/SUS state

Cold active rests are:

```text
N20, N50, N120
```

### 18.2 Operating attached trial

The attached operating trial gives a tensile reaction at N50 of approximately:

```text
-12.842 kN
```

N50 is therefore released.

### 18.3 Final operating state

The final active rests are:

```text
N20, N120
```

The calculated N50 operating reaction is zero and the calculated uplift is approximately 22.050 mm. The full system is recalculated after release; no reaction clipping is permitted.

Example 2 shall qualify:

- attached trial reaction;
- release iteration;
- final active set;
- final support reactions;
- final uplift;
- weight-moment redistribution between cold and hot support sets;
- hot-set thermal action decomposition.

---

## 19. Table S302.6.3 Sustained Condition 3 benchmark

### 19.1 Benchmark purpose

This table is the primary benchmark for:

- mechanical axial force;
- sustained bending moment;
- sustained longitudinal stress \(S_L\);
- governing station;
- code pass/fail disposition.

The benchmark uses the Sustained Condition 3 support state with the N50 rest inactive, pressure and all sustained weights present, and thermal strain removed.

### 19.2 Adopted input basis

| Parameter | Value |
|---|---:|
| Outside diameter | 406.4 mm |
| Nominal wall | 9.525 mm |
| Corrosion allowance | 1.6002 mm |
| Stress wall | 7.9248 mm |
| Elastic modulus | 203.4 GPa |
| Pressure | 3.795 MPa |
| Total line load | approximately 2.435 kN/m |
| Bend flexibility | 9.36566184176338 |
| Bend segments | 8 per 90° bend |
| Active vertical rests | N20 and N120 |
| Inactive rest | N50 |

Derived stress properties used in the worked benchmark are:

\[
A_{sp}=0.009920635\ m^2
\]

\[
Z=0.000969394\ m^3
\]

\[
A_{sf}=0.119796479\ m^2
\]

\[
F_P=454.282\ kN
\]

### 19.3 Axial-force benchmark

Table force components are projected to the physical centreline tangent.

| Station | Reference axial force | Empirical axial force | Absolute difference | Error |
|---|---:|---:|---:|---:|
| N10 anchor | 12.575 kN | 12.613 kN | 0.038 kN | 0.305% |
| N20 support | 12.575 kN | 12.613 kN | 0.038 kN | 0.305% |
| Bend 30 far | 34.985 kN | 35.016 kN | 0.031 kN | 0.088% |
| Bend 40 mid | 24.413 kN | 24.450 kN | 0.037 kN | 0.151% |
| N50 rest location | 12.575 kN | 12.613 kN | 0.038 kN | 0.305% |

### 19.4 Bending-moment benchmark

| Station | Reference \(M_z\) | Empirical \(M_z\) | Absolute difference | Error |
|---|---:|---:|---:|---:|
| N10 anchor | 3.995 kN·m | 3.873 kN·m | 0.122 kN·m | 3.051% |
| N20 support | 82.845 kN·m | 82.869 kN·m | 0.024 kN·m | 0.029% |
| Bend 30 far | 29.985 kN·m | 30.084 kN·m | 0.099 kN·m | 0.331% |
| Bend 40 mid | 32.770 kN·m | 32.921 kN·m | 0.151 kN·m | 0.462% |
| N50 rest location | 62.885 kN·m | 62.841 kN·m | 0.044 kN·m | 0.069% |

The Node 10 percentage is governed by a comparatively small reference moment. Its absolute difference is 0.122 kN·m.

### 19.5 Sustained-stress benchmark

| Station | Reference \(S_L\) | Empirical \(S_L\) | Absolute difference | Error |
|---|---:|---:|---:|---:|
| N10 anchor | 48.645 MPa | 48.516 MPa | 0.129 MPa | 0.266% |
| N20 support | 129.975 MPa | 130.006 MPa | 0.031 MPa | 0.024% |
| Bend 30 far | 101.920 MPa | 102.129 MPa | 0.209 MPa | 0.205% |
| Bend 40 mid | 108.525 MPa | 108.840 MPa | 0.315 MPa | 0.290% |
| N50 rest location | 109.385 MPa | 109.346 MPa | 0.039 MPa | 0.036% |

Summary:

| Metric | Result |
|---|---:|
| Maximum axial-force error | 0.305% |
| Maximum principal moment error excluding small N10 moment | 0.462% |
| Maximum \(S_L\) error | 0.290% |
| Governing station | N20 |
| Empirical governing \(S_L\) | 130.006 MPa |
| Benchmark allowable | 124.5 MPa |
| Disposition | FAIL, matching Appendix S |

---

## 20. Worked calculation — N20 sustained stress

### 20.1 Inputs

| Input | Symbol | Value |
|---|---|---:|
| Outside diameter | \(D_o\) | 0.4064 m |
| Nominal wall | \(t_n\) | 0.009525 m |
| Corrosion allowance | \(c\) | 0.0016002 m |
| Pressure | \(P\) | 3.795 MPa |
| Mechanical axial force | \(N_m\) | 12.613 kN |
| Empirical bending moment | \(M\) | 82.869 kN·m |
| Sustained bending index | \(I_s\) | 1.0 |

### 20.2 Stress wall

\[
t_c=t_n-c
\]

\[
t_c=9.525-1.6002=7.9248\ mm
\]

### 20.3 Stress area

\[
A_{sp}=\frac{\pi}{4}[D_o^2-(D_o-2t_c)^2]
\]

\[
A_{sp}=0.009920635\ m^2
\]

### 20.4 Section modulus

\[
Z=\frac{\pi[D_o^4-(D_o-2t_c)^4]}{32D_o}
\]

\[
Z=0.000969394\ m^3
\]

### 20.5 Pressure force

\[
F_P=PA_{sf}=454.282\ kN
\]

### 20.6 Sustained axial force

For the adopted cut-force orientation:

\[
F_{sa}=F_P-N_m
\]

\[
F_{sa}=454.282-12.613=441.669\ kN
\]

### 20.7 Axial stress

\[
S_{sa}=\frac{441.669\times10^3}{0.009920635}=44.520\ MPa
\]

### 20.8 Bending stress

\[
S_{sb}=\frac{1.0\times82.869\times10^3}{0.000969394}=85.486\ MPa
\]

### 20.9 Sustained longitudinal stress

For the planar benchmark, torsional stress is zero:

\[
S_L=44.520+85.486=130.006\ MPa
\]

### 20.10 Benchmark error

\[
S_{L,ref}=129.975\ MPa
\]

\[
\Delta S_L=0.031\ MPa
\]

\[
e_r=100\frac{|130.006-129.975|}{129.975}=0.024\%
\]

### 20.11 Allowable disposition

\[
\frac{130.006}{124.5}=1.0442
\]

```text
Utilisation = 104.42%
Status      = FAIL
```

The benchmark therefore reproduces both the governing station and the Appendix S failure disposition.

---

## 21. Equilibrium and convergence requirements

### 21.1 Global equilibrium

For every case:

\[
\sum F_x=0,\quad \sum F_y=0,\quad \sum F_z=0
\]

\[
\sum M_x=0,\quad \sum M_y=0,\quad \sum M_z=0
\]

The force and moment reference point shall be declared.

### 21.2 Joint action closure

At a joint without an external concentrated action:

\[
\sum f_{member}+f_{support}=0
\]

### 21.3 Elbow convergence

Recommended minimum qualification for 8→16 segments:

```text
primary support reaction change ≤ 0.25%
member end moment change        ≤ 1.0% and ≤ 0.25 kN·m absolute where practical
reported displacement change    ≤ 0.10 mm
active support set unchanged
```

If the active support set changes under refinement, the case is not converged.

---

## 22. Error and acceptance policy

### 22.1 Primary mechanics tests

Closed-form tests shall govern implementation correctness.

### 22.2 Appendix S comparison

Recommended project acceptance for the current benchmark candidate:

| Quantity | Acceptance |
|---|---|
| Primary support reactions | ≤ 1% where reference is not near zero |
| Mechanical axial force | ≤ 1% |
| Principal sustained bending moment | ≤ 1% or declared absolute floor |
| Sustained longitudinal stress | ≤ 1% |
| Displacement | ≤ 8% or 1.5 mm absolute, with near-zero guard |
| Lift-off state | exact state match |
| Governing location | exact match |
| Code pass/fail | exact match |

A benchmark pass shall not authorise geometry or behaviour outside this document's applicability limits.

---

## 23. Runtime data contracts

### 23.1 Calculation request

```json
{
  "schema": "empirical-beam-contact-request/v1",
  "method": "EMPIRICAL_BEAM_CONTACT_V1",
  "geometry": {},
  "sections": {},
  "materials": {},
  "masses": {},
  "pressures": {},
  "temperatures": {},
  "supports": {},
  "formulaProfile": {},
  "benchmarkMode": false
}
```

### 23.2 Member action result

```json
{
  "schema": "empirical-member-action-recovery/v1",
  "loadCaseId": "SUS-3",
  "elementId": "E20-B30",
  "localEndI": {
    "axialForceN": 0,
    "shearYN": 0,
    "shearZN": 0,
    "torsionNm": 0,
    "bendingMomentYNm": 0,
    "bendingMomentZNm": 0
  },
  "localEndJ": {},
  "internalExtrema": [],
  "formulaTrace": ["EMP-ACT-001", "EMP-ACT-002"]
}
```

### 23.3 Sustained-stress result

```json
{
  "schema": "empirical-b31-sustained-stress/v1",
  "stationId": "N20",
  "mechanicalAxialForceN": 12613,
  "pressureForceN": 454282,
  "sustainedAxialForceN": 441669,
  "bendingMomentNm": 82869,
  "axialStressPa": 44520000,
  "bendingStressPa": 85486000,
  "torsionalStressPa": 0,
  "sustainedLongitudinalStressPa": 130006000,
  "formulaTrace": [
    "EMP-STR-001",
    "EMP-STR-002",
    "EMP-STR-003",
    "EMP-STR-005"
  ]
}
```

### 23.4 Result identity

Every result shall retain:

- method version;
- input semantic hash;
- formula-profile identity;
- code-dataset identity;
- support-state history;
- deterministic node/member ordering;
- convergence record;
- benchmark mode flag.

Timestamps may be report metadata but shall not alter semantic identity.

---

## 24. Failure codes

The implementation shall fail closed using explicit codes such as:

```text
INPUT_INCOMPLETE
GEOMETRY_INVALID
SECTION_INVALID
MASS_SOURCE_UNRESOLVED
SUPPORT_CAPABILITY_UNKNOWN
CODE_DATASET_UNRESOLVED
MATRIX_SINGULAR
SYSTEM_ILL_CONDITIONED
CONTACT_NONCONVERGENT
BEND_CONVERGENCE_FAILED
BUCKLING_SCREEN_FAILED
OUTSIDE_QUALIFIED_SCOPE
BENCHMARK_NOT_QUALIFIED
```

No blocked result may be relabelled as a warning-only calculated value.

---

## 25. Requirements-to-test traceability

| Requirement ID | Requirement | Formula/section | Minimum test |
|---|---|---|---|
| `EMP-R-001` | No LFEA numerical dependency | Section 1 | source/import guard |
| `EMP-R-010` | Preserve total weight | `EMP-WGT-002` | force closure |
| `EMP-R-020` | Exact beam action recovery | `EMP-ACT-001` | simply supported, cantilever, fixed-fixed |
| `EMP-R-030` | Release tensile rests | `EMP-CNT-001` | Appendix S Example 2 |
| `EMP-R-040` | Recover local axial force at bends | `EMP-ACT-003` | tangent-projection test |
| `EMP-R-050` | Calculate sustained \(S_L\) | `EMP-STR-001`–`005` | Table S302.6.3 |
| `EMP-R-060` | Guard near-zero percentage | Section 6.3 | report regression |
| `EMP-R-070` | Deterministic result identity | Section 23.4 | byte-identical rerun |
| `EMP-R-080` | Preserve active-set history | Section 12 | lift-off evidence test |
| `EMP-R-090` | Qualify elbow refinement | `EMP-CONV-001` | 8→16 convergence |

---

## 26. Future enhancement register — piping mechanics

| Enhancement | Current limitation | Proposed direction | Required qualification |
|---|---|---|---|
| Exact curved elbow | segmented \(EI/k\) approximation | curved-member transfer relation | closed form + Appendix S |
| Full 3D actions | planar/grillage benchmark scope | 12-DOF member actions | spatial frame tests |
| Directional tee flexibility | simplified junction | source-bound branch stiffness | Appendix S Example 3 and independent tees |
| Friction | normal contact only | Coulomb active set | stick/slip benchmarks |
| Linear springs | not production-qualified | spring DOF with source-bound stiffness | closed-form spring beams |
| Nonlinear springs/gaps | excluded | tangent iteration | hysteresis and gap tests |
| Geometric stiffness | pre-buckling only | P–Δ tangent stiffness | Euler and frame buckling |
| Other code editions | fixed benchmark edition | versioned formula datasets | edition regression suite |

---

## 27. Future structural-support screening concept

### 27.1 Intent and boundary

The empirical piping result can become the load source for a separate **structural-support screening module**. This is an early-stage engineering concept, not a qualified structural design method.

The structural module shall consume only the piping-to-support interface actions:

```text
Fx, Fy, Fz, Mx, My, Mz
+ load-case identity
+ support attachment point
+ action sign convention
```

It shall not consume piping stiffness matrices or LFEA results.

The structural calculation shall have its own method identity, for example:

```text
EMPIRICAL_SUPPORT_FRAME_SCREEN_V1
```

Its outputs shall be labelled `SCREENING`, not code-qualified design, until section, connection, buckling and structural-code datasets are separately qualified.

### 27.2 Load-transfer contract

For a piping action \(F\) and moment \(M\) applied at position vector \(r\) from a structural reference point:

\[
F_{ref}=F
\]

\[
M_{ref}=M+r\times F
\]

This relation is the core interface for transferring pipe loads to:

- a cantilever post top;
- a T-post stem/crossarm junction;
- a goalpost beam or column node;
- a base plate reference point.

Load cases shall remain separate. The structural module shall not invent combinations such as SUS+OPE. Project combinations must come from a declared structural load-combination dataset.

### 27.3 Cantilever post — preliminary concept

A simple support post may be idealised as a vertical cantilever of height \(L\), fixed at its base, with top actions.

For a lateral top force \(F\):

\[
V_{base}=F
\]

\[
M_{base}=FL+M_{top}
\]

Tip displacement from lateral force and applied top moment is:

\[
\delta_{tip}=\frac{FL^3}{3EI}+\frac{M_{top}L^2}{2EI}
\]

Tip rotation is:

\[
\theta_{tip}=\frac{FL^2}{2EI}+\frac{M_{top}L}{EI}
\]

For biaxial loading:

\[
\sigma=\frac{P}{A}\pm\frac{M_y}{Z_y}\pm\frac{M_z}{Z_z}
\]

A preliminary utilisation may be formed only after selecting a structural-code dataset and member resistance model.

Possible screening outputs:

- base shear;
- base moment;
- top deflection;
- axial plus biaxial bending stress indicator;
- slenderness and Euler buckling indicator;
- `DETAILED_STRUCTURAL_CHECK_REQUIRED` disposition.

### 27.4 T-post — preliminary concept

A T-post consists of:

- a vertical stem;
- a crossarm;
- one or more pipe load points at offsets from the stem centreline.

First transfer each pipe action to the stem/crossarm junction:

\[
M_J=M_{pipe}+r\times F_{pipe}
\]

The crossarm may be treated as one or two cantilever segments only when the connection is demonstrably rigid and the geometry matches that idealisation.

For a pipe vertical load \(W\) at horizontal offset \(e\):

\[
M_{stem}=We
\]

A lateral guide or line-stop load produces additional stem bending and possible crossarm torsion.

A future T-post screening module should calculate:

- crossarm end moments and deflections;
- stem axial force and biaxial bending;
- junction action transfer;
- torsional demand from out-of-plane eccentricity;
- weld/connection demand as an unqualified reported action;
- base reactions.

The module shall not assume the crossarm is fully fixed without an explicit connection-stiffness classification.

### 27.5 Goalpost — preliminary concept

A goalpost consists of two columns and a top beam. A useful reduced model is a two-dimensional or three-dimensional rigid-jointed frame assembled from the same direct member coefficients used by the piping method, but under a separate structural-screening authority.

Potential loading includes:

- one or more pipe gravity loads on the beam;
- guide loads;
- line-stop loads;
- eccentric vertical and lateral loads;
- applied pipe moments.

For a vertical point load \(W\) at distance \(a\) from the left column over beam span \(L\), a simple static distribution useful only as a first diagnostic is:

\[
R_L=W\frac{L-a}{L},\qquad R_R=W\frac{a}{L}
\]

This reaction split is not sufficient for a rigid portal-frame check because column and beam stiffness affect moments and sway. The preferred future screening model is a small direct-stiffness frame using declared \(EA\), \(EI\), connection fixity and base condition.

Goalpost outputs should include:

- beam bending moment and deflection;
- column axial force and biaxial moment;
- frame sway;
- base shears and moments;
- load share between columns;
- connection action demand;
- global stability indicator.

### 27.6 Simple structural section checks

For a steel section with axial force \(P\), bending moments \(M_y,M_z\), shear \(V\) and torsion \(T\), a future screening report may show elastic demand quantities:

\[
\sigma_{axial}=\frac{P}{A}
\]

\[
\sigma_{bend,y}=\frac{M_y}{Z_y},\qquad \sigma_{bend,z}=\frac{M_z}{Z_z}
\]

\[
\tau_{avg}=\frac{V}{A_v}
\]

These are demand calculations only. Member resistance, lateral-torsional buckling, local buckling, interaction equations, effective lengths and connection resistance require an explicit structural-code dataset such as a project-approved AISC, Eurocode or other governing basis.

### 27.7 Base plate and anchor-bolt roadmap

A later extension may transfer post/portal base actions to a base-plate model:

```text
P, Vx, Vz, Mx, Mz, T
```

Potential screening quantities include:

- bearing pressure distribution;
- uplift zone;
- anchor-bolt tension and shear demand;
- plate bending strips;
- weld action demand;
- sliding demand.

These checks are explicitly outside the first structural-support screening release and shall not be approximated without qualified anchor layout, grout, concrete, plate and code data.

### 27.8 Structural screening benchmark ladder

A future structural module should be qualified in this order:

1. cantilever with top force;
2. cantilever with top moment;
3. cantilever with combined axial and biaxial loading;
4. T-post with centred load;
5. T-post with eccentric vertical and lateral loads;
6. symmetric goalpost with centred vertical load;
7. goalpost with eccentric vertical load;
8. goalpost with lateral sway load;
9. comparison against an independent hand calculation;
10. comparison against a trusted structural frame program for screening quantities only.

Minimum benchmark outputs:

- reactions;
- deflections;
- member end actions;
- elastic stress indicators;
- equilibrium residual;
- frame symmetry or antisymmetry where applicable.

### 27.9 Structural-support failure boundaries

The future screening method shall return a blocking disposition for:

```text
CONNECTION_FIXITY_UNKNOWN
SECTION_PROPERTIES_INCOMPLETE
BASE_CONDITION_UNKNOWN
STRUCTURAL_CODE_DATASET_UNRESOLVED
SECOND_ORDER_EFFECTS_REQUIRED
LOCAL_BUCKLING_CHECK_REQUIRED
LATERAL_TORSIONAL_BUCKLING_REQUIRED
BASE_PLATE_CHECK_REQUIRED
ANCHOR_BOLT_CHECK_REQUIRED
DETAILED_STRUCTURAL_MODEL_REQUIRED
```

The piping module may provide loads, but it shall not claim the support is adequate.

---

## 28. Future architecture boundary

The intended future chain is:

```text
Empirical piping model
→ support interface actions
→ immutable load-transfer record
→ structural support screening model
→ cantilever / T-post / goalpost response
→ structural demand indicators
→ explicit limitations and escalation decision
```

Ownership shall remain separated:

| Layer | Owns |
|---|---|
| Piping empirical method | pipe displacement, reactions, contact state and pipe member actions |
| Load-transfer adapter | coordinate and eccentricity transformation only |
| Structural screening method | support-frame reactions, deflections and elastic member demands |
| Structural code engine | resistance, interaction and utilisation, when separately qualified |
| Civil/foundation method | base plate, anchors, concrete and foundation checks |

No layer shall silently recompute another layer's source quantities.

---

## 29. Implementation sequence

Recommended delivery sequence:

1. freeze this engineering basis and formula register;
2. add standalone member action recovery to the existing empirical core;
3. qualify exact closed-form beam actions;
4. replace the two-segment elbow production candidate with eight segments;
5. implement bend convergence evidence;
6. implement weight-only, hot-set weight and thermal action decomposition;
7. implement edition-bound sustained-stress calculator;
8. automate Table S302.6.3 benchmark output;
9. add deterministic JSON and Markdown reports;
10. add the separate structural-support screening concept only after piping action recovery is stable.

---

## 30. Final qualification statement

`EMPIRICAL_BEAM_CONTACT_V1` is qualified only for the explicitly benchmarked formulation, input classes, load cases, support types, component representations and code datasets documented here.

Agreement with Appendix S does not authorise:

- unqualified geometries;
- nonlinear response;
- arbitrary supports or springs;
- other code editions;
- structural-support adequacy;
- base plate, anchor or foundation design.

Any change to member formulation, elbow discretisation, flexibility factor, contact iteration, action recovery, code-stress equation, section basis, sign convention or error metric requires deterministic benchmark replay and an updated qualification record.

The governing development chain is:

```text
source
→ formula
→ adopted interpretation
→ declared input
→ calculation
→ worked example
→ benchmark
→ error metric
→ acceptance criterion
→ code contract
→ automated test
→ qualification boundary
```

---

## Appendix A — Core notation

| Symbol | Meaning |
|---|---|
| \(A\) | cross-sectional area |
| \(A_{sp}\) | pipe stress area |
| \(A_{sf}\) | pressure-force area |
| \(D_o,D_i\) | outside and inside diameter |
| \(E,G\) | elastic and shear modulus |
| \(I,J\) | second and polar second moments of area |
| \(Z\) | elastic section modulus |
| \(L\) | member length |
| \(q,w\) | distributed load |
| \(N,V,T,M\) | axial, shear, torsion and bending actions |
| \(R\) | support reaction |
| \(g\) | support gap or separation |
| \(\alpha\) | thermal-expansion coefficient |
| \(\Delta T\) | temperature change |
| \(k\) | flexibility factor |
| \(h\) | bend flexibility characteristic |
| \(S_{sa}\) | sustained axial stress |
| \(S_{sb}\) | sustained bending stress |
| \(S_{st}\) | sustained torsional stress |
| \(S_L\) | sustained longitudinal stress |

## Appendix B — Required evidence package

A release evidence package shall contain:

- exact source commit;
- formula-register version;
- code-dataset identity;
- benchmark manifest;
- raw input package;
- deterministic output JSON;
- side-by-side benchmark CSV or Markdown;
- equilibrium and convergence report;
- active-set history;
- source-bound assumptions and blockers;
- semantic hashes;
- exact-head workflow result.
