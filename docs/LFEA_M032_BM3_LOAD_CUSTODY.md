# M032 BM3 prequalification and strict parity

M032 closes the BM3 load-custody and stiffness-path gaps without changing the retained strict comparison rule.

## Declared F1 authority

`src/core/linear-piping-inputxml-force-moment/index.js` converts retained InputXML `FORCESMOMENTS` records into immutable `NODAL_FORCE_MOMENT` primitives. Vector selection is explicit, missing components are zero, non-finite components are rejected, source nodes must bind to the compiled model, and every source-record/vector identity may be emitted only once. The BM3 InputXML force basis is retained as global.

BM3 contains two active vector-1 declarations:

- source node 65: global `FY = -4000 N`;
- source node 100: global `FY = -4000 N`.

They assemble only in CASE 5, with a global resultant of `FY = -8000 N`.

## Physical case custody

| Case | Formula | Thermal state | Spring hardware | Hanger preload | F1 | Friction |
|---|---|---|---|---|---|---|
| CASE 3 | `W+T1+P1+H` | T1 | retained | on | off | off |
| CASE 4 | `W+T2+P1+H` | T2 | retained | on | off | off |
| CASE 5 | `W+P1+H+F1` | none | retained | on | vector 1 | off |
| CASE 6 | `W+T2+P1+H` | T2 | retained | on | off | off |
| CASE 7 | `W+P1` | none | retained | off | off | off |

CASE 6 and CASE 7 are independent physical solves, not subtraction-derived cases. CASE 7 retains the installed variable-spring hardware stiffness because the physical springs remain in the model; it excludes the `H` preload primitive. It also uses the unstrained installation reference and contains no temperature primitive.

The governed thermal policy uses the retained cold elastic modulus for stiffness and separate secant expansion states:

- T1: `1.350414865e-5 /K`;
- T2: `1.37e-5 /K`.

These values are retained as benchmark reconstruction authorities because the InputXML exposes the temperature cases and moduli but not the material expansion table used by the originating solve.

## Final stiffness path

The six source bends are compiled as generated near/mid/far arc components through the qualified B-3.2 component authority. Straight pipe and bend subelements use the qualified annular Timoshenko formulation. The single bend carrying an explicit InputXML `KFACTOR=2.123` retains a disclosed two-node compliance-equivalence record so the generated arc geometry and the retained K value are not double-counted.

The two reducers remain ten-cylinder condensed authorities. Their suitability is no longer inferred from geometry alone: the final reducer model, bend model, and selected physical springs are exercised together by all 1,512 strict CASE 6/7 scalar comparisons.

The variable-spring selector now supports a declared working-load reserve. BM3 uses a 0.5% reserve, preventing selection of a catalog size operating effectively at its upper boundary and retaining the physical selections:

- node 20: figure 98, size 11;
- node 22: figure B-268, size 11.

## Controlled attribution

The M032 check runs the complete two-by-two hanger/F1 factorial while holding weight, pressure, and friction state constant:

- `H0_F0`: no spring hardware/preload and no F1;
- `H1_F0`: spring hardware/preload only;
- `H0_F1`: F1 only;
- `H1_F1`: combined endpoint.

It reports both context-specific main effects and the interaction term. A single CASE 5/7 endpoint comparison is not used for causal attribution.

## Strict result

The comparator preserves the exact rule `abs((solver-reference)/reference) < 0.05`; zero references require exact reported zero. No tolerance was relaxed.

| Case | Scalars | Passed | Failed | Mean nonzero error | P95 nonzero error | Maximum error |
|---|---:|---:|---:|---:|---:|---:|
| CASE 6 | 756 | 756 | 0 | 1.296% | 3.496% | 4.828% |
| CASE 7 | 756 | 756 | 0 | 1.423% | 3.592% | 4.709% |
| Combined | 1,512 | 1,512 | 0 | — | — | 4.828% |

Every source row is matched; unmatched reference and solver row counts are zero. Statistics are also retained by displacement, restraint, global-force, and local-force family in `reports/bm3-consolidated-latest-output.json`.

## Direct qualification

```bash
node scripts/lfea-m032-inputxml-force-moment-check.mjs
node scripts/lfea-m029-bm3-hanger-check.mjs
node scripts/lfea-m032-bm3-load-custody-check.mjs
node scripts/lfea-m032-bm3-consolidated-latest-output-check.mjs
npm run check:lfea-linear-core
```

The direct custody record is `reports/m032-bm3-load-custody.json`. The consolidated v4 record is `reports/bm3-consolidated-latest-output.json`.
