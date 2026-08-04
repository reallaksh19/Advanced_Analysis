# Runtime B31 SIF and flexibility-factor calculator

This package derives factor records from caller-supplied component geometry normalized to metres. It does not assemble stiffness, recover actions, calculate stress, or apply a factor to a model.

## Edition profiles

- `B31_3_2018_APPENDIX_D`: legacy ASME B31.3 Appendix D rules.
- `B31_3_2020_B31J_2017`: B31.3-2020 with ASME B31J-2017.
- `B31_3_2022_B31J_2017`: B31.3-2022 with ASME B31J-2017.
- `B31_3_2024_B31J_2023`: B31.3-2024 with ASME B31J-2023.

The B31J-2023 profile also applies the edition's sustained-index correction when `D_o/T > 50`, while retaining the unmodified displacement SIFs. There is no `B31J-2022` profile. The API rejects that identity instead of silently choosing another edition.

For bends, the B31J smooth-90 flexibility option is explicit rather than inferred. Set `smooth90FlexibilityCorrection: true` only with a declared `bendAngleDegrees` of 90 degrees. That selects the B31J Table 1-1 Note (3) `1.3/h` flexibility expression. Otherwise the calculator retains the general `1.65/h` bend expression. The option is blocked for legacy Appendix D profiles and for non-90-degree geometry. The existing single-wall-thickness bend contract is the matching-pipe thickness basis required by this option.

## Outputs and ownership

Verified B31J welding tees use the existing `VERIFIED_B16_9` policy as the explicit Table 1-1 Note (6) authorization: raw directional flexibility factors and SIFs are divided by `1.26`, then the mandatory factor floor of `1.0` is applied. The raw values and reduction evidence remain visible in the calculation result.

Bends produce a sealed `fea-linear-component-factor-set/v1` for the scalar bend flexibility factor and a sealed `fea-b31-stress-factor-set/v1` for stress evaluation. Legacy tees can also produce the scalar component factor set. B31J tees retain their separate run/branch and in-plane/out-of-plane/torsional flexibility factors in the calculator result; they are not averaged into the current B3.2 scalar component-factor contract. Reducers emit directional SIFs and endpoint-specific matching-pipe evidence, but no invented general reducer `k`.

The existing B3.2 piping-component package remains the only package allowed to apply flexibility. The existing B4.0 code engine remains the consumer of stress-factor sets.

## Applicability

Out-of-domain geometry produces a `BLOCKED` result with named violations and no numeric factor set. Equations are not clamped to an applicability boundary. Reducer calculations require large-end and small-end wall geometry, cone angle, transition radius, small-end cylinder length, and body minimum wall thickness.

## InputXML

`calculateB31FactorsFromInputXml` reuses the existing InputXML-to-canonical-geometry adapter and converts every factor geometry length to metres before calculation. Bend diameter, thickness, radius, pressure, elastic modulus, and a declared source bend angle may come directly from the canonical segment. The smooth-90 correction remains opt-in; set `smooth90FlexibilityCorrection` in supplementary geometry when that policy is authorized. Tee branch geometry and reducer endpoint/taper geometry require `fea-b31-supplementary-component-geometry/v1` records because the canonical InputXML segment does not retain enough information to evaluate those rules safely.

## Source boundary

The implementation contains equation logic and rule identities only. It does not contain allowable-stress tables or bulk copyrighted datasets. Every emitted factor carries a standard, edition, rule, revision, and semantic source identity.

## Supplementary geometry custody

Canonical InputXML currently lacks the branch/run dimensions needed by B31J tee equations and the endpoint/taper geometry needed by reducer equations. Those values are accepted only through a sealed `fea-b31-supplementary-geometry-set/v1` record. Entries are exact-keyed by component type, unit-declared, source-evidenced, deterministically ordered, hash-bound and duplicate-safe. The former unsealed `supplementaryGeometryBySegmentId` map is not a calculation input.
