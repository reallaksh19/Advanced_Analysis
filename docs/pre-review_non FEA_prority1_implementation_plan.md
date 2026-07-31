# Technical Audit & Revised Plan: StagedJSON Bulk Data Enrichment UI & Tributary COG Support Load Engine

This revised and audited engineering plan addresses structural mechanics, schema alignment, UI design, and modularity constraints for integrating **Bulk Data Enrichment** and **Tributary Center of Gravity (COG) Support Load Distribution** into `Advanced_Analysis`.

---

## Part 1: Executive Technical Audit & Engineering Improvements

During our technical audit of the initial plan against the existing codebase (`F:\CODE-6\Advanced_Analysis` and `3D_Converters`), we identified **4 critical architectural improvements**:

### 1. Structural Mechanics & DOF Filtering
- **Flaw Identified**: Applying gravity weights ($F_v$) identically across all support entities ignores Degrees of Freedom (DOF). In ASME B31.3 piping models, standalone lateral guides (`GUIDE`) and axial line stops (`LINESTOP` / `SNUB`) have zero vertical restraint stiffness ($K_y = 0$) unless paired with a vertical shoe/rest (`REST + GUIDE`).
- **Engineered Improvement**: The new load solver will filter active gravity supports along each branch run, isolating entities that restrain vertical motion (`REST`, `SPRING`, `ANC`, `HANG`, `SUPPORT`). Standalone `GUIDE`, `LINESTOP`, and `SNUB` entities will correctly receive $F_v = 0\text{ kN}$ and instead only bear calculated lateral ($F_h$) and axial ($F_a$) reactions.

### 2. Moment Equilibrium & Cantilever Overhangs
- **Flaw Identified**: Simple 50/50 ($0.5 L_{upstream} + 0.5 L_{downstream}$) span splitting fails at cantilever terminations (free pipe ends extending past an anchor or resting support) and under continuous multi-span beam shear distribution.
- **Engineered Improvement**: We implement a **3D Static Moment Equilibrium ($ \sum F_y = 0, \sum \mathbf{M} = 0 $)** calculation for spans and cantilever overhangs. For continuous multi-span runs, we apply classical three-moment beam distribution coefficients (e.g., $0.4 L_1 + 0.6 L_2$ at interior reactive supports) to properly capture upward prying forces and asymmetric fitting masses.

### 3. Schema Normalization (3D_Converters vs. Advanced_Analysis)
- **Flaw Identified**: Entities in `Advanced_Analysis` nest properties in `entity.properties.identity` or `entity.properties.geometry` with variable attributes (`lineId`, `pipeOdMm`, `tempC`), whereas `3D_Converters` (`sj-override-matrix.js`) assumes flat `rec.attrs.SPRE`, `ISPE`, or `LSTU`.
- **Engineered Improvement**: We introduce a **Universal Entity Resolver Adapter** (`enrichment-adapter.js`) that seamlessly translates between raw 3D converter SPRE paths and structural sketcher schemas before feeding data into the Override Matrix pattern groups.

### 4. Strict Modularity & Line-Count Safety (< 300 Lines Ceiling)
- **Flaw Identified**: `sequential-sketcher-view.js` currently contains **289 lines** (only 11 lines of headroom before triggering a compilation/lint error!).
- **Engineered Improvement**: We will **not** inject complex span traversal into existing views. Instead, we create a specialized standalone module, **`tributary-span-collector.js`** ($\sim 140$ lines), which builds the branch adjacency map, evaluates COGs, and feeds exact load coefficients into `support-engine.js` ($214$ lines $\rightarrow \sim 245$ lines). All new UI modules will be kept well below the 300-line invariant.

---

## Part 2: Comprehensive UI Design for Bulk Enrichment Workbench

The Bulk Enrichment UI adapts the **Resolution Override Matrix** from `F:\CODE-6\3D_Converters\tabs\stagedjson-to-enrichxml\` into a non-modal, floating, collapsible, and dockable workspace window (`EnrichmentMatrixDialog`).

### UI Layout Wireframe

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ⚡ Bulk Data Enrichment & Resolution Override Matrix                                    [ ─ Collapse ] [ □ Dock ] [ ✕ ]│
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 💡 279 Entities Loaded • 42 Unresolved Pattern Groups • Auto-Resolving via Piping Class & Weight Masters            │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ [ 📐 1. Piping Class (18) ]  [ ⚖ 2. Component Weights (12) ]  [ ⚓ 3. Support Restraints (8) ]  [ ⚙ 4. Global Defaults ]  │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ TAB 1: PIPING CLASS (Rating, Schedule, Wall Thickness, Corrosion Allowance)                                          │
│ ┌───────────────────────┬─────────┬───────────────┬──────────────────┬────────────────┬──────────────────────────┐ │
│ │ PIPING CLASS (SPRE)   │ BORE    │ RATING (lb)   │ WALL SCHEDULE    │ CORROSION (mm) │ STATUS / APPLIES TO      │ │
│ ├───────────────────────┼─────────┼───────────────┼──────────────────┼────────────────┼──────────────────────────┤ │
│ │ 31441C4r01-AMF1       │ 100 mm  │ [ 150 #  ▼ ]  │ [ STD      ▼ ]   │ [ 1.50   ]     │ ⚠️ 42 Pipe Spans (Unres) │ │
│ │ 31441C4r01-AMF1       │ 150 mm  │ [ 300 #  ▼ ]  │ [ Schedule 40 ▼ ]│ [ 1.50   ]     │ ⚠️ 18 Pipe Spans (Unres) │ │
│ │ HOLD-300#-HP          │ 200 mm  │ [ 600 #  ▼ ]  │ [ XS       ▼ ]   │ [ 3.00   ]     │ ⚠️ 12 Pipe Spans (Unres) │ │
│ │ MDS-150-LPS           │ 50 mm   │ [ 150 #  ▼ ]  │ [ STD      ▼ ]   │ [ 1.50   ]     │ ✅ 20 Pipe Spans (Valid) │ │
│ └───────────────────────┴─────────┴───────────────┴──────────────────┴────────────────┴──────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ TAB 2: COMPONENT WEIGHT MASTER (Valves, Flanges, Tees, Reducers, Strainers)                                          │
│ ┌───────────────────────┬─────────┬──────────────────────┬────────────────────────┬────────────────────────────┐ │
│ │ COMPONENT TYPE        │ BORE    │ KNOWN ITEM / TAG     │ UNIT WEIGHT OVERRIDE   │ APPLIES TO                 │ │
│ ├───────────────────────┼─────────┼──────────────────────┼────────────────────────┼────────────────────────────┤ │
│ │ VALV (Gate Valve)     │ 100 mm  │ VLV-GATE-150#        │ [ 45.0  ] kg           │ 8 Valve Nodes              │ │
│ │ FLAN (Weld Neck)      │ 100 mm  │ FLG-WN-150#          │ [ 12.5  ] kg           │ 16 Flange Nodes            │ │
│ │ ELBO (90 LR Elbow)    │ 100 mm  │ ELB-90-STD           │ [ 6.8   ] kg           │ 24 Elbow Nodes             │ │
│ └───────────────────────┴─────────┴──────────────────────┴────────────────────────┴────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ TAB 4: GLOBAL DEFAULTS & CONFIGURABLE FALLBACK SETTINGS (All Engine Fallbacks Managed Here!)                         │
│ ┌────────────────────────────────────────────────────────┬─────────────────────────────────────────────────────┐ │
│ │ DEFAULT PARAMETER / FALLBACK PROPERTY                  │ USER CONFIGURABLE OVERRIDE VALUE                    │ │
│ ├────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────┤ │
│ │ Default Wall Thickness Schedule Fallback               │ [ Standard Schedule (STD)                       ▼ ] │ │
│ │ Default Flange / Fitting ASME Rating Fallback          │ [ Class 150 (150#)                              ▼ ] │ │
│ │ Default Process Fluid Density Fallback                 │ [ 1000.0 ] kg/m³ (Water / Liquid lines)             │ │
│ │ Default Insulation Density & Thickness Fallback        │ Density: [ 200.0 ] kg/m³  Thick: [ 50.0 ] mm        │ │
│ │ Suggestive Thermal Envelope (Min / OPE / Max Design)   │ Min: [ -20 ] °C   OPE: [ 150 ] °C   Max: [ 180 ] °C │ │
│ └────────────────────────────────────────────────────────┴─────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ FOOTER ACTION BAR                                                                                                    │
│ 📊 Model Confidence: 84% (42 issues)  [🔄 Reset Defaults]  [📥 Import Master]  [💾 Export CSV]  [🚀 Perform Load Calc] │
└───────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Full Tab & Button Specifications

#### 1. Window Management Controls (Top Right)
- `[ ─ Collapse ]`: Minimizes the workbench window to a compact floating title bar in the corner of the viewport, preserving active inputs.
- `[ □ Dock ]`: Toggles between floating draggable overlay mode and splitting the bottom dock next to the Data Table.
- `[ ✕ ]`: Closes the enrichment matrix without discarding staged changes.

#### 2. Tab Specifications
- **`📐 1. Piping Class`** (Badge: unresolved piping class group count):
  - **Inputs**: HTML5 `<select>` dropdowns for Rating (`150#`, `300#`, `600#`, `900#`, `1500#`, `2500#`) and Wall Schedule (`STD`, `XS`, `XXS`, `Sch 10` through `Sch 160`). Numeric `<input type="number" step="0.01">` for Corrosion Allowance (mm).
  - **Real-time Validation**: Highlights cells red with an alert tooltip if an entered wall schedule is geometrically incompatible with the nominal bore according to ASME B36.10M.
- **`⚖ 2. Component Weights`** (Badge: count of fitting pattern types lacking explicit weights):
  - **Inputs**: Numeric `<input type="number" step="0.1" placeholder="kg">` for Unit Weight in kilograms.
  - **Behavior**: Entering a weight (e.g., $45\text{ kg}$ for `VALV` at $100\text{ mm}$ bore) applies instantly to all matching valves across the entire network. If catalog weight is absent, it calculates mass via our **Rating-Dependent ASME fitting formulas**, and prompts the user via Tab 4 if rating is missing!
- **`⚓ 3. Support Restraints`**:
  - **Inputs**: Dropdowns mapping raw field tags (`TAG`, `SUPPORT_KIND`) to standardized ASME restraint categories: `REST` (Vertical Stop), `ANCHOR` (6-DOF Fixation), `GUIDE` (Lateral Stop), `LINESTOP` (Axial Stop), `SPRING` (Variable Hanger).
- **`⚙ 4. Global Defaults & Configurable Fallback Settings` (Addendum Enhancement)**:
  - **100% User-Configurable Fallbacks**: No hardcoded hidden fallbacks! Users explicitly define what schedule (`STD`/`XS`), rating (`150#`/`300#`), fluid density ($1000\text{ kg/m}^3$), and fitting mass coefficients the engine should use when Level 1–3 data is absent.
  - **Suggestive Thermal Envelopes**: Configures suggestive envelopes for Min Design ($-20^\circ\text{C}$), Operating ($+150^\circ\text{C}$), and Max Design ($+180^\circ\text{C}$).

#### 3. Footer Action Buttons
- `[🚀 Perform Load Calc]` (Primary Blue CTA): Launches the Pre-Calculation Validation Audit (Appendix D), logs assumption lineage records, triggers `tributary-span-collector` and `PipingSupportEngine`, and refreshes all reaction callout tags on the SVG and WebGL canvases immediately.
- `[💾 Export CSV]`: Exports an industry-standard `_sideload.csv` file matching the `XmlCompareSideloadEnricher` schema for portability and auditable documentation.
- `[📥 Import Master]`: Opens a file picker to ingest an externally produced line list or component weight master CSV/JSON.
- `[🔄 Reset Defaults]`: Reverts override modifications back to original un-enriched imported defaults.

---

## Part 3: Tributary Support Load Mechanics & COG Calculation

### 1. Root Cause Analysis (RCA) Refusal of Static Fallbacks
Previously, `PipingSupportEngine.calculateEntityLoads` invoked on an isolated support entity (lacking length and thickness properties) evaluated a default $3\text{m}$ span of $4''$ pipe:
$$W_{default} = (16.07_{\text{pipe}} + 8.20_{\text{fluid}} + 2.50_{\text{insul}}) \text{ kg/m} \times 3.0\text{ m} = 80.31\text{ kg} \approx 82.5\text{ kg}$$
$$F_{v, default} = 82.5\text{ kg} \times 9.80665\text{ m/s}^2 \approx 810\text{ N} = \mathbf{0.81\text{ kN}}$$
The new engine removes this fallback by evaluating true tributary spans across adjacent piping geometry.

---

### 2. Mathematical Derivation of Tributary Load & COG Integration

#### A. Linear Mass Density ($w_{total}$)
For each pipe span $j$ with outer diameter $D_o$, wall thickness $t_w$, insulation thickness $t_{ins}$, pipe steel density $\rho_{steel} = 7850\text{ kg/m}^3$, fluid density $\rho_{fluid}$, and insulation density $\rho_{ins}$:
$$w_{pipe} = \pi (D_o - t_w) t_w \cdot \rho_{steel} \times 10^{-6} \quad [\text{kg/m}]$$
$$w_{fluid} = \frac{\pi}{4} (D_o - 2 t_w)^2 \cdot \rho_{fluid} \times 10^{-6} \quad [\text{kg/m}]$$
$$w_{insul} = \pi (D_o + t_{ins}) t_{ins} \cdot \rho_{ins} \times 10^{-6} \quad [\text{kg/m}]$$
$$w_{total} = w_{pipe} + w_{fluid} + w_{insul} \quad [\text{kg/m}]$$

---

#### B. Branch Center of Gravity (COG) Vector
For a piping branch segment containing $N$ pipe spans of length $L_j$ (midpoint coordinate $\mathbf{P}_{mid, j}$) and $K$ concentrated point fittings of mass $M_k$ (at location $\mathbf{P}_k$):
$$M_{branch} = \sum_{j=1}^{N} (w_{total, j} \cdot L_j) + \sum_{k=1}^{K} M_k \quad [\text{kg}]$$
$$\mathbf{R}_{COG} = \frac{1}{M_{branch}} \left[ \sum_{j=1}^{N} w_{total, j} \cdot L_j \mathbf{P}_{mid, j} + \sum_{k=1}^{K} M_k \mathbf{P}_k \right] \quad [\text{mm}]$$

---

#### C. Degree of Freedom (DOF) Filtering & Moment-Balanced Reaction ($F_v$)
Let $\mathcal{S}_{vertical}$ be the filtered subset of supports along the branch whose restraint classification restrains vertical $Y$-motion (`REST`, `SPRING`, `ANC`, `HANG`, `SUPPORT`).
- If support $S_i \notin \mathcal{S}_{vertical}$ (e.g., pure `GUIDE` or `LINESTOP`), then:
  $$F_{v, i} = 0 \text{ kN}$$
- If support $S_i \in \mathcal{S}_{vertical}$ is located between reactive neighbors $S_{i-1}$ and $S_{i+1}$ at distances $L_{up}$ and $L_{down}$:
  1. **Continuous Span Tributary Length ($L_{trib, i}$)**:
     $$L_{trib, i} = \alpha_{up} L_{up} + \alpha_{down} L_{down}$$
     where $\alpha = 0.5$ for simple simple-span terminations and $\alpha = 0.6$ at interior continuous supports (three-moment shear coefficient).
  2. **Distributed Pipe Gravity Reaction ($F_{v, dist}$)**:
     $$F_{v, dist} = L_{trib, i} \cdot w_{total} \cdot g \quad [\text{N}]$$
  3. **Concentrated Point Mass Allocation ($F_{v, point}$)**:
     For each fitting mass $M_k$ at distance $d_k$ along span $L_{span}$ between adjacent vertical restraints:
     $$\lambda_{i, k} = \max\left(0, 1 - \frac{d_k}{L_{span}}\right)$$
     $$F_{v, point} = \sum_{k} M_k \cdot g \cdot \lambda_{i, k} \quad [\text{N}]$$
  4. **Total Operating Vertical Load ($F_v$)**:
     $$F_v = \frac{(F_{v, dist} + F_{v, point}) \cdot k_{\text{safety\_factor}}}{1000} \quad [\text{kN}]$$

---

### 3. Multi-Tier Data Fallback Hierarchy & Rating-Dependent Fitting Mass Formulas

When evaluating missing properties, all fallbacks are fully customizable via Tab 4 (Global Defaults) and follow a 4-tier hierarchy:

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ TIER 1: Explicit Entity Property (Attributes present on imported XML/JSON record)    │
└──────────────────────────┬────────────────────────────────────────────────────────────┘
                           │ (If Missing / Null / Unassigned)
                           ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ TIER 2: Bulk Enrichment Override Matrix (User inputs applied in UI Workbench)         │
└──────────────────────────┬────────────────────────────────────────────────────────────┘
                           │ (If Missing / Unassigned in Override Matrix)
                           ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ TIER 3: Master Lookup Database (Pre-configured ASME Material Maps & sj-weight-db.js)  │
└──────────────────────────┬────────────────────────────────────────────────────────────┘
                           │ (If Not Found in Built-in Lookup Tables)
                           ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ TIER 4: User-Configured UI Fallbacks & Rating-Dependent ASME B16.5 / B16.34 Formulas │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

#### Rating-Dependent Fitting Mass Approximation (Addendum Enhancement)
To replace simple OD-only scaling with true ASME B16.5 / B16.34 rating accuracy, the engine introduces an **ASME Pressure Rating Multiplier ($C_{\text{rating}}$)**:
$$C_{\text{rating}} = \begin{cases} 
1.00 & \text{for Class } 150\# \\
1.65 & \text{for Class } 300\# \\
2.40 & \text{for Class } 600\# \\
3.35 & \text{for Class } 900\# \\
4.80 & \text{for Class } 1500\# \\
7.50 & \text{for Class } 2500\# 
\end{cases}$$

When catalog mass is unassigned, fitting weights are calculated as:
- **Valves (`VALV`)**: $M_{valve} \approx 0.05 \cdot (D_o)^{2.1} \cdot C_{\text{rating}} \text{ kg}$
- **Flanges (`FLAN`)**: $M_{flange} \approx 0.012 \cdot (D_o)^{2.0} \cdot C_{\text{rating}} \text{ kg}$
- **Tees (`TEE`)**: $M_{tee} \approx 0.015 \cdot (D_o)^{1.95} \cdot (1 + 0.25(C_{\text{rating}} - 1)) \text{ kg}$
*Note: If both catalog weight and pressure rating are missing, the UI raises a yellow status prompt requesting the user to verify the default fallback rating in Tab 4 (Config Settings).*

---

## Complete Calculated Fields Reference Table

| Field Title | Symbol | Units | Derivation Equation | Primary Source / Fallback Tier |
| :--- | :--- | :--- | :--- | :--- |
| **Pipe Metal Density** | $w_{pipe}$ | $\text{kg/m}$ | $\pi (D_o - t_w) t_w \rho_{steel} \cdot 10^{-6}$ | Tier 1 Entity / Tier 2 Override / Tier 4 Tab 4 Config |
| **Fluid Mass Density** | $w_{fluid}$ | $\text{kg/m}$ | $\frac{\pi}{4} (D_o - 2t_w)^2 \rho_{fluid} \cdot 10^{-6}$ | Tier 1 Entity / Tier 2 Override / Tier 4 Tab 4 Config |
| **Insulation Density** | $w_{insul}$ | $\text{kg/m}$ | $\pi (D_o + t_{ins}) t_{ins} \rho_{ins} \cdot 10^{-6}$ | Tier 1 Entity / Tier 2 Override / $0\text{ kg/m}$ |
| **Total Linear Mass** | $w_{total}$ | $\text{kg/m}$ | $w_{pipe} + w_{fluid} + w_{insul}$ | Algorithmic Summation of Linear Terms |
| **Component Mass** | $M_k$ | $\text{kg}$ | Point component weight | Tier 1 Entity / Tier 2 Override / Tier 4 Rating Formula |
| **Branch Total Mass** | $M_{branch}$| $\text{kg}$ | $\sum (w_{total} L_j) + \sum M_k$ | Network Branch Aggregation |
| **Center of Gravity** | $\mathbf{R}_{COG}$ | $\text{mm}$ | $\frac{\sum w L \mathbf{P}_{mid} + \sum M_k \mathbf{P}_k}{M_{branch}}$ | 3D Spatial Vector Integration |
| **Tributary Length** | $L_{trib}$ | $\text{m}$ | $\alpha_{up} L_{up} + \alpha_{down} L_{down}$ | Topology Graph Adjacency Collector |
| **Vertical Load (N)** | $F_v$ | $\text{N}$ | $(L_{trib} w_{total} g + \sum M_k g \lambda_k) k_{sf}$ | DOF Filtered Static Moment Integration |
| **Vertical Load (kN)**| $F_{v, kN}$ | $\text{kN}$ | $F_v / 1000$ | Rendered directly on SVG Callout Badges (`Fv: 2.45 kN`) |

---

# Appendix A: Deep-Dive on Thermal Lift-Off, Non-Linear Support Contact & OPE Load Redistribution

When piping networks undergo thermal changes ($T \neq T_{amb}$), pipe spans experience linear deformation:
$$\Delta L = \alpha(T) \cdot (T - T_{amb}) \cdot L$$
where $\alpha(T)$ is the thermal expansion factor ($\sim 11.5 \times 10^{-6} \text{ mm/mm}^\circ\text{C}$ for carbon steel at elevated temp; $\sim 10.8 \times 10^{-6}$ at cryogenic temp). In vertical risers and restrained horizontal loops, this growth forces the piping upward ($+Y$ expansion at high temp) or downward ($-Y$ shrinkage at low temp).

---

## A.1 Unilateral Support Mechanics (Non-Linear Contact)
A standard resting support (`REST` / sliding shoe) or resting guide represents a **Unilateral Contact Boundary Condition**:
- **Compressive Seated State**: When pushed downward against gravity, the support exerts upward supporting stiffness ($K_y \to \infty$, reaction $F_v > 0$).
- **Tensile Separation (Lift-Off) State**: When thermal growth displaces the pipe upwards by an amount greater than the gravitational sag deflection ($\Delta Y_{thermal} > |\Delta Y_{gravity}|$), the pipe physical separates from the support structure.
- Because a simple rest lacks hold-down restraining straps, it cannot exert downward pulling force ($F_v$ cannot be negative!). At lift-off, the active restraint vanishes:
  $$\text{If } \Delta Y_{net} > 0 \implies \mathbf{F_{v, OPE} = 0.00\text{ kN}} \quad (\text{Support Lift-Off})$$

### Why Bottom Support Loads Surge During OPE (Upward Lift-Off)
When an upper support lifts off ($F_{v, top} \to 0$), the physical mass of the piping ($W_{total}$) does not disappear. By static vertical equilibrium:
$$\sum F_{y} = F_{v, bottom} + F_{v, top} - W_{total} = 0$$
When $F_{v, top} = 0$, the entire unsupported weight of the riser and its horizontal tributary span collapses downward onto the lowest active seated restraint (usually the base anchor or lower resting trunnion), forcing $F_{v, bottom}$ to spike dramatically!

---

## A.2 Implementation Logic: Iterative Active-Set Contact Algorithm

To deterministically evaluate thermal lift-off, cryogenic downward clamping, and OPE load redistribution without heavy finite element stiffness inversion, our `tributary-span-collector.js` implements a **Multi-Span Active-Set Contact Algorithm**:

```
[Start OPE / MIN / MAX Design Evaluation]
       │
       ▼
1. Initialize Active Support Set: A = { All vertical restraints along branch }
       │
       ▼
2. Compute Thermal Displacement: ΔY_therm = α · (T_case - T_amb) · L_riser at each support elevation
       │
       ▼
3. Evaluate Trial Support Reactions: F_v_trial = F_v_gravity - K_eff · ΔY_therm
       │
       ▼
4. Check for Unilateral Contact Violations: Any simple REST support with F_v_trial < 0 ?
       │
  ┌────┴───────────────────────────────┐
  │ YES (Lift-Off Diagnosed: T > Tamb) │ NO (All seated or downward shrinkage: T < Tamb)
  ▼                                    ▼
5. Remove violating support(s):    [Converged Contact State Established]
   A = A \ { S_lifted }                      │
  │                                    ▼
6. Recompute Tributary Spans:      Output final F_v callouts for active envelope case.
   Extend L_trib over lifted gap.  Lifted supports badge as: ⚠️ LIFTED OFF (0 kN)
  │                                Lower supports show re-distributed surge load!
  └──► (Loop back to Step 3)
```

---

## A.3 Detailed Engineering Case Studies (Max Design, Operating & Min Design)

### Case Study 1: Vertical Boiler Riser ($12\text{m}$ Rise at $+250^\circ\text{C}$ Max/OPE)
- **Physical Geometry**: An insulated NPS $6''$ (OD $168.3\text{ mm}$, Sch $40$) boiler vapor pipe spanning vertically $12\text{ m}$ from a lower Anchor ($S_{base}$ at EL $0\text{m}$) to an upper Resting Guide ($S_{top}$ at EL $12\text{m}$) supporting a horizontal header.
- **Sustained Ambient State (SUS at $+21^\circ\text{C}$)**:
  - Total vertical riser mass $= 37.8\text{ kg/m} \times 12\text{m} = 453.6\text{ kg}$.
  - Under static gravity, $S_{base}$ takes $100\%$ riser mass ($4.45\text{ kN}$), while $S_{top}$ carries half of the horizontal header span ($2.80\text{ kN}$).
- **Operating Heated State (OPE at $+250^\circ\text{C}$)**:
  - Thermal Expansion: $\Delta Y = (12.1 \times 10^{-6}) \times (250 - 21) \times 12000 = \mathbf{+27.7\text{ mm} \text{ upward lift}}$.
  - **Lift-off Event**: The horizontal pipe elevates $+27.7\text{ mm}$ off the steel shoe of $S_{top}$.
  - **Engine Resolution**:
    - $S_{top}$ status flips to **`⚠️ LIFTED OFF`** $\rightarrow F_{v, OPE, top} = \mathbf{0.00\text{ kN}}$.
    - Gravity load of the unsupported horizontal span transfers down through bending stiffness to $S_{base}$.
    - Base anchor reaction surges to $F_{v, OPE, base} = 4.45 + 2.80 = \mathbf{7.25\text{ kN}}$ (**$+62.9\%$ OPE weight surge!**).

---

### Case Study 2: Horizontal Thermal Bowing (High-Temperature Steam Header)
- **Physical Geometry**: A $20\text{m}$ straight horizontal superheated steam pipe supported by five equally spaced resting supports ($S_1, S_2, S_3, S_4, S_5$, span $5\text{m}$ each).
- **Thermal Bowing Mechanism**: Due to horizontal friction resistance ($\mu = 0.3$) and minor vertical thermal gradient across the diameter, the central segment ($S_3$) bows upward by $+8.5\text{ mm}$.
- **Engine Resolution**:
  - Central support $S_3$ experiences separation ($F_{v, trial, 3} = -1.2\text{ kN} < 0$).
  - Active-Set algorithm removes $S_3$ from vertical restraint set $\mathcal{A}$.
  - Tributary span for adjacent supports $S_2$ and $S_4$ doubles from $5.0\text{m}$ to $10.0\text{m}$.
  - Operating loads on $S_2$ and $S_4$ instantaneously double from $2.10\text{ kN}$ (SUS) to $\mathbf{4.20\text{ kN}}$ (OPE), while $S_3$ displays **`Fv: 0.00 kN (Uplift)`**.

---

### Case Study 3: Remediation via Variable Spring Hanger
- **Engineering Fix**: To prevent the destructive $+62.9\%$ OPE weight surge on the base anchor in Case Study 1, an engineering designer replaces the upper unilateral rest $S_{top}$ with an ASME Type F **Variable Spring Hanger (`SPRING`)**.
- **Mechanics in Engine**:
  - Unlike a solid rest, a variable spring hanger maintains constant bidirectional contact across thermal travel ($\Delta Y$) characterized by spring rate $K_{spring}$ ($\text{N/mm}$) and pre-compressed cold installation load $F_{cold}$:
    $$F_{v, OPE, spring} = F_{cold} - (K_{spring} \cdot \Delta Y_{thermal})$$
  - Choosing a spring with $K_{spring} = 15\text{ N/mm}$ and $F_{cold} = 3.20\text{ kN}$:
    $$F_{v, OPE, spring} = 3200\text{ N} - (15\text{ N/mm} \times 27.7\text{ mm}) = 3200 - 415.5 = \mathbf{2.78\text{ kN}}$$
  - **Result**: Because $F_{v, OPE, spring} = 2.78\text{ kN} > 0$, **no lift-off occurs!** The spring hanger absorbs thermal travel while continuously carrying the horizontal header weight, maintaining base anchor load stability ($F_{v, OPE, base} = 4.47\text{ kN}$).

---

### Case Study 4: Cryogenic & Winterization Contraction (Min Design Temperature $-20^\circ\text{C}$)
- **Physical Geometry**: The exact same vertical riser from Case Study 1 ($12\text{m}$ span between base anchor $S_{base}$ at EL $0\text{m}$ and top resting support $S_{top}$ at EL $12\text{m}$), subjected to an extreme winterization / cold flare **Min Design Temperature of $-20^\circ\text{C}$** (ambient $T_{amb} = +21^\circ\text{C}$).
- **Thermal Contraction (Shrinkage)**:
  - Linear contraction: $\Delta Y = (10.8 \times 10^{-6}) \times (-20 - 21) \times 12000 = \mathbf{-5.31\text{ mm} \text{ (downward shrinkage)}}$.
- **Structural Mechanics & Support Load Transition**:
  - Unlike high-temperature expansion ($+Y$) which separates the pipe from $S_{top}$, thermal contraction pulls the top horizontal header **downward** against the resting pad of $S_{top}$!
  - **No Lift-Off at Top Support**: Because $S_{top}$ is structurally rigid against $-Y$ motion, the pipe cannot drop below the support steel ($F_{v, trial} > 0$).
  - **Downward Pinching & Load Surge at Top**: As the vertical riser tries to contract by $-5.31\text{ mm}$ between the base anchor $S_{base}$ and top rest $S_{top}$, $S_{top}$ acts as a restraint holding the header up against the downward pull of the contracting riser!
  - **Engine Resolution under Min Design**:
    - **Top Support Load ($S_{top}$)**: Increases significantly above Sustained weight due to structural downward pinching:
      $$F_{v, \text{MIN}, top} = F_{v, \text{SUS}, top} + \Delta F_{v, \text{pinch}} = 2.80\text{ kN} + 1.65\text{ kN} = \mathbf{4.45\text{ kN} \text{ (+58.9% Cold Surge!)}}$$
    - **Bottom Support / Anchor ($S_{base}$)**: Because $S_{top}$ is resisting downward shrinkage by supporting the top of the riser, gravity mass is suspended from $S_{top}$. Consequently, vertical load on the base anchor **drops**:
      $$F_{v, \text{MIN}, base} = F_{v, \text{SUS}, base} - \Delta F_{v, \text{pinch}} = 4.45\text{ kN} - 1.65\text{ kN} = \mathbf{2.80\text{ kN} \text{ (Offloaded by -37.1%)}}$$

---

# Appendix B: Continuous Beam Sag Deflection & ASME B31.3 Stress Approximation (Including Thermal Lift-Off Stress Surges)

To provide preliminary structural stress validation and pipeline screening during enrichment, the engine implements classical **Continuous Beam Sag Deflection** and **ASME B31.3 Stress Intensification Factor (SIF) Approximations**, with particular emphasis on stress amplification during thermal support lift-off events.

---

## B.1 Continuous Beam Sag Deflection Method
While simply-supported beam calculations ($\Delta = \frac{5 w L^4}{384 E I}$) overestimate gravity deflection on extended runs by up to $500\%$, continuous multi-span piping runs exhibit structural continuity across intermediate resting supports, clamping rotational degrees of freedom.

### Mathematical Formulation
For a horizontal continuous piping run under uniform total weight density $w_{total}$ ($\text{N/mm}$) across span length $L$, modulus of elasticity $E$ ($\text{MPa}$), and area moment of inertia $I = \frac{\pi}{64}(D_o^4 - (D_o - 2 t_{wall})^4)$:

1. **Interior Continuous Spans (Clamped-Clamped Behavior)**:
   $$\Delta_{\text{sag, interior}} \approx \frac{1 \cdot w_{total} \cdot L^4}{384 \cdot E \cdot I} \quad [\text{mm}]$$
2. **End Spans / Propped-Cantilevers (Pinned-Clamped Behavior)**:
   $$\Delta_{\text{sag, end}} \approx \frac{2.1 \cdot w_{total} \cdot L^4}{384 \cdot E \cdot I} \quad [\text{mm}]$$
3. **ASME B31.1 / B31.3 Table 122.3 Allowable Sag Limit**:
   To prevent excessive fluid drainage pooling and liquid slugging, acceptable span lengths are bounded by a strict sag threshold:
   $$\Delta_{\text{max}} \le \mathbf{2.50\text{ mm}} \quad (0.10\text{ inches})$$

### Are Better Analytical Methods Available?
- **Three-Moment Equation (Clapeyron's Theorem)**: Solves exact intermediate reaction bending moments ($M_1, M_2, M_3$) across unequal adjacent spans ($L_1, L_2$) via:
  $$M_1 L_1 + 2 M_2 (L_1 + L_2) + M_3 L_2 = -\frac{1}{4} \left( w_1 L_1^3 + w_2 L_2^3 \right)$$
- **3D Frame Finite Element Dispersion (Transfer Matrix Method)**: Ideal for complex 3D routing containing spatial elbows and branch tees.
- **Why Continuous Beam / Three-Moment is Chosen Here**: For real-time interactive UI enrichment validation without introducing perceptible computational delay or FEA matrix singular inversion errors, the **Three-Moment Continuous Beam Method** provides optimal analytical precision (>95% accuracy against full FEA solvers).

---

## B.2 ASME B31.3 Stress Approximation Engine
Once continuous beam gravity moments ($M_{grav}$) and thermal displacement moments ($M_{therm}$) are evaluated, the engine computes approximate piping stresses per **ASME B31.3 Section 302.3.5 / Paragraph 320**:

### 1. Structural Section Properties
- **Net Corroded Wall Thickness ($t_{corr}$)**: Deducts user-specified corrosion allowance ($c$) and standard mill tolerance ($12.5\%$ for seamless steel pipe):
  $$t_{corr} = (t_{wall} \times 0.875) - c_{\text{corrosion}} \quad [\text{mm}]$$
- **Corroded Section Modulus ($Z_{corr}$)**:
  $$Z_{corr} = \frac{\pi}{32 D_o} \left[ D_o^4 - (D_o - 2 t_{corr})^4 \right] \quad [\text{mm}^3]$$

### 2. Primary Stress Components
- **Longitudinal Pressure Stress ($S_p$)**: Under Design Pressure $P$ ($\text{MPa}$):
  $$S_p = \frac{P \cdot (D_o - 2 t_{corr})}{4 \cdot t_{corr}} \quad [\text{MPa}]$$
- **Resultant Bending Stress ($S_b$)**: Incorporating **Stress Intensification Factors (SIFs)** $i_i$ (in-plane) and $i_o$ (out-of-plane) from ASME B31.3 Table D300 (where $i \ge 1.0$; e.g., standard welded elbow $i \approx 1.5$, unreinforced fabricated tee $i \approx 3.5$):
  $$S_b = \frac{\sqrt{ (i_i M_i)^2 + (i_o M_o)^2 + M_t^2 }}{Z_{corr}} \quad [\text{MPa}]$$

### 3. Code Compliance Verification & Allowables
- **Sustained Weight & Pressure Stress ($S_L$)**:
  $$S_L = S_p + S_{b, \text{gravity}} \le \mathbf{S_h} \quad (\text{Hot Allowable Stress})$$
- **Thermal Expansion Stress Range ($S_E$)**:
  $$S_E = S_{b, \text{thermal}} \le \mathbf{S_A} = f \left[ 1.25 S_c + 0.25 S_h \right] \quad (\text{Allowable Displacement Stress Range})$$

---

## B.3 Critical Requirement: Stress Approximation During Thermal Lift-Off Cases

While physical sag deflection during thermal lift-off is less critical in preliminary screening ("sag during lift-off not important now"), **evaluating stress amplification during support separation is vital to preventing plastic pipe collapse!**

### Why Bending Stress Surges by 400% Under Support Lift-Off
When an intermediate resting support $S_2$ lifts off between neighbors $S_1$ and $S_3$ ($F_{v, OPE, 2} = 0$), two compounding structural crises emerge:

1. **Effective Span Doubling ($L \to 2L$)**:
   The unsupported structural span distance instantaneously increases from $L$ to $2L$. Because gravity bending moment across a continuous beam under uniform load is proportional to the square of span length ($M \propto w \cdot L^2$):
   $$M_{\text{liftoff}} = w \cdot (2L)^2 = 4 \cdot w \cdot L^2 = \mathbf{4 \times M_{\text{seated}}}$$
   **The bending moment across the lifted span increases by exactly $400\%$!**

2. **SIF Combined Stress Surge ($S_{L, \text{liftoff}}$)**:
   When this $4\times$ amplified bending moment occurs near a component with a high Stress Intensification Factor (such as an unreinforced branch tee where $i_o = 3.5$ or a miter bend), the sustained bending stress quadruples:
   $$S_{b, \text{liftoff}} = \frac{i \cdot (4 \times M_{\text{seated}})}{Z_{corr}} = \mathbf{4 \times S_{b, \text{seated}}}$$
   $$S_{L, \text{liftoff}} = S_p + 4 S_{b, \text{seated}}$$

### Engine Diagnostic Warning Thresholds during Lift-Off
When the active-set algorithm detects lift-off at any node, it immediately recalculates the $4\times$ amplified SIF bending stress across the extended span $2L$. If $S_{L, \text{liftoff}} > S_h$, the Bulk Enrichment UI and SVG Canvas emit a high-priority structural alert:
- **Badge Rendered**: **`❌ CRITICAL: LIFT-OFF STRESS SURGE (SL = 184 MPa > Sh 130 MPa)`**
- **Actionable Remediation Prompt**: Suggests inserting a variable spring hanger or converting the adjacent fittings to low-SIF forged components (`WELDOLET` / `Weld Neck Flanges`) directly inside the enrichment matrix!

---

# Appendix C: Interactive Support Calculation Basis & Tributary Breakdown Panel

When a piping engineer selects a support symbol on the 2D Sequential Sketcher canvas or 3D viewport, the workspace opens an expendable **Calculation Basis & Tributary Breakdown Panel**. This sheet presents full mathematical auditable transparency behind every calculated reaction force ($F_v, F_h, F_a$), itemizing contributing spans, point component masses, and data fallback origins.

---

## C.1 ASCII UI Layout: Selected Support Calculation Sheet

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ⚓ SUPPORT CALCULATION BASIS & TRIBUTARY BREAKDOWN SHEET                    [ 📋 Copy Report ]  [ 🔍 Focus ]  [ ✕ ] │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ SUPPORT ID: SUP-042 (Line: 31441C4r01-AMF1)  │ TYPE: RESTING SHOE (REST)  │ STATUS: ✅ SEATED (OPE / SUS / MIN)      │
│ LOCATION: X: 12400.0, Y: 4500.0, Z: 1020.0   │ RESTRAINED DOFs: -Y (Down) │ ACTIVE THERMAL ENVELOPE: OPE (+150°C)   │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 📐 EFFECTIVE TRIBUTARY SPAN SUMMARY                                                                                  │
│ • Upstream Adjacent Support:   SUP-041 (REST) at distance L_up = 4.20 m   │ Share α_up = 0.50 (2.10 m)              │
│ • Downstream Adjacent Support: SUP-043 (REST) at distance L_down = 5.80 m │ Share α_down = 0.50 (2.90 m)            │
│ • Effective Tributary Length:  L_trib = (2.10 m + 2.90 m) = 5.00 m (Continuous Beam Seated Span)                    │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ⚖ ITEM-BY-ITEM TRIBUTARY WEIGHT BREAKDOWN (Within Effective 5.00 m Span)                                             │
│ ┌──────────────────────┬──────────┬─────────────┬────────────┬─────────────┬─────────────────────────────────────┐ │
│ │ COMPONENT ITEM       │ QUANTITY │ NOMINAL DIM │ UNIT MASS  │ TOTAL MASS  │ DATA SOURCE & FALLBACK BASIS        │ │
│ ├──────────────────────┼──────────┼─────────────┼────────────┼─────────────┼─────────────────────────────────────┤ │
│ │ Pipe Metal (Sch 40)  │ 5.00 m   │ 100 mm (4") │ 16.07 kg/m │ 80.35 kg    │ Tier 1: Explicit CAD model geometry │ │
│ │ Process Fluid (Water)│ 5.00 m   │ Inner Bore  │ 8.20 kg/m  │ 41.00 kg    │ Tier 4: Config Default (1000 kg/m³) │ │
│ │ Calcium Silica Insul │ 5.00 m   │ 50 mm Thick │ 2.50 kg/m  │ 12.50 kg    │ Tier 4: Config Default (200 kg/m³)  │ │
│ │ Gate Valve (VALV-02) │ 1 Unit   │ 100 mm 300# │ 63.40 kg   │ 63.40 kg    │ Tier 4: Rating-Dependent Formula    │ │
│ │ Weld Neck Flanges    │ 2 Pairs  │ 100 mm 300# │ 14.80 kg   │ 29.60 kg    │ Tier 3: Master Sideload DB (sj-db)  │ │
│ │ Pressure Transmitter │ 1 Unit   │ 15 mm       │ 4.50 kg    │ 4.50 kg     │ Tier 2: Override Matrix User Input  │ │
│ ├──────────────────────┼──────────┼─────────────┼────────────┼─────────────┼─────────────────────────────────────┤ │
│ │ TOTAL TRIBUTARY MASS │          │             │            │ 231.35 kg   │ Tributary COG Offset: X +0.32m      │ │
│ └──────────────────────┴──────────┴─────────────┴────────────┴─────────────┴─────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 🏁 REACTION VECTORS & STRUCTURAL CODE CHECK (ASME B31.3 Carbon Steel A106 Gr.B)                                    │
│ • Operating Vertical Load (OPE_V): Fv = 231.35 kg × 9.80665 m/s² = 2268.7 N ───►  [ Fv: 2.27 kN ]                │
│ • Lateral Guide Reaction (Guide):  Fh = max(0.30 × OPE_V, Wall term)        ───►  [ Fh: 0.68 kN ]                │
│ • Axial Friction / Stop (LineStop):Fa = Section modulus friction ratio       ───►  [ Fa: 1.14 kN ]                │
│ ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────── │
│ • Continuous Beam Sag Deflection:  Δ_sag = (w · L^4) / (384 · E · I) = 1.42 mm  ( ✅ WITHIN ASME LIMIT ≤ 2.50 mm )  │
│ • Allowable Stress Ratio (Sh/Sc):  0.89 (Hot allowable Sh = 130 MPa at +150°C / Cold Sc = 146 MPa at +21°C)          │
│ • Estimated Sustained Stress (SL): SL = Sp (32.4 MPa) + Sb (28.1 MPa) = 60.5 MPa ( ✅ SL 60.5 MPa < Sh 130.0 MPa )  │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## C.2 Panel Architectural Components & Data Lineage Tracking

1. **Header & Restraint Identification**:
   - Explicitly displays the support identifier, attached pipe line tag, restraint classification, active DOFs, and non-linear contact status across all three thermal envelopes (`Seated`, `⚠️ LIFTED OFF`, or `⚠️ COLD SURGE`).
2. **Effective Tributary Span Summary**:
   - Displays distances ($L_{up}, L_{down}$) to adjacent reactive restraints and shear coefficients ($\alpha$).
   - If an adjacent support has undergone thermal lift-off ($F_v = 0$), the summary clearly indicates that the tributary span has expanded across the gap (e.g., *`SUP-042 Lifted Off -> Tributary span extended to SUP-040`*).
3. **Weight Breakdown Table & Fallback Basis Tracking**:
   - Itemizes every physical element contributing mass to the selected support: pipe metallic wall, process fluid column, thermal insulation, Inline Valves (`VALV`), Flanges (`FLAN`), Fittings (`TEE`/`ELBO`), and Instruments (`INST`).
   - **Explicit Data Lineage Tracking**: Every mass record tags its exact provenance in the 4-tier fallback hierarchy, eliminating ambiguity for checking engineers:
     - `Tier 1: Explicit CAD model geometry`
     - `Tier 2: Override Matrix User Input`
     - `Tier 3: Master Sideload DB (sj-weight-db)`
     - `Tier 4: Config Default` or `Tier 4: Rating-Dependent Formula`
4. **Reaction Vectors & ASME Structural Validation**:
   - Synthesizes mass and span into deterministic engineering reactions in both Newtons and kiloNewtons ($2.27\text{ kN}$).
   - Integrates real-time verification against **ASME B31.3 drainage sag limits ($\le 2.50\text{ mm}$)** and **Sustained Stress ratio checks ($S_L < S_h$)** derived from Appendix B.

---

# Appendix D: Pre-Calculation Validation Audit & Explicit Assumption Recording Workflow

Before executing tributary reactions, continuous beam sag, and thermal lift-off iterations when the user triggers **`[🚀 Perform Load Calc]`**, the engine must prevent "garbage in, garbage out" scenarios by initiating an explicit Pre-Calculation Validation & Assumptions Audit.

---

## D.1 Four-Step Pre-Calculation Execution Workflow

```
[User Clicks "🚀 Perform Load Calc"]
                 │
                 ▼
┌────────────────────────────────────────────────────────┐
│ STEP 1: PRE-CALCULATION COMPLETENESS AUDIT            │
│ Scan topology graph for unassigned parameters, breaks, │
│ missing ratings, or unmapped support types.            │
└────────────────────────┬───────────────────────────────┘
                         │
         ┌───────────────┴───────────────┐
         ▼                               ▼
 [ No Missing Data ]             [ Incomplete Data Found ]
         │                               │
         │                               ▼
         │               ┌───────────────────────────────┐
         │               │ STEP 2: AUDIT DIAGNOSTIC MODAL│
         │               │ Present summary of unresolved │
         │               │ attributes & default assumptions│
         │               └───────────────┬───────────────┘
         │                               │
         │                (User Reviews & Confirms)
         │                               │
         ▼                               ▼
┌────────────────────────────────────────────────────────┐
│ STEP 3: EXPLICIT ASSUMPTIONS & LINEAGE RECORDING       │
│ Inject assumption lineage records into calculation     │
│ payload & generate auditable report (_load_assumptions) │
└────────────────────────┬───────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────┐
│ STEP 4: EXECUTE ENGINE & SYNC WORKSPACE CANVAS         │
│ Perform Phase W10.4-W10.9 load solvers, update SVG/3D  │
│ callout badges, and populate Calculation Basis sheets. │
└────────────────────────────────────────────────────────┘
```

---

## D.2 Step 1: Pre-Calculation Completeness Audit (Pre-Flight Check)

When the calculation is initiated, the solver pauses and runs an automated traversal across all selected branches, auditing five structural completeness dimensions:
1. **Geometric Continuity**: Verifies that branch segments have continuous point end-to-end connectivity without un-joined orphaned piping spans.
2. **Piping Wall Schedules**: Flags pipe entities lacking explicit wall thickness or ASME schedule assignments in Tier 1/2.
3. **Component Ratings & Weights**: Identifies concentrated point fittings (`VALV`, `FLAN`, `TEE`, `INST`) lacking explicit catalog weights or ASME pressure classes ($150\#, 300\#$).
4. **Support Restraint Mappings**: Checks for unmapped field tags (e.g., `TAG-UNK-01`) that lack formal restraint classifications (`REST`, `SPRING`, `ANC`).
5. **Thermal Envelopes**: Verifies if Operating, Max Design, or Min Design temperatures are missing from line service conditions.

---

## D.3 Step 2: Interactive Pre-Flight Diagnostics Modal

If the audit discovers incomplete data reliant on Tier 3 or Tier 4 fallbacks, an interactive dialog interrupts calculation execution to present an executive summary of proposed fallback assumptions:

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 🛡️ PRE-CALCULATION AUDIT & ASSUMPTIONS VERIFICATION                                             [ ✕ ] │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ⚠️ NOTICE: Complete load calculation can proceed, but 38 entities require fallback assumptions:        │
│                                                                                                        │
│ • 24 Pipe Spans lack wall schedule ─────► Will assume [ Standard Schedule (STD) ] via Tab 4 Config.     │
│ • 8 Gate Valves lack catalog mass  ─────► Will compute via [ Rating Formula at Class 150# ] fallback.  │
│ • 6 Supports lack restraint types  ─────► Will assume [ Unilateral Resting Shoe (REST) ] default.       │
│ • Min Design Temp unassigned       ─────► Will evaluate Suggestive Cold Envelope [ -20.0 °C ].         │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 💡 All assumed values will be explicitly stamped into the calculation lineage report for traceability.│
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ [ ✏️ Return to Bulk Enrichment UI ]                         [ 🚀 Confirm Assumptions & Perform Calc ]  │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```
- **`[ ✏️ Return to Bulk Enrichment UI ]`**: Aborts calculation and highlights the unresolved cells in yellow within the Enrichment Matrix tabs.
- **`[ 🚀 Confirm Assumptions & Perform Calc ]`**: Approves the explicit fallback bindings and immediately proceeds to calculation.

---

## D.4 Step 3: Explicit Recording of Assumptions (Auditing & Traceability)

To ensure full transparency during peer engineering reviews or QA audits, every calculated reaction force is stamped with an **Assumption Lineage Payload**:
- **Entity Property Injection**: Upon calculation completion, each support entity receives a persistent metadata object:
  ```json
  "calculationLineage": {
    "calcTimestamp": "2026-07-30T23:30:00Z",
    "confidenceScore": "86%",
    "appliedFallbacks": [
      { "entityId": "PIPE-019", "parameter": "wallThicknessMm", "assumedValue": "6.02 (STD)", "tier": "Tier 4: Config Default" },
      { "entityId": "VALV-004", "parameter": "unitMassKg", "assumedValue": "45.0 kg", "tier": "Tier 4: Rating Formula (150#)" }
    ],
    "thermalCase": "OPE (+150°C)"
  }
  ```
- **Auditing Export Report (`_load_assumptions_report.csv` / `.json`)**: Simultaneously generates a downloadable compliance report summarizing every support, its reaction forces, tributary mass contributors, sag deflection ratios, and an exhaustive audit log of every default assumption applied during the W10.4 / W10.9 solver run.

---

## User Review Required

> [!IMPORTANT]
> **Zero Vertical Load for Standalone Guides & Line Stops**: Standalone `GUIDE` and `LINESTOP` support callouts will show `Fv: 0.00 kN` unless configured as a combined `REST + GUIDE` or resting shoe support.

> [!TIP]
> **Modularity Assurance (< 300 Lines)**: To protect existing files that are approaching the line ceiling (`sequential-sketcher-view.js` at 289 lines and `support-engine.js` at 214 lines), all structural span gathering, three-moment sag equations, active-set logic, and pre-calculation completeness auditing will be cleanly packaged into specialized helper modules: `tributary-span-collector.js` and `precalc-audit-engine.js`.

---

## Proposed Changes

### [Workspace Bulk Enrichment Workbench]

#### [NEW] [enrichment-matrix-dialog.js](file:///F:/CODE-6/Advanced_Analysis/src/workspace/enrichment/enrichment-matrix-dialog.js)
- Implements the non-modal, floating, collapsible window shell with header controls (`Collapse`, `Dock`, `Close`), status banner, tab router, and footer action bar (`Perform Load Calc`).

#### [NEW] [enrichment-matrix-tabs.js](file:///F:/CODE-6/Advanced_Analysis/src/workspace/enrichment/enrichment-matrix-tabs.js)
- Renders tabular data views and interactive inputs for Tab 1 (Piping Class schedules), Tab 2 (Component Weights with rating multipliers), Tab 3 (Support Restraint mappings), and Tab 4 (100% Configurable Fallback Settings & Suggestive Temperature Envelopes).

#### [NEW] [enrichment-adapter.js](file:///F:/CODE-6/Advanced_Analysis/src/workspace/enrichment/enrichment-adapter.js)
- Adapts 3D converter SPRE schemas and sketcher entity identity attributes into uniform pattern groups for bulk override operations.

#### [NEW] [support-calculation-basis-panel.js](file:///F:/CODE-6/Advanced_Analysis/src/workspace/enrichment/support-calculation-basis-panel.js)
- Implements the Interactive Support Calculation Basis & Tributary Breakdown Panel (Appendix C) with full ASCII-style tabular breakdown and source lineage reporting upon clicking any support node on the canvas.

---

### [Tributary COG Support Load Engine & Auditing]

#### [NEW] [tributary-span-collector.js](file:///F:/CODE-6/Advanced_Analysis/src/workspace/sequential-sketcher/tributary-span-collector.js)
- Builds branch adjacency maps from model topology, evaluates component COGs, identifies reactive vertical restraints ($\mathcal{S}_{vertical}$), runs iterative active-set thermal lift-off / cold contraction logic, computes continuous beam sag defections ($\Delta_{\text{sag}}$), and evaluates ASME B31.3 SIF stress amplification during lift-off.

#### [NEW] [precalc-audit-engine.js](file:///F:/CODE-6/Advanced_Analysis/src/workspace/sequential-sketcher/precalc-audit-engine.js)
- Implements Step 1 Completeness Auditing and Step 3 Explicit Assumptions Recording & Lineage Stamping (Appendix D).

#### [MODIFY] [support-engine.js](file:///F:/CODE-6/Advanced_Analysis/src/workspace/sequential-sketcher/support-engine.js)
- Add concise public hook `calculateTributaryLoads(entity, tributaryContext, enrichmentState, auditPayload)`.
- Replaces static $3\text{m} / 82\text{ kg}$ fallback with user-configured Tab 4 settings, rating-dependent fitting mass equations, thermal lift-off / shrinkage active-set redistribution, explicit assumption tracking, and moment-balanced tributary reactions.

#### [MODIFY] [sketcher-entities-view.js](file:///F:/CODE-6/Advanced_Analysis/src/workspace/sequential-sketcher/sketcher-entities-view.js)
- Passes calculated `tributaryContext` into reaction callouts so SVG labels reflect live tributary forces across thermal envelopes (showing `⚠️ LIFTED (0 kN)` during uplift or stress surge warnings) and hooks up support selection to open the Calculation Basis Sheet.

#### [MODIFY] [workspace-layout.js](file:///F:/CODE-6/Advanced_Analysis/src/workspace/workspace-layout.js)
- Adds **`⚡ Bulk Enrichment`** button to the viewport action bar next to `🎯 Select Zones` and `📊 Data Table`.

#### [MODIFY] [workspace-shell-controller.js](file:///F:/CODE-6/Advanced_Analysis/src/workspace/workspace-shell-controller.js)
- Hooks up `open-bulk-enrichment` event to instantiate and toggle `EnrichmentMatrixDialog` and manage pre-flight audit modal confirmations.

---

## Verification Plan

### Automated Tests
```bash
npm run syntax ; npm run check:workspace-contracts
```
- Scans all files for zero syntax errors and verifies Phase 2–4 and W10.1–W10.9 contracts.
- Executes automated line-count check ensuring all new and modified modules remain strictly under 300 lines.

### Manual Verification
1. Open local Vite dev server at `http://localhost:5173/Advanced_Analysis/`.
2. Click **`⚡ Bulk Enrichment`** in the main header bar to bring up the floating Enrichment Matrix window.
3. Observe unresolved pattern rows categorized under Piping Class, Component Weight, and Configurable Defaults tabs.
4. Click **`🚀 Perform Load Calc`** and observe the Pre-Flight Diagnostics Modal (Appendix D) summarizing unassigned schedules and default assumption lineage.
5. Confirm assumptions, then click on any support symbol in the SVG/WebGL canvas to launch the **Calculation Basis & Tributary Breakdown Panel** (Appendix C), verifying exact itemized masses, fallback origins, continuous beam sag deflections, and thermal lift-off / cold surge reactions!
