# 3D Guided Cantilever Formulas and Assumptions

## Assumptions
1. **System behaves as guided cantilevers:** The layout is assumed to absorb expansion through perpendicular legs acting as cantilevers.
2. **Bending stresses dominate:** Torsional and axial stresses are considered negligible compared to bending for this screening.
3. **Thermal expansion is primary load:** The checks primarily evaluate expansion stress range (`SE`) against allowable expansion stress range (`SA`).

## Key Formulas
- **Allowable Stress Range (`SA`):**
  `SA = f * (1.25 * Sc + 0.25 * Sh)`
- **Thermal Displacement (`delta`):**
  `delta = alpha * L * deltaT`
- **Section Properties:**
  - Inside Diameter: `Di = Do - 2*tn`
  - Moment of Inertia: `I = (pi/64) * (Do^4 - Di^4)`
  - Section Modulus: `Z = I / (Do/2)`
- **Basic GC Force and Moment:**
  - `F = 12 * E * I * delta / L^3`
  - `M = F * L / 2`
  - `Sb = M / Z`
- **Node Stress Combination:**
  - `Snode = sqrt(Sb_1^2 + Sb_2^2 + ...)`
