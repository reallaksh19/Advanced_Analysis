# Non-FEA Empirical Piping Loads, Displacement, Reactions and Sustained-Stress Hand-Calculation Plan

**Repository:** `reallaksh19/Advanced_Analysis`  
**Target branch:** `agent/sjson-1885-configurable-screening`  
**Document date:** 6 August 2026  
**Status:** technical-report plan and calculation-basis draft; not production numerical authority  
**Requested filename note:** the spelling `NonFEAHandcalc_Emperical.md` is retained intentionally.  
**Primary objective:** define an auditable, configurable, piping-only calculation route for loads, displacement, sustained reactions and sustained stress without a general FEA solver and with no iterative process beyond an optional single correction pass.

---

## 1. Executive decision

The first implementation phase shall calculate piping quantities only:

1. source-authoritative pipe section and material state by node/POS;
2. pipe, fluid, insulation and component weight;
3. pressure ownership and pressure-thrust actions where physically applicable;
4. sustained (`W + P`) support reactions;
5. sustained member actions;
6. sustained longitudinal stress;
7. thermal free displacement;
8. guide and line-stop reactions from reduced route compliance;
9. vertical support retention/lift-off screening; and
10. one-pass load redistribution with at most one configured correction pass.

The following are deferred:

- support steel member design;
- baseplate, anchor-bolt and foundation calculations;
- civil reaction distribution through support assemblies;
- shell/local stress;
- general nonlinear analysis;
- post-buckling response;
- a general three-dimensional FEA solver.

The method is a bounded engineering calculation assembled from source data, classical statics, closed-form beam relations, slope-deflection/transfer relations, reduced compatibility coefficients and explicit empirical configuration. A direct linear equation solution is permitted. General-purpose element meshing and an iterative nonlinear solver are not required.

---

## 2. Relationship to existing repository authorities

This report shall consolidate and cross-reference, but not duplicate inconsistently, the following repository authorities:

- [`empericalformulaconceptnote.md`](./empericalformulaconceptnote.md): governed gravity-load concepts and production roadmap;
- [`LINE_STOP_EMPIRICAL_CONCEPT.md`](./LINE_STOP_EMPIRICAL_CONCEPT.md): guide/line-stop integration and restraint-network boundaries;
- [`empirical-thermal-liftoff-plan.md`](./empirical-thermal-liftoff-plan.md): unilateral-contact and redistribution basis;
- [`empirical-thermal-liftoff-appendix-s-concept-note.md`](./empirical-thermal-liftoff-appendix-s-concept-note.md): standalone beam/contact and lift-off concepts;
- `src/core/empirical-piping-mechanics/stress/b31-sustained.js`: edition-bound sustained-stress calculation;
- `src/core/first-cut-load-estimation/sustained-screening.js`: explicitly non-code first-cut stress screening;
- `src/calc-workspace/cii-standalone-port/core/branch-schedule-resolution.js`: branch/POS schedule and section-resolution work introduced by PR #758;
- `src/workspace/project-data/`: Project Data configuration, evidence, approval and validation authority.

This document shall become the single hand-calculation and report-planning entry point for the non-FEA piping calculation family. Where another document disagrees, the discrepancy must be recorded and resolved before production authorization.

---

## 3. Calculation classes and labels

The report and runtime shall keep result classes separate:

```text
SUSTAINED_REACTION_RESULT
SUSTAINED_MEMBER_ACTION_RESULT
SUSTAINED_STRESS_RESULT
THERMAL_DISPLACEMENT_RESULT
GUIDE_LINESTOP_REACTION_RESULT
VERTICAL_CONTACT_RETENTION_RESULT
```

Proposed method identities:

```text
EMPIRICAL_PIPING_SUSTAINED_V1
EMPIRICAL_PIPING_THERMAL_DISPLACEMENT_V1
EMPIRICAL_RESTRAINT_NETWORK_V1
EMPIRICAL_VERTICAL_RETENTION_V1
EMPIRICAL_PIPING_STRESS_V1
```

An independently calculated vertical weight reaction, X line-stop reaction and Y guide reaction shall not be presented as a qualified operating resultant unless a common coupled model or a separately qualified superposition rule proves that geometry, stiffness, load ownership and support state are consistent.

---

## 4. Non-negotiable data-resolution rule

### 4.1 Resolution order

Every engineering value shall resolve through exactly this precedence:

```text
SOURCE_EXPLICIT
  -> SOURCE_INHERITED
  -> CONFIGURED_DERIVATION
  -> PROJECT_CONFIGURED_DEFAULT
  -> BLOCKED
```

Definitions:

- `SOURCE_EXPLICIT`: value exists directly in the source branch, component, node, POS, line, material, restraint or process record.
- `SOURCE_INHERITED`: a deterministic and auditable inheritance rule resolves the value from an identified connected source record.
- `CONFIGURED_DERIVATION`: an approved formula or mapping derives the value from source facts.
- `PROJECT_CONFIGURED_DEFAULT`: an enabled, approved, scoped Project Data entry supplies the value.
- `BLOCKED`: no permitted authority resolves the value.

### 4.2 Prohibited hidden defaults

Calculation code shall not contain an unreported engineering substitution equivalent to:

```javascript
value || 0
value ?? 1
missingSchedule ? '80' : schedule
missingGap ? 0 : gap
missingFriction ? 0 : friction
missingWeight ? pipeEquivalentWeight : weight
```

A numerical zero or unity is valid only when it is:

- source explicit;
- the exact result of a formula;
- explicitly selected by the load-case definition; or
- supplied by an approved Project Data record and reported as used.

### 4.3 Configured default record

A configured default shall have, at minimum:

```json
{
  "id": "DEFAULT-CS-E-001",
  "enabled": true,
  "field": "material.elasticModulusPa",
  "value": 203400000000,
  "unit": "Pa",
  "scope": {
    "materialFamily": "CARBON_STEEL",
    "temperatureRangeC": [-20, 400]
  },
  "reason": "Project-approved screening property",
  "qualification": "PROJECT_SCREENING_ONLY",
  "evidence": {
    "source": "Project Data",
    "revision": 1
  }
}
```

A locked qualified profile shall be immutable. Editing it creates a new unqualified profile revision.

### 4.4 Configured-default usage ledger

Every actual use shall produce a row such as:

```json
{
  "defaultId": "DEFAULT-CS-E-001",
  "resolutionKind": "PROJECT_CONFIGURED_DEFAULT",
  "field": "material.elasticModulusPa",
  "effectiveValue": 203400000000,
  "unit": "Pa",
  "entityId": "POS-001",
  "fromNode": "N10010",
  "toNode": "N10030",
  "sourceMissingReason": "SOURCE_MODULUS_ABSENT",
  "projectDataPath": "calculationDefaults.materialProperties",
  "projectDataRevision": 12,
  "affectedFormulaIds": ["SEC-EA-01", "SEC-EI-01", "THM-COMP-01"]
}
```

The report shall distinguish:

```text
default definitions configured
default definitions actually used
number of entity/POS applications
```

---

## 5. Project Data configuration plan

Add a Project Data group named:

```text
Engineering calculation defaults
```

Recommended fields:

```text
calculationDefaults.policy
calculationDefaults.sectionResolution
calculationDefaults.materialProperties
calculationDefaults.processProperties
calculationDefaults.componentMass
calculationDefaults.insulation
calculationDefaults.restraintResolution
calculationDefaults.supportStiffness
calculationDefaults.gapsAndFriction
calculationDefaults.verticalContactScreening
calculationDefaults.pDeltaScreening
calculationDefaults.solverTolerances
calculationDefaults.applicabilityLimits
calculationDefaults.reporting
```

### 5.1 Values that may use scoped configured defaults

- elastic modulus and Poisson ratio;
- thermal-expansion table;
- material, fluid and insulation density;
- insulation thickness by exact line/specification rule;
- component mass override or approved pipe-equivalent policy;
- restraint stiffness;
- restraint gap and friction;
- empirical path-compliance coefficient;
- component compliance multipliers;
- support-contact retention curve;
- numerical and equilibrium tolerances;
- report rounding.

### 5.2 Values that normally block

- node coordinates;
- element connectivity;
- branch or POS identity;
- support existence;
- component identity;
- nominal pipe size;
- missing topology;
- ambiguous support attachment;
- ambiguous restraint direction;
- missing pressure when the requested case is explicitly `W + P`;
- missing temperature when thermal displacement is requested.

Schedule may use a configured default only through an exact scoped rule such as:

```text
piping class + line + branch + NPS -> approved schedule
```

A global rule equivalent to `missing schedule -> Sch 80` is forbidden.

---

## 6. Common node/POS calculation state

Every downstream calculation shall consume the same immutable resolved state:

```json
{
  "posId": "POS-001",
  "fromNode": "N10010",
  "toNode": "N10030",
  "branchId": "BRANCH-01",
  "nominalSize": "NPS 6",
  "schedule": "80",
  "outsideDiameterM": 0.168275,
  "wallThicknessM": 0.0109728,
  "insideDiameterM": 0.1463294,
  "areaM2": 0.005422532114,
  "secondMomentM4": 0.000016853490408,
  "sectionModulusM3": 0.000200308903973,
  "polarMomentM4": 0.000033706980816,
  "material": "CARBON_STEEL",
  "elasticModulusPa": 203400000000,
  "densityKgM3": 7850,
  "resolutionStatus": "RESOLVED",
  "resolutionSource": {
    "schedule": "branch.fittings[0].schedule",
    "dimensions": "pipeScheduleData[NPS 6][SCH 80]",
    "material": "branch.material"
  }
}
```

This object shall feed:

- mass and weight;
- axial and bending compliance;
- thermal expansion;
- sustained reactions;
- member actions;
- pressure area;
- sustained stress;
- hand-calculation tables.

No calculation may independently re-resolve OD, wall, schedule or material through a different path.

---

## 7. Formula register and engineering basis

Each formula shall have a stable ID, units, applicability, source/basis, required inputs, output fields and blocking rules.

### 7.1 Pipe section

For outside diameter `D_o` and wall thickness `t`:

```text
SEC-ID-01:  D_i = D_o - 2t
SEC-A-01:   A = pi/4 (D_o^2 - D_i^2)
SEC-I-01:   I = pi/64 (D_o^4 - D_i^4)
SEC-J-01:   J = 2I
SEC-Z-01:   Z = I / (D_o/2)
SEC-ZP-01:  Z_p = J / (D_o/2)
```

Required checks:

```text
D_o > 0
t > 0
D_i > 0
A > 0
I > 0
```

Basis: exact annular circular-section geometry.

### 7.2 Pipe, fluid and insulation mass

For element length `L`:

```text
WGT-MET-01: m_metal = A L rho_metal
WGT-FLD-01: A_i = pi/4 D_i^2
WGT-FLD-02: m_fluid = A_i L rho_fluid
WGT-INS-01: D_ins = D_o + 2t_ins
WGT-INS-02: A_ins = pi/4 (D_ins^2 - D_o^2)
WGT-INS-03: m_ins = A_ins L rho_ins
WGT-TOT-01: m_total = m_metal + m_fluid + m_ins + m_component
WGT-FRC-01: W = m_total g LF
```

Every mass contribution shall remain separately visible in the ledger.

### 7.3 Component mass

Resolution order:

```text
exact source component mass
-> exact catalogue/master mass
-> exact Project Data component override
-> enabled scoped pipe-equivalent policy
-> BLOCKED
```

A pipe-equivalent treatment is an empirical fallback, not a source fact. Its use shall be reported by component identity, type, length, section, factor and resulting mass.

### 7.4 Pressure ownership

Pressure does not automatically create a vertical support reaction.

Pressure may contribute to:

- longitudinal pressure stress;
- closed-end pressure thrust;
- nozzle/anchor/cap/reducer thrust where an exact boundary exists;
- pressure-modified flexibility where a qualified method explicitly includes it.

For an effective pressure area `A_p`:

```text
PRS-FRC-01: F_p = P A_p
```

For an ideal reducer with end effective areas `A_1` and `A_2`:

```text
PRS-RED-01: F_unbalanced = P (A_2 - A_1)
```

Pressure thrust requires an exact direction and application boundary. Otherwise reaction calculation blocks or pressure thrust is explicitly excluded from that result class.

### 7.5 Simple-span sustained reactions

For a simply supported span of length `L`, uniform load `w`, and point loads `P_k` at `x_k` from support A:

```text
SUS-RA-01: R_B = [wL(L/2) + sum(P_k x_k)] / L
SUS-RA-02: R_A = wL + sum(P_k) - R_B
```

Checks:

```text
R_A + R_B = wL + sum(P_k)
R_B L = wL(L/2) + sum(P_k x_k)
```

This is exact for the declared statically determinate span.

### 7.6 Shear and bending moment

For one point load `P` at `a`:

For `0 <= x < a`:

```text
SUS-V-01: V(x) = R_A - wx
SUS-M-01: M(x) = R_A x - wx^2/2
```

For `a <= x <= L`:

```text
SUS-V-02: V(x) = R_A - wx - P
SUS-M-02: M(x) = R_A x - wx^2/2 - P(x-a)
```

Internal maximum moment occurs at a valid station where `V(x) = 0`, or at a span boundary, support, point load or section discontinuity.

### 7.7 Continuous open-chain sustained reactions

For multiple supports, the first qualified non-FEA method shall use classical slope-deflection or an equivalent span-transfer formulation.

For a prismatic span AB:

```text
M_AB = (2EI/L) [2 theta_A + theta_B - 3 Delta_AB/L] + FEM_AB
M_BA = (2EI/L) [2 theta_B + theta_A - 3 Delta_AB/L] + FEM_BA
```

Joint equilibrium and boundary conditions form one direct linear equation system for joint rotations and permitted translations. Fixed-end moments are calculated analytically for each uniform, point or applied-moment contribution.

This is a classical beam calculation. It does not require a general element mesh or an iterative FEA solver.

Initial qualified scope:

- open route or independently qualified planar subroute;
- small displacement;
- linear elastic `E` and section state by POS;
- declared bilateral supports or configured unilateral screening treatment;
- no frictional coupling;
- no unsupported branch/loop condensation.

### 7.8 Thermal strain and free movement

For a constant or mean-secant expansion coefficient:

```text
THM-EPS-01: epsilon_th = alpha_mean (T - T_ref)
THM-DL-01:  DeltaL_free = epsilon_th L
```

For a temperature-dependent coefficient:

```text
THM-EPS-02: epsilon_th = integral from T_ref to T of alpha(T) dT
```

For routed element `j` with unit tangent `t_j`:

```text
THM-VEC-01: Delta_u_free,j = epsilon_th,j L_j t_j
THM-VEC-02: Delta_u_free,route = sum(Delta_u_free,j) + imposed movements
```

`EA alpha DeltaT` shall not be imposed as a universal route force. Route flexibility and restraints determine the final reaction.

### 7.9 Reduced path compliance for line stops and guides

For restraint direction unit vector `n`, member unit tangent `t`, and `mu = t dot n`, the first screening coefficient may use:

```text
THM-COMP-01:
C_j,n = multiplier_j [mu^2 L/(EA) + (1-mu^2)L^3/(C_2E E I)]
```

where:

- `C_2E` is a configured and reported empirical bending-compliance coefficient;
- `multiplier_j` is a configured component-type multiplier;
- the first term represents axial compliance;
- the second term represents transverse bending compliance.

For a single bilateral restraint with pipe compliance `C_pipe` and finite support stiffness `K_s`:

```text
THM-COMP-02: C_total = C_pipe + 1/K_s
THM-RXN-01:  R = -Delta_rel / C_total
```

For a rigid support, `1/K_s = 0` only when rigid support is explicit or configured.

For multiple restraints in one qualified direction:

```text
THM-NET-01: C_RR R = -Delta_free,R
```

This is one direct compatibility solve. Independent `R_i = k_i Delta_i` calculations are not permitted when restraints share the same prevented movement.

### 7.10 Bilateral gap logic

For a single configured bilateral stop with positive and negative clearances `g+` and `g-`:

```text
if -g- <= Delta_rel <= g+:
    R = 0
else if Delta_rel > g+:
    R = -(Delta_rel - g+) / C_total
else:
    R = -(Delta_rel + g-) / C_total
```

Multiple interacting gap faces remain outside the initial no-iteration scope unless a deterministic one-correction method is separately qualified.

### 7.11 Configurable vertical contact retention

A true open frictionless contact carries no compressive load. The partial-retention model is therefore an explicitly empirical transition law representing unresolved local support/pipe compliance, contact width, sag, construction tolerance, support flexibility and model uncertainty.

Relative upward movement:

```text
VRT-REL-01:
Delta_z_rel = z_pipe,hot - z_support,hot - g_cold
```

After configured deadband `d_0`:

```text
VRT-DEF-01: d = max(0, Delta_z_rel - d_0)
```

Preferred unloading-stiffness form:

```text
VRT-K-01: R_raw = max(0, R_SUS - k_unload d)
VRT-ETA-01: eta = R_raw / R_SUS
```

User-friendly half-load form:

```text
VRT-CFG-01:
eta = clamp[1 - (1-eta_50)(d/d_50)^p, 0, 1]

VRT-RXN-01:
R_raw = eta R_SUS

VRT-REL-02:
R_released = R_SUS - R_raw
```

For the example request:

```text
d_50 = 0.5 mm
eta_50 = 0.5
p = 1.0
```

This produces a continuous transition rather than a discontinuous rule that jumps directly from 100% to 50%.

Supported configured models:

```text
RIGID_UNILATERAL
EFFECTIVE_UNLOADING_STIFFNESS
HALF_LOAD_DISPLACEMENT
TABULATED_RETENTION_CURVE
SOURCE_REACTION_CURVE
```

### 7.12 One-pass released-load redistribution

For released load `L_i` at chainage `x_i`, bracketed by active supports `x_a` and `x_b`:

```text
VRT-RED-01: DeltaR_a = L_i (x_b - x_i)/(x_b - x_a)
VRT-RED-02: DeltaR_b = L_i (x_i - x_a)/(x_b - x_a)
```

This preserves local vertical force and first moment exactly.

For a qualified continuous open-chain model, a precomputed influence matrix may be used:

```text
VRT-RED-03: DeltaR = H L_released
```

`H` is generated once from the same span lengths and `EI` authority used by the sustained calculation.

Permitted correction strategy:

```text
pass 1: calculate movement and retention
redistribute released load
pass 2: recalculate movement once and update retention
accept if configured change tolerance passes
otherwise: publish conservative envelope or BLOCK
```

The configured maximum correction-pass count shall initially be `0` or `1`.

### 7.13 Optional one-pass P-delta screening

P-delta is treated separately from the empirical contact-transition curve.

For a qualified isolated span:

```text
PD-CR-01: N_cr = pi^2 E I_eff / (K L_eff)^2
PD-RAT-01: eta_b = N_compression / N_cr
PD-AMP-01: B = 1 / (1 - eta_b)
PD-DSP-01: Delta_z_2 = B Delta_z_1
```

The corrected displacement may then enter the retention curve.

Required rules:

- only compressive axial force uses destabilizing amplification;
- tensile force does not use this equation;
- `K`, `L_eff` and `I_eff` require source/configured authority;
- the calculation blocks above the qualified compression ratio;
- an amplification cap may be used only as a blocking threshold, not as a hidden substituted answer;
- bends, branches, loops, springs, large rotations and post-buckling response initially block this correction unless separately qualified.

### 7.14 Sustained stress

The production code-stress route shall use the edition-bound dataset and existing sustained-stress engine.

Representative calculation terms:

```text
STR-PA-01: A_p = pi/4 D_i^2
STR-PF-01: F_p = P A_p
STR-NA-01: N_SUS = configured code-dataset combination of F_p and N_mechanical
STR-SA-01: S_a = N_SUS / A
STR-SB-01: S_b = hypot(i_i M_i, i_o M_o) / Z
STR-ST-01: S_t = T / (2Z)
STR-SL-01: S_L = hypot(|S_a| + S_b, 2S_t)
STR-UT-01: U = S_L / S_allowable
```

The exact pressure area, force sign, sustained indices, allowable and code citations belong to the selected edition-bound dataset. They shall not be silently hard-coded.

When no edition-bound code dataset is available, a separately labelled non-code screening result may be produced only with an explicit project screening allowable:

```text
NOT_B31_3_COMPLIANCE
```

---

## 8. Load-case ownership

The initial report shall define at least:

```text
W-COLD
P
SUS-W
SUS-W+P
T-HOT
OPE-HOT-SCREENING
```

Each load case shall explicitly declare ownership of:

- pipe metal weight;
- operating fluid weight;
- insulation weight;
- component weight;
- pressure longitudinal stress;
- pressure thrust;
- thermal strain;
- imposed nozzle/equipment movement;
- support movement;
- support gap;
- P-delta screening;
- vertical contact retention.

Missing pressure in `SUS-W+P` blocks. Zero pressure is valid only when the case explicitly declares zero pressure or pressure exclusion.

---

## 9. Fallback and blocking matrix

| Input | Preferred authority | Permitted configured fallback | Mandatory block condition |
|---|---|---|---|
| Coordinates/connectivity | Exact source topology | None | Missing or ambiguous topology |
| Branch/POS identity | Exact source identity | None | Missing identity |
| NPS | Exact source branch/component | Exact scoped class/line mapping | No exact scoped match |
| Schedule | Branch/fitting/source selection | Exact class + line + branch + NPS rule | Global/unscoped default or conflict |
| OD/wall | Exact schedule dataset | Approved section override tied to POS | Invalid annulus or unresolved lookup |
| Material | Exact source/class | Scoped material-family default | Ambiguous material family |
| `E`, `alpha` | Edition/material dataset | Scoped Project Data table | Outside configured temperature scope |
| Metal density | Material dataset | Scoped material default | Missing/invalid density |
| Fluid density | Exact process/line value | Explicit load-case/line default | Missing in requested fluid case |
| Temperature | Exact process value | Deterministic connected inheritance, then scoped case default | Conflict or missing thermal authority |
| Insulation | Exact source/class | Exact line/spec default | Missing when insulation included |
| Component mass | Exact source/master | Exact override, then enabled pipe-equivalent policy | No allowed policy |
| Pressure | Exact load-case source | Explicit case value | Missing in `W+P` case |
| Restraint capability | Exact support record | Approved support-type map | Unknown capability |
| Restraint axis | Explicit source vector | Configured host-tangent derivation or exact override | Ambiguous host direction |
| Gap/friction | Exact support data | Support-class Project Data entry | Missing when effect enabled |
| Support stiffness | Exact source/vendor | Qualified support-class value | Missing when finite stiffness selected |
| `C_2E`/multipliers | Qualified method profile | Approved unlocked project profile | Not configured |
| Contact retention curve | Source/test curve | Approved Project Data curve | Enabled feature without curve |
| P-delta `K`, `L_eff` | Qualified boundary model | Exact boundary-class config | Ambiguous effective length |
| SIF/index | Edition-bound code dataset | None for code result | Missing/unresolved citation |
| Allowable | Edition-bound material dataset | Project allowable only for non-code screening | Missing for requested compliance result |

---

## 10. Auditable calculation receipt

### 10.1 Per-POS table

The calculation console and report shall include:

| POS | From | To | Branch | NPS | Sch | OD | Wall | Material | `A` | `I` | `Z` | Metal kg/m | Fluid kg/m | Insulation kg/m | Resolution |
|---|---|---|---|---|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---|

### 10.2 Per-support table

| Support | Node | Capability | Axis | SUS reaction | Hot movement | Gap | Retention model | Retained fraction | Released load | Final reaction | State |
|---|---|---|---|---:|---:|---:|---|---:|---:|---:|---|

### 10.3 Per-stress-station table

| Station | POS | Location | `N` | `M_i` | `M_o` | `T` | Pressure term | Axial stress | Bending stress | Torsion stress | `S_L` | Allowable | Utilization |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|

### 10.4 Required evidence

Every receipt shall retain:

- project, dataset and source hashes;
- Project Data semantic hash and revision;
- exact method and formula-register versions;
- resolved section/material/process records;
- configured default definitions;
- configured default usages;
- blocked/unresolved fields;
- load-case effect ownership;
- raw unrounded inputs and outputs;
- reported rounded values;
- equilibrium residuals;
- direct-solve conditioning where applicable;
- correction-pass count;
- applicability class;
- warnings and blockers;
- deterministic result hash.

### 10.5 Result statuses

```text
CALCULATED_SOURCE_ONLY
CALCULATED_WITH_CONFIGURED_DEFAULTS
CALCULATED_WITH_EMPIRICAL_RETENTION
BLOCKED_MISSING_REQUIRED_INPUT
BLOCKED_DEFAULT_OUTSIDE_SCOPE
BLOCKED_OUTSIDE_QUALIFIED_METHOD
BLOCKED_EQUILIBRIUM_FAILURE
BLOCKED_CORRECTION_NOT_CONVERGED
```

---

## 11. Worked hand calculation A — NPS 6 Sch 80 sustained span and stress

This example is illustrative. It shall become a deterministic benchmark only after the exact input contract, code dataset and automated reconciliation test are approved.

### 11.1 Declared inputs

```text
Pipe: NPS 6 Sch 80
D_o = 168.275 mm = 0.168275 m
t   = 10.9728 mm = 0.0109728 m
rho_steel = 7850 kg/m3
rho_fluid = 300 kg/m3
insulation thickness = 50 mm = 0.050 m
rho_insulation = 210 kg/m3
g = 9.80665 m/s2
span L = 6.0 m
valve mass = 150 kg at a = 2.0 m from support A
pressure P = 2.0 MPa
E = 203.4 GPa
illustrative sustained allowable = 120 MPa
sustained indices i_i = i_o = 1.0
torsion = 0
mechanical axial force = 0
```

### 11.2 Section properties

```text
D_i = D_o - 2t
    = 0.168275 - 2(0.0109728)
    = 0.1463294 m

A = pi/4 (D_o^2 - D_i^2)
  = 0.005422532114 m2

I = pi/64 (D_o^4 - D_i^4)
  = 1.685349041e-5 m4

Z = I/(D_o/2)
  = 2.003089040e-4 m3
```

### 11.3 Distributed mass and load

```text
m_metal/L = A rho_steel
          = 0.005422532114(7850)
          = 42.566877 kg/m

A_fluid = pi/4 D_i^2
        = 0.01681717584 m2

m_fluid/L = A_fluid rho_fluid
          = 0.01681717584(300)
          = 5.045153 kg/m

D_ins = D_o + 2t_ins
      = 0.268275 m

A_ins = pi/4(D_ins^2 - D_o^2)
      = 0.03428655682 m2

m_ins/L = A_ins rho_ins
        = 7.200177 kg/m

m_total/L = 42.566877 + 5.045153 + 7.200177
          = 54.812207 kg/m

w = (m_total/L)g
  = 54.812207(9.80665)
  = 537.524128 N/m
  = 0.537524 kN/m

P_valve = 150(9.80665)
        = 1470.9975 N
        = 1.470998 kN
```

### 11.4 Support reactions

```text
R_B = [wL(L/2) + P_valve a]/L
    = [537.524128(6)(3) + 1470.9975(2)]/6
    = 2102.904883 N
    = 2.102905 kN

R_A = wL + P_valve - R_B
    = 537.524128(6) + 1470.9975 - 2102.904883
    = 2593.237383 N
    = 2.593237 kN
```

Force check:

```text
R_A + R_B
= 2593.237383 + 2102.904883
= 4696.142266 N

wL + P_valve
= 537.524128(6) + 1470.9975
= 4696.142266 N

force residual = 0 N
```

Moment check about A:

```text
R_B L = 2102.904883(6) = 12617.42930 N.m

wL(L/2) + P_valve a
= 537.524128(6)(3) + 1470.9975(2)
= 12617.42930 N.m

moment residual = 0 N.m
```

### 11.5 Maximum bending moment

After the valve, shear is:

```text
V(x) = R_A - wx - P_valve
```

Set `V(x) = 0`:

```text
x_max = (R_A - P_valve)/w
      = (2593.237383 - 1470.9975)/537.524128
      = 2.087794 m
```

```text
M_max = R_A x - wx^2/2 - P_valve(x-a)
      = 4113.498092 N.m
      = 4.113498 kN.m
```

### 11.6 Pressure and sustained stress

Using the current edition-bound engine pressure-area basis for this illustration:

```text
A_p = pi/4 D_i^2
    = 0.01681717584 m2

F_p = P A_p
    = 2.0e6(0.01681717584)
    = 33634.35167 N

S_a = F_p/A
    = 33634.35167/0.005422532114
    = 6.202702 MPa

S_b = M_max/Z
    = 4113.498092/0.0002003089040
    = 20.535773 MPa

S_t = 0

S_L = hypot(|S_a| + S_b, 2S_t)
    = 26.738475 MPa

Utilization = S_L/120 MPa
            = 0.222821
```

Illustrative disposition:

```text
26.738 MPa < 120 MPa
SCREENING WITHIN DECLARED EXAMPLE ALLOWABLE
```

This is not a code-compliance conclusion until the edition, allowable, pressure-area rule, SIF/index citations and load-case ownership are bound to an approved code dataset.

---

## 12. Worked hand calculation B — reduced line-stop reaction

### 12.1 Declared route

```text
NPS 6 Sch 80 section from Example A
E = 203.4 GPa
alpha_mean = 1.28e-5 /C
T_ref = 21 C
T_hot = 325 C
DeltaT = 304 C
12 m leg parallel to global X
4 m return/flexibility leg perpendicular to X
line stop acts in X
C_2E = 2.55
component multipliers = 1.0
rigid support explicitly selected
zero gap explicitly selected
```

### 12.2 Free X movement

Only the 12 m X-parallel leg contributes direct X free expansion:

```text
epsilon_th = alpha DeltaT
            = 1.28e-5(304)
            = 0.0038912

DeltaX_free = epsilon_th(12)
            = 0.0466944 m
            = 46.6944 mm
```

### 12.3 X compliance

Axial compliance of the 12 m parallel leg:

```text
C_axial = L/(EA)
        = 12/[203.4e9(0.005422532114)]
        = 1.08799817e-8 m/N
        = 0.010880 mm/kN
```

Bending compliance of the 4 m perpendicular leg:

```text
C_bending = L^3/(C_2E E I)
          = 4^3/[2.55(203.4e9)(1.685349041e-5)]
          = 7.32148179e-6 m/N
          = 7.321482 mm/kN
```

```text
C_total = 0.010880 + 7.321482
        = 7.332362 mm/kN
```

### 12.4 Line-stop reaction

```text
R_X = DeltaX_free/C_total
    = 46.6944/7.332362
    = 6.368262 kN
```

The reaction sign shall follow the configured `RESTRAINT_ON_PIPE` convention and oppose the positive free movement.

For the same idealized route, a transverse Y guide with zero free Y movement and no imposed Y movement has:

```text
DeltaY_free = 0
R_Y = 0
```

This benchmark is important: axial thermal expansion alone shall not create a guide force in an unrelated transverse direction.

---

## 13. Worked hand calculation C — configurable partial retention and one-pass P-delta

This example uses the PR #758 benchmark support preload only as an illustrative starting value:

```text
R_SUS = 1.859 kN
first-order upward relative movement = 0.420 mm
configured deadband d_0 = 0.050 mm
configured d_50 = 0.500 mm
configured eta_50 = 0.500
curve exponent p = 1.0
```

### 13.1 Optional one-pass P-delta amplification

For the NPS 6 Sch 80 section, a qualified 6 m isolated span with:

```text
E = 203.4 GPa
I = 1.685349041e-5 m4
K = 1.0
N_compression = 50 kN
```

has:

```text
N_cr = pi^2 E I/(KL)^2
     = pi^2(203.4e9)(1.685349041e-5)/(6^2)
     = 939.806 kN

eta_b = 50/939.806
      = 0.053203

B = 1/(1-eta_b)
  = 1.056192

Delta_z_2 = B Delta_z_1
          = 1.056192(0.420)
          = 0.443601 mm
```

### 13.2 Retained fraction

```text
d = max(0, Delta_z_2 - d_0)
  = 0.443601 - 0.050
  = 0.393601 mm

eta = 1 - (1-0.5)(d/0.5)
    = 1 - 0.5(0.393601/0.5)
    = 0.606399
```

### 13.3 Retained and released loads

```text
R_raw = eta R_SUS
      = 0.606399(1.859)
      = 1.127296 kN

R_released = R_SUS - R_raw
           = 1.859 - 1.127296
           = 0.731704 kN
```

For a support exactly midway between two adjacent active supports, one-pass static redistribution gives:

```text
DeltaR_left  = 0.731704/2 = 0.365852 kN
DeltaR_right = 0.731704/2 = 0.365852 kN
```

Force check:

```text
R_raw + DeltaR_left + DeltaR_right
= 1.127296 + 0.365852 + 0.365852
= 1.859000 kN
```

Reported state:

```text
PARTIAL_RETENTION_SCREENING
```

This is not reported as true partial physical contact unless the unloading curve is supported by test, measurement, manufacturer data or a separately qualified local support model.

For comparison, with P-delta disabled:

```text
d = 0.420 - 0.050 = 0.370 mm
eta = 0.630
R_raw = 1.171 kN
```

The report shall show both the first-order and amplified movement and identify which value governed.

---

## 14. Console and report presentation

Example console section:

```text
CALCULATION COMPLETED WITH CONFIGURED DEFAULTS

Unique defaults configured: 8
Unique defaults used: 4
Entity/POS applications: 221

VERTICAL CONTACT SCREENING
Support: PS-12169
Cold sustained reaction:       1.859 kN
First-order hot uplift:        0.420 mm
P-delta amplification:         1.056192
Corrected hot uplift:          0.443601 mm
Support hot movement:          0.000 mm [CONFIGURED DEFAULT]
Cold gap:                      0.000 mm [CONFIGURED DEFAULT]
Deadband:                      0.050 mm
Retention model:               HALF_LOAD_DISPLACEMENT
Half-load displacement:        0.500 mm
Retained fraction:             60.640%
Raw retained reaction:         1.127 kN
Released reaction:             0.732 kN
Redistribution method:         ADJACENT_SUPPORT_STATICS
Correction passes used:        0
Final state:                   PARTIAL_RETENTION_SCREENING
```

Report sections:

1. calculation identity and status;
2. scope and exclusions;
3. load-case ownership;
4. source and Project Data hashes;
5. node/POS resolved-property table;
6. weight contribution ledger;
7. pressure-action ledger;
8. sustained reactions and equilibrium;
9. member-action diagrams/tables;
10. sustained stress stations;
11. thermal-displacement table;
12. guide/line-stop compatibility reactions;
13. vertical retention and redistribution;
14. configured defaults available;
15. configured defaults actually used;
16. inherited and derived values;
17. blockers and warnings;
18. hand-calculation reconciliation;
19. applicability and limitations;
20. deterministic receipt hash.

---

## 15. Qualification and benchmark plan

### 15.1 Section and mass

- NPS 6 Sch 80 exact section check;
- multiple schedules and NPS values;
- invalid annulus;
- branch schedule conflict;
- source-only fixture with zero default usage;
- configured scoped schedule mapping;
- global schedule default rejection.

### 15.2 Sustained reactions

- two-support UDL;
- two-support point load;
- mixed UDL and point load;
- unequal span;
- exact-at-support point load;
- multiple point loads;
- continuous two-span beam;
- variable `EI`;
- support settlement;
- pressure thrust aligned and transverse to the route;
- force and moment residual assertions.

### 15.3 Sustained stress

- pure axial pressure term;
- pure in-plane bending;
- combined in/out-of-plane bending;
- torsion;
- reducer/tee/elbow station factors;
- missing code citation;
- allowable lookup failure;
- code and non-code result-class separation.

### 15.4 Thermal displacement and restraints

- straight unrestrained expansion;
- fully restrained straight bar;
- L-route line-stop hand calculation;
- zero transverse guide load for pure axial expansion;
- finite support stiffness;
- single positive/negative gap;
- multiple restraints in one direct compatibility solve;
- singular/unrestrained direction blocking;
- branch/loop outside-scope blocking.

### 15.5 Vertical retention

- zero movement gives 100% retention;
- `d = d_50` gives `eta_50`;
- movement reaching the curve zero gives zero retention;
- deadband boundary;
- table-based curve interpolation;
- midpoint and unequal-spacing redistribution;
- one correction pass;
- correction-tolerance failure;
- P-delta disabled parity;
- P-delta compression amplification;
- tensile axial-force no-amplification case;
- buckling-utilization blocking.

### 15.6 Governance

- stale Project Data hash;
- altered default ID;
- default outside scope;
- hidden-zero source guard;
- deterministic byte-identical execution;
- source non-mutation;
- exact formula trace;
- raw-versus-rounded value preservation;
- presenter contains no mechanics.

---

## 16. Implementation work packs

| Work pack | Scope | Exit evidence |
|---|---|---|
| `RPT-00` | Approve this report structure, notation, signs and result classes | Reviewed calculation-basis document |
| `CFG-01` | Add Project Data calculation-default fields | Schema, UI, validation and import/export tests |
| `CFG-02` | Implement common resolution service and usage ledger | Source/default/block fixtures |
| `SEC-01` | Connect branch/POS schedule resolver to common section state | 163-row node/POS audit and exact section benchmark |
| `WGT-01` | Implement mass and weight contribution ledger | Hand-calc parity and equilibrium |
| `PRS-01` | Implement pressure ownership and thrust ledger | Boundary/direction fixtures |
| `SUS-01` | Implement simple-span sustained reactions | Exact analytical fixtures |
| `SUS-02` | Implement continuous open-chain slope-deflection/transfer solve | Two-span and variable-`EI` fixtures |
| `ACT-01` | Recover shear, moments, axial force and torsion at stations | Member-action hand checks |
| `STR-01` | Integrate edition-bound sustained-stress engine | Station stress and utilization receipt |
| `THM-01` | Implement thermal vector movement | Straight and routed hand checks |
| `RST-01` | Implement reduced guide/line-stop compatibility | L-route and multi-restraint benchmarks |
| `VRT-01` | Implement configured vertical retention curve | Curve and default-usage tests |
| `VRT-02` | Implement one-pass redistribution and optional correction | Force/moment and tolerance checks |
| `PD-01` | Implement optional one-pass P-delta screening | Euler amplification and blocking tests |
| `AUD-01` | Add console/report tables and formula traces | Full immutable receipt |
| `QUAL-01` | Run analytical and controlled external correlation | Applicability classes and error statement |

Recommended implementation order:

```text
RPT-00
-> CFG-01/CFG-02
-> SEC-01
-> WGT-01/PRS-01
-> SUS-01/SUS-02
-> ACT-01/STR-01
-> THM-01/RST-01
-> VRT-01/VRT-02
-> PD-01
-> AUD-01
-> QUAL-01
```

---

## 17. Acceptance gates

The method shall not be promoted until all of the following pass:

1. every calculated POS uses the common section/material state;
2. a source-only fixture reports zero configured-default uses;
3. every configured default use has a ledger row;
4. changing Project Data invalidates the result receipt;
5. no hidden zero, unity, schedule, material, stiffness, gap or friction substitution remains;
6. missing required pressure blocks `SUS-W+P`;
7. sustained support reactions satisfy force and moment equilibrium;
8. member actions reconcile with span loads and reactions;
9. every stress value identifies section, actions, indices, allowable and code dataset;
10. straight axial expansion produces zero unrelated transverse guide load;
11. line-stop reactions reproduce approved hand calculations;
12. retained fractions reproduce the configured curve exactly;
13. released vertical load is fully redistributed;
14. P-delta is reported separately and blocks outside its scope;
15. correction-pass count is `0` or `1` for the initial method;
16. independent result families are not misrepresented as a coupled operating resultant;
17. raw values, rounded values, formula IDs and semantic hashes are retained;
18. structural support calculations remain explicitly outside this phase.

---

## 18. Final report deliverable

After `RPT-00` review, this plan shall be converted into a controlled technical report containing:

- approved notation and sign conventions;
- complete formula register with source/basis references;
- Project Data schema and fallback policy;
- exact calculation algorithms;
- hand calculations;
- benchmark results;
- automated-versus-hand-calculation reconciliation;
- applicability classes;
- known limitations;
- qualification evidence;
- revision history and approvals.

The report shall remain auditable at node, POS, support, restraint, load contribution, stress station, formula and configured-default level.
