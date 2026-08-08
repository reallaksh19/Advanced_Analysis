# BM4 L19 Bourdon translation / rotation RCA follow-up

## Scope

This is an evidence-only follow-up to the BM4/L19 CASE 19 linear comparison. It does not register a production Bourdon formulation, does not modify the solver, and does not encode fitted CAESAR II rotational coefficients.

Boundary assumptions for the comparison remain linear/bilateral: no friction, no gaps, no unilateral active set, and no F1/F2 hanger logic.

## Geometry disposition

The 20295 junction and the 20295→21430 bend-7 branch were inspected as a possible source of the 21470 force mismatch.

The compiled M035 topology uses one solver node for physical node 20295 and the three branches incident there remain connected. The source 21430→21470 interval is 0.850 m and a 0.2286 m bend tangent deduction leaves a 0.6214 m straight residual, which is consistent with the CAESAR II member-load resultant. The downstream 21470→21480 member remains approximately 3.161 m; it is not another 0.6214 m span.

No geometry edit is proposed by this follow-up.

## Translation candidate

The translation counterfactual contains two effects:

1. closed-end pressure axial free strain on the 76 non-rigid straight/tangent analysis frames;
2. component-level free translation of all 11 bends along the near-to-far curvature chord, with magnitude derived from the pressure strain and developed bend length.

This is intentionally separate from rotational Bourdon opening.

### Node 21470 / IX-S37 comparison

| Quantity | Straight translation only | + all bend chord translation | CAESAR II |
|---|---:|---:|---:|
| 21470 UY reaction / incident FY sum, N | -414.064 | -563.743 | -657 |
| IX-S37 J FY, N | -629.638 | -751.080 | -899 |
| IX-S37 J MZ, N·m | +412.064 | +501.318 | +327 |
| 21470 RZ, deg | -0.004639 | -0.006211 | -0.0033 |
| 21480 RZ, deg | -0.013841 | -0.013056 | -0.0148 |

The bend-translation family materially improves the force resultant but does not reproduce the bending/rotation field. Therefore translation-only is not sufficient for the CAESAR II job, which uses Bourdon translation + rotation.

## Rotational sensitivity diagnostic

A two-mode IX-S36 tangent-moment sensitivity was used only to test whether the missing fixed-end-moment family has the correct leverage. The two amplitudes were fitted to the 21470 UY reaction and 21430 RZ and are not a production formula.

Diagnostic amplitudes:

- near tangent MZ mode: -3767.061 N·m
- far tangent MZ mode: +1882.969 N·m

With those diagnostic modes, the surrounding boundary actions become:

| Quantity | Diagnostic prediction | CAESAR II |
|---|---:|---:|
| IX-S37 I FY, N | +1243.904 | +1245 |
| IX-S37 J FY, N | -897.993 | -899 |
| IX-S37 I MZ, N·m | +333.774 | +339 |
| IX-S37 J MZ, N·m | +331.714 | +327 |
| IX-S38 I FY, N | +240.993 | +242 |
| IX-S38 I MZ, N·m | -331.714 | -327 |
| IX-S38 J FY, N | +1518.625 | +1517 |
| IX-S38 J MZ, N·m | -1687.583 | -1688 |
| 21470 RZ, deg | -0.003225 | -0.0033 |
| 21480 RZ, deg | -0.014548 | -0.0148 |

However, the same diagnostic predicts 21429 RZ ≈ -0.02056° versus CAESAR II ≈ -0.0109°. This rejects a simple endpoint-moment representation as the full rotational Bourdon formulation.

## RCA conclusion

Current evidence supports the following decomposition:

- geometry/topology around 20295 and the tangent-length mapping are not the dominant cause;
- straight/tangent pressure translation is required;
- bend-level chord translation is also required and materially improves the 21470 force field;
- CAESAR II rotational Bourdon remains necessary to reproduce the bending/rotation field;
- the rotational effect must be implemented as a qualified bend-component deformation/fixed-end mechanism, not as fitted endpoint moments or uniform axial strain smeared over bend arc elements.

## Non-capabilities

This follow-up intentionally does not:

- change production solver behavior;
- publish fitted tangent moments as engineering authority;
- claim the CAESAR II rotational Bourdon equation has been derived;
- reintroduce unilateral/nonlinear support behavior;
- alter the 20295/21430 geometry.
