# Core Rules & Engineering Specifications: Calc Extended Module

This document serves as the absolute source of truth for the mathematical formulas, structural logic, and architectural mandates required to build the "Calc Extended" module, derived directly from the Fluor Pipe Stress Analysis Manual.

## 1. Architectural Mandates
*   **The "Walled Garden" Rule:** The `Calc Extended` module must be completely isolated from the main app's physics engines and state mutations.
    *   State must live strictly in `src/calc-extended/store/useExtendedStore.js`.
    *   The solver must live in `src/calc-extended/solver/ExtendedSolver.js`.
    *   It pulls geometry from the global app state (one-way data valve via deep-clone) but never mutates it.
*   **Modularity:** All code files must be highly modular (< 150 lines), pure functions where applicable, with no interaction with existing modules.
*   **No Raw JSON in UI:** All mathematical outputs shown to the user must be formatted cleanly (e.g., 2 decimal places).
*   **UI Layout (2 Screens):**
    *   **Screen 1 (Dashboard):** Left Dock (Inputs, Limits, Status) and Bottom Dock (Results DataGrid).
    *   **Screen 2 (3D Viewport):** Full-screen R3F Canvas showing the parsed geometry, interactive anchor placement, and Heatmap toggles (Stress vs Force).

## 2. Databases (Reference Tables)
All reference values must be pulled from static JSON files (`materials.json`, `modulus_elasticity.json`, `pipe_properties.json`). If a temperature falls between the listed 50-degree/100-degree increments, the solver must mathematically **interpolate** between the two nearest values.

### A. Linear Coefficient of Thermal Expansion (`e`)
*   Source: `expansion_coefficients.json`
*   Data represents expansion in **inches per 100 feet**.
*   *Solver Rule:* Divide the chart value by 100 to get `e` in **inches per foot**.

### B. Young's Modulus (`E`)
*   Source: `modulus_elasticity.json`
*   Data represents modulus in **ksi** ($10^3$ psi).
*   *Solver Rule:* Multiply the chart value by $10^3$ to get `E` in **PSI**.

### C. Pipe Properties (`D`, `I`, `A`)
*   Source: `pipe_properties.json`
*   Provides Outside Diameter ($D$), Moment of Inertia ($I$), and Metal Area ($A$) based on Nominal Pipe Size and Schedule.

## 3. The Mathematical Engine (Formulas)

### A. Free Thermal Expansion ($\Delta$)
The total expansion trying to grow outwards between two anchors is calculated using the algebraic difference in their coordinates, plus any mechanical boundary movements.
```javascript
// Example for X-Axis
delta_X = (e * Math.abs(anchor_2_coords.x - anchor_1_coords.x)) + known_boundary_movement_X
```

### B. Bending Legs ($B$)
To absorb expansion in a specific direction, the pipe bends the legs perpendicular to that direction.
*   *Rule of Rigidity (Short Drops):* If a vertical (Z-axis) element is $\le$ 3'-0", its length must be **excluded** when summing the total bending leg for horizontal expansion, as it is too stiff to provide flexibility.
```javascript
// For a Z-shape expanding in the X direction:
const bending_leg_X = sum(all segment lengths parallel to Y and Z axes that are > 3ft)
```

### C. Thermal Force ($P$)
The programmatic Guided Cantilever approximation used to calculate the force exerted on the anchors/nozzles.
*   $P$ = Thermal Force (lbs)
*   $E$ = Young's Modulus (PSI)
*   $I$ = Moment of Inertia (in^4)
*   $\Delta$ = Free Thermal Expansion (inches)
*   $B$ = Bending Leg (feet)
```javascript
const force_X = (3 * E * I * delta_X) / (144 * Math.pow(bending_leg_X, 3))
```

### D. Bending Stress ($S_b$)
The thermal stress placed on the pipe itself while absorbing the expansion.
*   $D$ = Outside Diameter (inches)
```javascript
const stress_bending_X = (3 * E * D * delta_X) / (144 * Math.pow(bending_leg_X, 2))
```

## 4. Evaluation Constraints (Pass/Fail Limits)

The solver evaluates the system against two dynamic failure limits:

1.  **Maximum Allowable Force (Equipment Nozzles):**
    *   **Steel:** $200 \times \text{Nominal Pipe Size}$ (Max limit: 2,000 lbs).
    *   **Cast Iron:** $50 \times \text{Nominal Pipe Size}$ (Max limit: 500 lbs).
2.  **Maximum Allowable Thermal Stress:**
    *   Code limit is **20,000 PSI**.

*Unified Status Logic:* If `Thermal Force` > Max Allowable Force OR `Bend Stress` > 20,000 PSI, the specific axis fails (Red). Otherwise, it passes (Green).

## 5. Geometric Parsing (Auto-Detecting 3D Shapes)

The solver simplifies complex 3D shapes by summing continuous vectors on the same axis.
*   **"L" Profile:** Two primary legs on orthogonal axes.
*   **"Z" Profile:** Three primary legs (e.g., $X_1$, $Y$, $X_2$).
*   **"U" Profile:** Three or four primary legs returning to the original axis.

*The Golden Rule of Parsing:* The algebraic combination of lengths in any direction is the same as the difference in anchor coordinates.

## 6. The UI "Wait State"
*   The solver cannot run without Anchors.
*   Initial `calculationStatus` is `'AWAITING_ANCHORS'`.
*   User clicks nodes in the 3D Canvas to assign Anchor 1 and Anchor 2.
*   Once both are placed, status becomes `'READY'`, enabling the "Run Calculation" button.
