# SPL2 Formula Extraction

This document outlines the formulas extracted from the legacy SPL2 codebase (`public/spl2-bundle/js/spl2/`).

## Simplified Analysis (spl2_simp_logic.js)
**Variables:**
- `inp_sa`: Allowable Stress
- `inp_lz`, `inp_lx`, `inp_ly`: Distances/Lengths
- `inp_temp`: Temperature
- `inp_nps`, `inp_sch`: Nominal Pipe Size, Schedule
- `inp_mat`: Material

**Calculations:**
Includes formulas for: `out_dx`, `out_dy`, `out_dz` (displacements), `out_exp` (expansion), `out_moment` (moment), `out_stress` (stress).
Details to be formalized as benchmarks.

## Loop Algorithm (spl2_loop_algo.js)
**Variables:**
- `D`: Diameter (in)
- `t`: Thickness (in)
- `R`: Bend Radius (usually `D * 1.5`)
- `H`, `W`, `G`: Geometry dimensions (ft)
- `Ec`: Cold Modulus (Msi)
- `e`: Expansion rate (in/100ft)

**Formulas:**
- `h = (t * R) / ((D - t) / 2)^2`
- `k = 1.65 / h`
- `beta = 0.9 / h^(2/3)`
- `L = 2 * PI * (R/12) * k + 2 * H + G - 8 * (R/12)`
- `Z_bar = (PI * (R/12) * k + W + H - 4*(R/12)) * H / L`
- Inertia terms `AA`, `BB`, `CC` leading to `Ix`.

## Rack Load (spl2_rack_logic.js)
**Variables:**
- `inp_nps`, `inp_sch`: Pipe size
- `inp_insul`, `inp_sg`: Insulation thickness, specific gravity
- `inp_wind`, `inp_dens`: Wind, density
- `inp_spacing`, `inp_bents`: Spacing and bents

**Calculations:**
Weights: `out_w_pipe`, `out_w_insul`, `out_w_cont`, `out_w_test`, total `out_w`.
Dimensions: `out_do`, `out_dt`, `out_de`.
