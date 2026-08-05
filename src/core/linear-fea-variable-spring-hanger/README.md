# Linear FEA programmed variable-spring hanger authority

This package implements the deterministic mechanics boundary for program-designed variable spring hangers:

1. consume a restrained-weight hot/design load and signed operating travel;
2. select a manufacturer catalog spring using declared travel, working-load and load-variation rules;
3. compile the selected support as a global-Y linear spring plus an upward theoretical-cold-load preload.

It does not derive hanger properties from a CAESAR output report. Output spring selections are qualification oracles only.

The initial catalog authority is the published ASC/Anvil PP-SUB-82-C82-v01 selection table. Load limits and spring rates are converted exactly from lbf and lbf/in to SI. Series are searched from the minimum recommended movement range toward wider ranges, then by ascending catalog size. The default variation gate is 25 percent.

## Design, compilation, and recovery boundaries

A programmed hanger is not one scalar spring. The authority is split into three auditable stages:

1. **Design** — restrained-weight reactions establish required hot loads; an operating-travel solve with those loads and no spring stiffness establishes signed travel; the catalog selector chooses the first valid series and size.
2. **Compilation** — the selected hanger contributes a global-Y grounded spring and an upward theoretical-cold-load preload primitive.
3. **Recovery** — the solver's grounded-spring reaction is only `-k u`; the complete hanger hardware action reported at the support is `H_c - k u`.

The preload remains on the physical right-hand side so equilibrium is solved correctly. Result recovery combines that preload with the elastic spring action rather than misreporting only the elastic increment.
