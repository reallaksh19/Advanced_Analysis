# Runtime B31 factor calculator

This package derives and seals ASME B31.3 Appendix D / ASME B31J flexibility and stress-factor records from caller-supplied geometry. It is deliberately a calculator, not an applier: it never compiles components, changes stiffness, evaluates code stress, or solves a model.

## Implemented profiles

- `B31_3_2018_APPENDIX_D`
- `B31_3_2020_B31J_2017`
- `B31_3_2022_B31J_2017`
- `B31_3_2024_B31J_2023`

There is no `B31J_2022` profile. B31.3-2020 and B31.3-2022 use B31J-2017; B31.3-2024 uses B31J-2023. Unsupported profiles fail closed.

## Component scope

- welding elbows / smooth bends
- welding tees, with distinct run and branch directional factors under B31J
- concentric reducers, including endpoint-qualified matching-pipe geometry

All geometry entering the equation kernel is SI (`lengthUnit: 'm'`). The InputXML adapter converts the file's declared source units before calculating factors and fails when selected components lack required supplementary geometry.

## Ownership and integration

The package emits the existing sealed contracts:

- `fea-linear-component-factor-set/v1` for scalar flexibility factors that B-3.2 is able to consume
- `fea-b31-stress-factor-set/v1` for directional stress indices/SIFs that B-4.0 is able to consume

B31J tee flexibility is directional. The current B-3.2 contract accepts only one scalar factor and explicitly refuses directional flexibility, so this calculator exposes the run/branch directional values in the calculation result but does not average or collapse them into a component factor set.

B31J reducer equations do not define one general numeric flexibility factor. Reducer results therefore emit SIFs plus large-end/small-end matching-pipe geometry and do not invent `k = 1`.

## Applicability

Applicability is checked before any sealed factor set is emitted. Out-of-domain components return `BLOCKED` with machine-readable violations. The calculator does not clamp to a boundary, extrapolate, or silently fall back from B31J to unity.

B31J-2023 sustained indices apply the Table 1-1 `D_o/T > 50` correction; displacement SIFs remain unchanged. Legacy B31.3-2018 sustained indices use the para. 320.2 default mapping.
