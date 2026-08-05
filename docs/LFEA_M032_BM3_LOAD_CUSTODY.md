# M032 BM3 load-set custody

This work introduces a successor qualification layer for BM3 without rewriting the retained M028/M029 evidence.

## Implemented authority

`src/core/linear-piping-inputxml-force-moment/index.js` converts retained InputXML `FORCESMOMENTS` records into immutable `NODAL_FORCE_MOMENT` primitives. Vector selection is explicit, missing components are zero, non-finite components are rejected, source nodes must bind to the compiled model, and every source-record/vector identity may be emitted only once. The InputXML adapter path declares the basis as global; it does not infer an element-local frame.

BM3 contains two active vector-1 declarations:

- source node 65: global `FY = -4000 N`;
- source node 100: global `FY = -4000 N`.

The M032 solve compiles them only into CASE 5.

## Physical case matrix

| Case | Formula | Thermal state | Hanger stiffness/preload | F1 | Friction |
|---|---|---|---|---|---|
| CASE 3 | `W+T1+P1+H` | T1 | on | off | off |
| CASE 4 | `W+T2+P1+H` | T2 | on | off | off |
| CASE 5 | `W+P1+H+F1` | none | on | vector 1 | off |
| CASE 6 | `W+T2+P1+H` | T2 | on | off | off |
| CASE 7 | `W+P1` | none | off | off | off |

CASE 6 and CASE 7 are assembled as independent physical solves. They are not reconstructed by subtraction. CASE 7 uses the unstrained installation reference and contains no temperature primitive. The current governed BM3 policy uses the retained cold elastic modulus for stiffness and selects T1/T2 only for uniform thermal strain; the audit prints the material-state identity, modulus and expansion coefficient so that this policy cannot be inherited silently.

## Controlled attribution

The M032 check runs the complete two-by-two hanger/F1 factorial while holding weight, pressure and the no-friction state constant:

- `H0_F0`: baseline;
- `H1_F0`: hanger-only toggle;
- `H0_F1`: F1-only toggle;
- `H1_F1`: combined endpoint.

It reports both context-specific main effects and the interaction term. A single CASE 5/7 comparison is not used for causal attribution.

## Direct qualification

Run:

```bash
node scripts/lfea-m032-inputxml-force-moment-check.mjs
node scripts/lfea-m032-bm3-load-custody-check.mjs
node scripts/lfea-m029-bm3-hanger-check.mjs
node scripts/lfea-bm3-consolidated-latest-output-check.mjs
```

The M032 report is written to `reports/m032-bm3-load-custody.json`.

## Explicitly remaining

This slice does not claim full BM3 parity. The remaining named gaps are:

- real bend arc geometry and directional flexibility on the shared BM2/BM3 path;
- reducer-candidate parity qualification;
- generated-station and duplicate-pair solver/report identity.

The strict ±5% policy is unchanged.
