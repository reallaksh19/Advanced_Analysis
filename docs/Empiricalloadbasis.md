# Empirical Load Basis

**Document status:** Living concept note and implementation basis  
**Repository path:** `docs/Empiricalloadbasis.md`  
**Initial issue date:** 2026-08-06  
**Applies to:** Empirical vertical, axial line-stop, guide, anchor and lift-off calculations  
**Output force convention:** restraint force **on the pipe** unless an output explicitly states otherwise

> This document is the persistent calculation basis for empirical piping loads. Any change to formulas, assumptions, configuration, UI behavior, qualification limits or result ownership shall update this note in the same change set.

## 1. Purpose

The empirical load workflow shall always expose the calculation chain before publishing a reaction. It shall not return only a final force.

The minimum governed breakdown is:

1. pipe metal mass rate, kg/m;
2. contained-fluid mass rate, kg/m;
3. insulation mass rate, kg/m;
4. cladding and other distributed mass rates, kg/m, where applicable;
5. each constituent mass over the applicable element or tributary length, kg;
6. each lumped rigid/component mass, kg;
7. total mass, kg;
8. conversion from mass to force, kN;
9. thermal free movement, stiffness and contact logic for axial and guide loads;
10. support contact state, including lift-off and active-set re-solution; and
11. source, configuration, formula and qualification evidence.

Calculation is performed first. Benchmark comparison is performed only after the empirical inputs, profile and outputs are frozen. Benchmark output shall not be used to tune a coefficient before the empirical calculation is complete.

## 2. Scope and limitations

This basis defines the required logic for:

- `Fvertical`: gravity and qualified vertical thermal/contact reaction;
- `Faxial`: reaction parallel to the local pipe/terminal axis, normally a line-stop or anchor axial component;
- `Fguide`: reaction normal to the local pipe axis in a declared guide direction;
- anchor component ownership and controlled superposition;
- positive-vertical support contact and lift-off;
- pipe, fluid, insulation, cladding and rigid/component weight;
- NPS, outside diameter, wall thickness and corrosion treatment;
- input configuration, UI disclosure and calculation receipts.

This is an empirical screening and governed calculation basis. It is not a substitute for applicable piping-code design, detailed flexibility analysis or a qualified nonlinear finite-element model outside the method's authorized domain.

Unsupported topology, direction, contact, friction, stiffness or load ownership shall fail closed. The software shall not silently estimate a reaction by changing geometry, inventing a restraint axis, clipping a negative support force, or borrowing a coefficient from a benchmark.

## 3. Coordinate and sign conventions

Let:

- `v` be the unit vector opposite gravity, normally the positive vertical direction;
- `a` be the local pipe/terminal centerline unit vector used for the line-stop axial component;
- `n_g` be the declared guide-normal unit vector, perpendicular to `a` within tolerance;
- `g_vec` be the gravitational acceleration vector, magnitude normally `9.80665 m/s²`;
- reactions be reported as restraint force on the pipe.

The reported scalar components are:

```text
Fvertical = R · v
Faxial    = R · a
Fguide    = R · n_g
```

The vectors `a` and `n_g` are calculation directions only. They shall never mutate element geometry or source element direction. For example, changing a support from `+Z` to `+Y` does not change the geometric direction of the connected pipe element.

For an anchor, the component model is:

```text
ANC = vertical-restraint ownership
    + guide ownership
    + line-stop ownership
    + any separately qualified rotational or other ownership
```

The line-stop axis is the adjoining pipe or nozzle centerline. Guide axes are orthogonal to that centerline. Each force or moment component must have exactly one owner in a combined result.

## 4. NPS, dimensions and thickness bases

### 4.1 NPS is an identifier, not a diameter formula

NPS is a nominal label. Outside diameter shall be resolved from an authoritative pipe-dimension table or explicit source value. The software shall never calculate outside diameter directly from the NPS number.

Required source fields are:

```text
NPS
outside diameter Do
nominal wall thickness t_nom
corrosion allowance CA
optional negative mill tolerance
material
```

### 4.2 Three thickness concepts shall remain separate

A single wall value shall not be used blindly for mass, fluid bore and stiffness.

**Installed mass thickness**

```text
t_mass = installed/as-modelled metal thickness
```

Default basis: nominal installed wall. Corrosion allowance normally does not reduce the original installed metal weight. A scenario may model an aged/corroded mass state only when that is explicit and traceable.

**Structural effective thickness**

```text
t_struct = t_nom - CA - configured structural deductions
```

The configured structural deduction may include a qualified treatment of mill tolerance. `t_struct` is used for section area and inertia in thermal stiffness calculations. It shall be greater than zero and within the profile's dimensional domain.

**Fluid-bore thickness**

```text
t_bore = configured thickness used to determine fluid inside diameter
```

Default basis: nominal installed bore. An aged-bore option may use corrosion metal loss only when explicitly selected. Fluid inventory and structural stiffness therefore need not use the same inside diameter.

The receipt shall show all three values and their basis identifiers.

### 4.3 Section properties

For outside diameter `Do` and the applicable thickness `t`:

```text
Di = Do - 2 t
A  = π/4  (Do² - Di²)
I  = π/64 (Do⁴ - Di⁴)
```

Use:

- `A_mass` from `t_mass` for pipe metal mass rate;
- `A_struct` and `I_struct` from `t_struct` for axial and bending stiffness;
- `Di_bore` from `t_bore` for fluid mass rate.

All calculations shall use a consistent internal unit system, preferably metres, kilograms, seconds, pascals and newtons. UI values may be shown in millimetres, kg/m and kN.

## 5. Constituent mass-rate formulas

### 5.1 Pipe metal

```text
A_metal = π/4 (Do² - Di_mass²)
w_metal = ρ_metal A_metal
```

where `w_metal` is in kg/m when dimensions are in metres and density is in kg/m³.

### 5.2 Contained fluid

```text
A_fluid = π/4 Di_bore²
w_fluid = ρ_fluid A_fluid f_fill
```

where `f_fill` is between `0` and `1`. A gas or partially filled line shall use an explicit operating density and fill fraction. The UI shall not assume water unless the profile explicitly authorizes that assumption.

### 5.3 Insulation

For insulation thickness `t_ins` and density `ρ_ins`:

```text
D_ins = Do + 2 t_ins
A_ins = π/4 (D_ins² - Do²)
w_insulation = ρ_ins A_ins
```

When insulation is omitted or not applicable, the calculation shall show `0.000 kg/m`, not a blank cell.

### 5.4 Cladding and other distributed mass

For cladding thickness `t_clad` and density `ρ_clad`:

```text
D_clad = D_ins + 2 t_clad
A_clad = π/4 (D_clad² - D_ins²)
w_cladding = ρ_clad A_clad
```

Other distributed loads such as heat tracing, lining or an explicitly distributed component allowance shall be separate rows with source and basis identifiers.

### 5.5 Total distributed mass rate

```text
w_total = w_metal
        + w_fluid
        + w_insulation
        + w_cladding
        + Σ w_other
```

For element length `L`:

```text
m_metal      = w_metal L
m_fluid      = w_fluid L
m_insulation = w_insulation L
m_cladding   = w_cladding L
m_other      = Σ w_other L
m_distributed = w_total L
```

The UI and exported receipt shall show both kg/m and kg for every constituent.

## 6. Rigid and component weights

Valves, flanges, strainers, instruments, specialty items and rigid elements may be represented by source dry mass, source weight or a configured component catalogue record.

Every rigid/component record shall declare:

```text
component ID
component type
source/reference
mass or weight and original unit
converted mass in kg
application point or distributed length
replacementMode = REPLACES_PIPE | ADDS_TO_PIPE
fluid-cavity treatment
insulation treatment
basis = LUMPED_DRY_MASS | DISTRIBUTED_COMPONENT_MASS | SOURCE_WEIGHT
```

Rules:

1. A lumped rigid mass is displayed in kg, not falsely presented as ordinary pipe kg/m.
2. If a source supplies weight force, convert it to mass using the declared source gravity before combining with kg values.
3. `REPLACES_PIPE` removes the displaced pipe/insulation/fluid mass over the declared replacement length before adding component mass.
4. `ADDS_TO_PIPE` retains the underlying pipe mass and adds the component mass.
5. Component dry mass, cavity fluid and component insulation shall remain separately auditable.
6. No rigid/component mass may be counted both as element distributed mass and lumped mass.

Total system or tributary mass is:

```text
m_total = Σ m_distributed + Σ m_rigid + Σ m_other_lumped
```

## 7. Vertical force basis — `Fvertical`

### 7.1 Gravity force

For mass `m`:

```text
F_weight_vector = m g_vec
W = m |g_vec| / 1000       [kN]
```

With positive vertical unit vector `v` opposite gravity, the applied weight component is negative:

```text
F_applied,vertical = F_weight_vector · v
```

A positive vertical support reaction on the pipe resists this downward load.

### 7.2 Element and support ledgers

Two ledgers are mandatory:

1. **Element mass ledger** — every element shows constituent kg/m, length, constituent kg, lumped masses and total kg.
2. **Support tributary ledger** — every support shows the constituent kg allocated to it before conversion to kN.

Ledger closure requirements are:

```text
Σ constituent mass = element total mass
Σ element mass + Σ lumped mass = model total mass
Σ active-support allocated mass = supported model mass
Σ vertical reactions + Σ applied vertical loads = equilibrium residual
```

All closures shall pass configured numerical tolerances before publication.

### 7.3 Tributary allocation

For a simply supported span of length `L` with uniform mass rate `w`:

```text
m_A = w L / 2
m_B = w L / 2
```

For a point mass `m_p` at distance `a` from support A:

```text
m_A,p = m_p (L - a) / L
m_B,p = m_p a / L
```

A CoG-aware or beam/contact method shall be used where geometry, bends, branches, support stiffness or lift-off makes midpoint tributary allocation inadequate.

### 7.4 Vertical thermal contribution

Thermal expansion does not create a vertical force merely because a line is hot. A vertical thermal reaction exists only through qualified compatibility, bending, restraint direction and contact state.

For the qualified planar beam/contact method, thermal initial strain is assembled with member stiffness and the vertical support active set. The thermal vertical reaction is recovered from the solved system. It shall not be approximated by projecting `EA α ΔT` onto vertical without a valid load path.

### 7.5 Weight projection into other directions

For any declared direction `d`:

```text
F_weight,d = F_weight_vector · d
```

Therefore:

- a horizontal pipe has no direct axial weight component;
- a vertical pipe carries weight axially;
- a horizontal guide normally receives no direct weight-normal load;
- a sloped line may have direct axial or guide-normal weight components;
- friction generated by vertical normal force is a separate effect and shall not be hidden inside direct weight projection.

## 8. Axial/line-stop force basis — `Faxial`

### 8.1 Free thermal expansion

For a uniform temperature change:

```text
ε_th = α ΔT
ΔL_free = α ΔT L
```

For temperature-dependent expansion coefficient or nonuniform temperature:

```text
ε_th = ∫(T_ref to T_op) α(T) dT
ΔL_free = ∫ ε_th(s) ds
```

The source of `α`, `T_ref`, operating temperature and interpolation rule shall be included in the receipt.

### 8.2 Axial member stiffness and force

For a straight member:

```text
k_ax = E_T A_struct / L
N = k_ax [(u_j - u_i) · a - ΔL_free]
```

where `E_T` is the qualified modulus for the load state. For a fully restrained uniform straight member:

```text
|Faxial| = E_T A_struct α ΔT
```

This is a full-restraint upper-bound case, not a general piping-system result.

### 8.3 Global empirical restraint network

For a connected axial network, each member uses its own `k_ax` and imposed thermal expansion. Nodal compatibility and equilibrium are solved together. Branches and cycles shall be handled by the qualified network method, not by adding independent scalar spans.

A member force may be written as:

```text
N_e = k_e (B_e u - Δ_e,th)
```

and the global system enforces:

```text
Σ nodal member forces + external forces + restraint reactions = 0
```

The receipt shall include graph identity, connected region, cycle rank, matrix rank, residual and force-closure evidence.

### 8.4 Flexure-controlled line-stop screening

Where axial thermal movement is absorbed mainly by a perpendicular flexural leg, an authorized profile may use:

```text
k_LS = C_2E E_T I_struct / L_perp³
```

For axial pipe stiffness, flexural-leg stiffness and finite support stiffness in series:

```text
1 / k_eff = 1 / k_ax + 1 / k_LS + 1 / k_support
Faxial = k_eff δ_contact
```

`C_2E` is a profile parameter, not a universal constant. The provisional value `2.55` is an ad hoc BM1 correlation and shall not be treated as independently calibrated, generalized or blindly validated. It may appear only in an explicitly identified provisional profile or explanatory example.

### 8.5 Axial gap and contact

For signed relative movement `δ_trial`, line-stop normal sign `s` and one-sided gap `g`:

```text
δ_penetration = max(0, s δ_trial - g)
Faxial = s k_eff δ_penetration
```

For a bilateral line stop, positive and negative gaps are evaluated separately. The UI shall display which side is active.

### 8.6 Weight and friction in axial load

Direct axial weight is only the gravity projection along `a`.

If friction is qualified and enabled:

```text
|F_friction| ≤ μ N_contact
```

with direction opposing relative sliding. Friction requires a valid active contact normal force. If the vertical support lifts off, its friction capacity becomes zero. Current methods that do not qualify friction shall return a blocker rather than assume `μ`.

### 8.7 Pressure thrust

Pressure thrust may be added only when an explicit closed-end, cap, bellows, nozzle or other effective-area load path is configured:

```text
F_pressure = P A_effective
```

Pressure stress and pressure thrust are not automatically part of empirical thermal line-stop force. A straight pressurized pipe does not justify adding `P × pipe bore area` to every anchor without custody of the actual load path.

## 9. Guide force basis — `Fguide`

### 9.1 Guide direction

A guide is defined by local pipe axis `a` and one or more guide normals `n_g` satisfying:

```text
a · n_g = 0
|a| = |n_g| = 1
```

The support direction may be global or local, but the resolved vector shall be visible and traceable. It shall not change the geometric axis of the connected element.

### 9.2 Thermal mismatch

The trial guide-normal movement is the projected relative free/compatible displacement:

```text
δ_g,trial = (u_pipe - u_support) · n_g
```

For a one-sided guide gap `g_g`:

```text
δ_g,contact = max(0, s δ_g,trial - g_g)
```

For bilateral guides, each side is checked independently.

### 9.3 Empirical guide stiffness

An authorized flexural profile may use:

```text
k_guide = C_g E_T I_struct / L_flex³
Fguide = s k_guide δ_g,contact
```

`C_g` depends on the actual boundary condition. Examples from elementary beam idealizations include `3` for a cantilever tip translation and `12` for a fixed-guided member translation, but the software shall not infer a coefficient only from the word “guide.” The selected coefficient and boundary profile must be qualified and shown in the receipt.

If axial, guide and support flexibilities act in series, the effective stiffness shall be assembled by compatibility rather than selecting the stiffest term.

### 9.4 Weight contribution to guide load

Direct weight contribution is:

```text
Fguide,weight = F_weight_vector · n_g
```

For a horizontal guide normal this is normally zero. Vertical guide normals or sloped coordinate systems may receive a direct weight component. Friction is a separate tangential effect.

## 10. Lift-off and unilateral support contact

### 10.1 Contact conditions

A positive-vertical rest can push upward on the pipe but cannot pull it downward. For support reaction `R_i` and physical separation `gap_i`:

```text
R_i ≥ 0
gap_i ≥ 0
R_i gap_i = 0
```

These are complementarity conditions.

### 10.2 Required active-set logic

The solver shall:

1. begin with the authorized candidate contact set;
2. solve weight, thermal initial strain and other qualified effects;
3. inspect each unilateral reaction and gap;
4. release any support with tensile/negative contact reaction beyond tolerance;
5. activate an eligible support only when qualified re-contact logic detects penetration;
6. re-solve the complete compatibility and equilibrium system;
7. repeat until the active set is stable or the iteration/domain gate fails.

A negative reaction shall never be changed to zero without re-solving. Simple clipping destroys equilibrium and misallocates weight.

### 10.3 Lift-off status

Each support shall report one of:

```text
ACTIVE_CONTACT
LIFTED_OFF
OPEN_GAP
BLOCKED_UNSUPPORTED_CONTACT
UNSTABLE_AFTER_RELEASE
```

For a lifted support:

```text
Fvertical = 0
friction capacity = 0
tributary weight must be redistributed by the re-solved system
```

The contact-history receipt shall show iteration, trial reaction, release/activation reason and final status.

## 11. Controlled operating-reaction ownership

A combined operating reaction may be published only when component ownership and compatibility are qualified.

A typical restricted ownership rule is:

```text
vertical method owns force parallel to v and qualified vertical moments
line-stop method owns force parallel to a
one guide method owns force parallel to each declared n_g
unowned components block publication
```

The combination shall verify:

- identical dataset and source hashes;
- identical coordinate and sign conventions;
- identical geometry and support custody;
- compatible cold/hot/reference temperatures;
- compatible active support set where required;
- orthogonal component axes;
- matching case/profile identity;
- no duplicate component ownership.

This is controlled superposition, not blind vector addition. Pressure compatibility and pressure stress remain excluded unless separately qualified.

## 12. Worked Example A — mass breakdown and `Fvertical`

The following values are illustrative and are not a benchmark result.

### 12.1 Input data

```text
NPS                         4
Outside diameter Do         114.3 mm
Nominal installed wall      6.0 mm
Corrosion allowance         1.5 mm
Mass thickness basis        NOMINAL_INSTALLED = 6.0 mm
Structural thickness basis  NOMINAL_MINUS_CA = 4.5 mm
Fluid-bore basis             NOMINAL_INSTALLED = 6.0 mm
Pipe density                 7850 kg/m³
Fluid density                998 kg/m³
Fill fraction                1.0
Insulation thickness         50 mm
Insulation density           120 kg/m³
Cladding thickness           0.8 mm
Cladding density             2700 kg/m³
Element length               6.0 m
Rigid valve dry mass         75.0 kg
Valve position               4.0 m from support A
Rigid replacement mode       ADDS_TO_PIPE
Gravity                      9.80665 m/s²
```

### 12.2 Distributed mass rates

Using nominal installed wall for mass:

```text
Di_mass = 114.3 - 2(6.0) = 102.3 mm
A_metal = 2041.407 mm²
w_metal = 16.025 kg/m
```

Fluid:

```text
w_fluid = 8.203 kg/m
```

Insulation:

```text
D_ins = 214.3 mm
w_insulation = 3.097 kg/m
```

Cladding:

```text
D_clad = 215.9 mm
w_cladding = 1.460 kg/m
```

Breakdown:

| Contribution | kg/m | Length, m | kg |
|---|---:|---:|---:|
| Pipe metal | 16.025 | 6.000 | 96.150 |
| Fluid | 8.203 | 6.000 | 49.218 |
| Insulation | 3.097 | 6.000 | 18.582 |
| Cladding | 1.460 | 6.000 | 8.758 |
| **Distributed subtotal** | **28.785** | **6.000** | **172.708** |
| Rigid valve dry mass | — | — | 75.000 |
| **Total** | — | — | **247.708** |

Vertical weight magnitude:

```text
W = 247.708 × 9.80665 / 1000
  = 2.429 kN
```

### 12.3 Support allocation

Uniform distributed mass is divided equally between the two simple supports:

```text
m_dist,A = m_dist,B = 172.708 / 2 = 86.354 kg
```

The 75 kg rigid valve at `a = 4 m` on a `6 m` span is allocated by statics:

```text
m_valve,A = 75 (6 - 4) / 6 = 25.000 kg
m_valve,B = 75 (4) / 6     = 50.000 kg
```

| Support | Distributed kg | Rigid kg | Total kg | Fvertical, kN |
|---|---:|---:|---:|---:|
| A | 86.354 | 25.000 | 111.354 | +1.092 |
| B | 86.354 | 50.000 | 136.354 | +1.337 |
| **Closure** | **172.708** | **75.000** | **247.708** | **+2.429** |

Positive values are upward restraint force on the pipe.

## 13. Worked Example B — `Faxial`

Use the same NPS 4 line, but structural wall is reduced by corrosion allowance:

```text
t_struct = 6.0 - 1.5 = 4.5 mm
Di_struct = 105.3 mm
A_struct = 1552.261 mm²
I_struct = 2.343194 × 10⁶ mm⁴
E_hot = 178435.906 MPa
α = 12.1 × 10⁻⁶ /°C
ΔT = 330°C
heated length L = 10.0 m
```

Free thermal movement:

```text
ε_th = 12.1 × 10⁻⁶ × 330 = 0.003993
ΔL_free = 0.003993 × 10 = 0.03993 m = 39.93 mm
```

Axial stiffness:

```text
k_ax = E A / L = 27.698 MN/m
```

Fully restrained upper-bound force:

```text
Faxial = E A α ΔT
        = 1105.98 kN
```

This value is intentionally large because it assumes zero system flexibility.

For an explanatory flexure-controlled line-stop screen with perpendicular leg `L_perp = 3.0 m` and provisional `C_2E = 2.55`:

```text
k_LS = 2.55 E I / L_perp³
     = 39.488 kN/m
```

With `k_ax` and `k_LS` in series and no support flexibility:

```text
k_eff = 1 / (1/k_ax + 1/k_LS)
      = 39.432 kN/m

Faxial = k_eff ΔL_free
        = 1.575 kN
```

This second number is only an illustration of flexibility dominance. The coefficient `2.55` is provisional BM1-specific and is not a general design coefficient.

## 14. Worked Example C — `Fguide`

Use the same corroded structural section:

```text
E_hot = 178435.906 MPa
I_struct = 2.343194 × 10⁶ mm⁴
flexural length L_flex = 3.0 m
cantilever boundary coefficient C_g = 3.0
thermal driving length = 4.0 m
guide gap on active side = 3.0 mm
α ΔT = 0.003993
```

Guide-normal free movement:

```text
δ_g,trial = 0.003993 × 4.0
          = 15.972 mm
```

Contact penetration:

```text
δ_g,contact = max(0, 15.972 - 3.000)
            = 12.972 mm
```

Guide stiffness:

```text
k_guide = 3 E I / L_flex³
        = 46.457 kN/m
```

Guide force:

```text
Fguide = 46.457 × 0.012972
       = 0.603 kN
```

The result direction is the active guide normal. The value is valid only for the stated cantilever idealization and contact side. A fixed-guided coefficient or a coupled network would produce a different stiffness.

## 15. Worked Example D — lift-off logic

Assume three positive-vertical rests support a total qualified weight of `3.432 kN`. The initial all-contact solve gives:

| Support | Weight reaction, kN | Thermal increment, kN | Trial reaction, kN |
|---|---:|---:|---:|
| S1 | +0.900 | -1.100 | **-0.200** |
| S2 | +1.600 | +0.600 | +2.200 |
| S3 | +0.932 | +0.500 | +1.432 |
| **Sum** | **+3.432** | **0.000** | **+3.432** |

`S1` cannot carry `-0.200 kN` because a positive-vertical rest cannot pull the pipe downward. Required logic:

```text
release S1
set S1 contact status = LIFTED_OFF
reassemble and re-solve with S2 and S3 active
```

An illustrative stable re-solve may return:

| Support | Final reaction, kN | Status |
|---|---:|---|
| S1 | 0.000 | LIFTED_OFF |
| S2 | +2.050 | ACTIVE_CONTACT |
| S3 | +1.382 | ACTIVE_CONTACT |
| **Sum** | **+3.432** | equilibrium closed |

The final values must come from the re-solved stiffness/compatibility model. They must not be obtained by setting S1 to zero and leaving the other trial reactions unchanged.

## 16. Required configuration contract

The authoritative runtime object shall be exact-schema JSON, deeply frozen, semantically hashed and bound to source revision. YAML may be offered only as an import/export representation that is parsed into the exact JSON contract.

Representative configuration:

```json
{
  "schema": "empirical-load-basis/v1",
  "scenarioId": "ELB-DEMO-001",
  "source": {
    "datasetId": "MODEL-001",
    "datasetHash": "sha256:...",
    "geometryHash": "sha256:...",
    "revision": "A"
  },
  "coordinateFrame": {
    "lengthUnit": "mm",
    "gravityVectorMPerS2": [0.0, -9.80665, 0.0],
    "forceConvention": "RESTRAINT_ON_PIPE"
  },
  "section": {
    "nps": "4",
    "outsideDiameterMm": 114.3,
    "nominalWallMm": 6.0,
    "corrosionAllowanceMm": 1.5,
    "millTolerancePercent": 0.0,
    "massThicknessBasis": "NOMINAL_INSTALLED",
    "structuralThicknessBasis": "NOMINAL_MINUS_CA",
    "fluidBoreBasis": "NOMINAL_INSTALLED",
    "corrosionAffectsMass": false,
    "corrosionAffectsFluidBore": false
  },
  "material": {
    "name": "Carbon steel",
    "densityKgPerM3": 7850.0,
    "hotElasticModulusMPa": 178435.906,
    "thermalExpansionPerC": 0.0000121,
    "referenceTemperatureC": 20.0,
    "operatingTemperatureC": 350.0
  },
  "contents": {
    "densityKgPerM3": 998.0,
    "fillFraction": 1.0
  },
  "insulation": {
    "thicknessMm": 50.0,
    "densityKgPerM3": 120.0,
    "claddingThicknessMm": 0.8,
    "claddingDensityKgPerM3": 2700.0
  },
  "rigids": [
    {
      "componentId": "V-101",
      "componentType": "VALVE",
      "basis": "LUMPED_DRY_MASS",
      "massKg": 75.0,
      "elementId": "E-100",
      "offsetFromFromNodeMm": 4000.0,
      "replacementMode": "ADDS_TO_PIPE",
      "source": "PROJECT_COMPONENT_CATALOGUE"
    }
  ],
  "restraints": [
    {
      "nodeId": "N-10",
      "type": "ANCHOR",
      "lineStopAxis": [0.0, 0.0, 1.0],
      "verticalDirection": [0.0, 1.0, 0.0]
    },
    {
      "nodeId": "N-40",
      "type": "GUIDE",
      "pipeAxis": [0.0, 0.0, 1.0],
      "guideNormal": [1.0, 0.0, 0.0],
      "positiveGapMm": 3.0,
      "negativeGapMm": 3.0,
      "frictionMode": "NOT_QUALIFIED"
    },
    {
      "nodeId": "N-70",
      "type": "POSITIVE_VERTICAL_REST",
      "initialGapMm": 0.0,
      "contactMode": "UNILATERAL_ACTIVE_SET"
    }
  ],
  "methods": {
    "vertical": "EMPIRICAL_BEAM_CONTACT_V1",
    "thermalNetwork": "EMPIRICAL_RESTRAINT_NETWORK_V2",
    "operatingCombination": "EMPIRICAL_OPERATING_REACTION_SUPERPOSITION_V1"
  },
  "profile": {
    "profileId": "PROJECT-QUALIFIED-001",
    "version": "1.0.0",
    "qualificationStatus": "QUALIFIED",
    "locked": true
  },
  "tolerances": {
    "massClosureKg": 0.00005,
    "forceClosureKN": 0.000001,
    "directionDotProduct": 0.000001,
    "contactReactionKN": 0.000001
  }
}
```

The example schema is a concept contract. Implementation shall reuse established repository schemas where they already own a field and shall not create duplicate authorities.

## 17. UI requirements

### 17.1 Basis and source pane

Display:

- dataset/revision/source hashes;
- selected scenario, method and profile;
- coordinate frame, gravity vector and force convention;
- NPS, OD, nominal wall, corrosion allowance and mill tolerance;
- separate mass, structural and fluid-bore thickness bases;
- material density, hot modulus and thermal expansion coefficient;
- temperature and pressure custody;
- warning when any field is assumed rather than source-derived.

### 17.2 Weight-build-up pane

Minimum columns:

| Field | Unit |
|---|---|
| Element/component ID | — |
| NPS | — |
| OD | mm |
| nominal wall | mm |
| corrosion allowance | mm |
| mass thickness | mm |
| structural thickness | mm |
| length | m |
| metal | kg/m and kg |
| fluid | kg/m and kg |
| insulation | kg/m and kg |
| cladding/other | kg/m and kg |
| rigid/component mass | kg |
| total | kg |
| gravity force | kN |
| basis/source | — |

The table shall support element, component, support-tributary and model-total views.

### 17.3 Thermal and stiffness pane

Display:

- `T_ref`, operating temperature, `ΔT`;
- `α` or integrated thermal strain;
- free movement by member/path;
- `A_struct`, `I_struct`, hot modulus;
- axial, guide, line-stop and support stiffness terms;
- series/parallel compatibility basis;
- gap, active side and contact penetration;
- empirical coefficients with profile ID and qualification status.

### 17.4 Contact and lift-off pane

Display:

- candidate and final contact sets;
- trial reaction and gap at each iteration;
- release/activation reason;
- final status;
- instability or unsupported re-contact blockers;
- friction capacity only where contact and friction are qualified.

### 17.5 Result pane

Each support result shall show:

```text
Fvertical
Faxial
Fguide for each owned guide normal
other force components and owner
moments and owner
contact status
case/result family
formula IDs
profile and qualification status
source/configuration hashes
closure residuals
```

The UI shall distinguish:

```text
VERTICAL_SCREENING_RESULT
THERMAL_LINE_STOP_SCREENING_RESULT
COMBINED_OPERATING_REACTION
NOT_A_COMBINED_OPERATING_REACTION
```

### 17.6 3D overlays

- arrows use resolved global directions without mutating geometry;
- vertical, line-stop and guide components are visually distinguishable;
- selection is synchronized between table and viewport;
- lifted supports are visibly open/inactive;
- stale or unauthorized results are cleared immediately;
- sign convention and scale are always visible.

### 17.7 Export and evidence

Exports shall contain:

- full input/configuration snapshot;
- formula version and formula IDs;
- element mass ledger;
- support tributary ledger;
- rigid/component ledger;
- thermal movement and stiffness ledger;
- contact history;
- final reactions and ownership;
- equilibrium, mass and compatibility closures;
- source, geometry, configuration and result hashes;
- warnings, blockers and qualification domain.

A final force without this evidence is not an authorized empirical result.

## 18. Formula identifiers

Recommended stable identifiers:

```text
ELB-SEC-001  NPS/OD/wall resolution
ELB-SEC-002  mass, structural and bore thickness resolution
ELB-MAS-010  pipe metal kg/m
ELB-MAS-011  fluid kg/m
ELB-MAS-012  insulation kg/m
ELB-MAS-013  cladding/other kg/m
ELB-MAS-014  rigid/component mass
ELB-VRT-020  mass-to-gravity-force conversion
ELB-VRT-021  tributary allocation
ELB-VRT-022  vertical beam/contact solution
ELB-THM-030  thermal strain and free expansion
ELB-AXL-040  axial stiffness/network force
ELB-AXL-041  flexure-controlled line-stop stiffness
ELB-GDE-050  guide mismatch, gap and force
ELB-CON-060  unilateral contact/lift-off
ELB-OPE-070  controlled component ownership/superposition
ELB-GOV-080  mass, force and evidence closure
```

The receipt shall record formula identifier and formula version for every published value.

## 19. Validation and fail-closed gates

Publication is blocked when any of the following applies:

- NPS does not resolve to an authoritative OD;
- wall, corrosion or thickness basis is missing or nonphysical;
- mass, fluid or insulation properties are missing without an explicit zero/not-applicable state;
- rigid mass replacement/addition basis is ambiguous;
- element and support mass ledgers do not close;
- gravity conversion does not close;
- restraint direction is unresolved or non-orthogonal where orthogonality is required;
- support direction has mutated source geometry;
- temperature, modulus or expansion basis is stale;
- a provisional/unqualified coefficient is selected for an authorized result;
- contact requires unqualified finite-gap re-contact or friction;
- a unilateral reaction is clipped instead of re-solved;
- the active support set is unstable;
- branch/loop topology exceeds the selected method domain;
- force/moment ownership overlaps or leaves required components unowned;
- source, configuration or profile hash is stale;
- benchmark output influenced the frozen empirical input/profile.

## 20. Qualification and benchmark discipline

For each benchmark:

1. freeze geometry, restraints, directions, dimensions, material, temperature, mass basis, rigid weights, methods and profile;
2. calculate and save the complete empirical receipt;
3. identify the one comparison axis for each restraint;
4. then read the reference result;
5. compare signed force, magnitude and percentage difference;
6. document whether the comparison is like-for-like in load case, contact state and sign convention;
7. do not retune the frozen result;
8. create a new profile/version for any later calibration.

A successful comparison does not generalize a coefficient beyond its qualified topology, size, temperature, restraint and contact domain.

## 21. Amendment rule

This file is the load-basis authority for continuing empirical-load development. A pull request that changes any of the following shall update this document:

- mass constituent logic;
- NPS/wall/corrosion treatment;
- rigid/component weight treatment;
- thermal expansion or stiffness formula;
- axial/guide/vertical ownership;
- gap, lift-off, re-contact or friction logic;
- configuration schema;
- UI disclosure;
- result receipt or qualification gates.

Each amendment shall add an entry below.

## 22. Revision log

| Date | Revision | Change |
|---|---|---|
| 2026-08-06 | 0.1 | Initial governed empirical load basis covering constituent mass, vertical, axial, guide, rigid weight, corrosion, lift-off, configuration, UI and examples. |
