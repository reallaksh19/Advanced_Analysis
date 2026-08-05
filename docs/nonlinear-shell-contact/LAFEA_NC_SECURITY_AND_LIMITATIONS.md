# LAFEA-NC security and limitations

## Process boundary

The controlled runner:

1. validates the canonical model, solver profile, deck profile and execution request;
2. creates a private working directory;
3. writes only allowlisted deterministic inputs;
4. hashes the input deck before execution;
5. verifies the executable with `lstat`, `realpath` and SHA-256 checks;
6. rejects symbolic-link or non-regular executable custody;
7. invokes a fixed argument array with `shell: false`;
8. applies timeout and bounded stdout/stderr capture;
9. rejects symbolic links and non-regular output files;
10. enforces individual, aggregate and file-count output limits;
11. rejects unknown, missing or malformed outputs;
12. re-hashes the input deck after execution to detect mutation;
13. hashes every retained raw file;
14. parses and reconstructs evidence before creating a receipt;
15. cleans or quarantines the private directory according to policy.

Network access must be disabled by the containing runner or container. Execution is blocked when required containment cannot be established.

## Input controls

Rejected inputs include caller-supplied executable paths, working directories, environment variables, shell commands, arbitrary arguments, absolute includes, path traversal, network includes, unknown schemas, non-finite values, unsupported profiles, friction, adhesion, self-contact, plasticity and caller-created authority states.

## Output controls

The parser requires allowlisted filenames and distinguishes completion, failure and incomplete dispositions. It inventories steps, increments, field labels and ASCII FRD records, and reports missing requested outputs. It does not normalize away numerical differences. Raw files remain retained and hashed even when metadata is excluded from semantic authority.

## Remaining limitations

- External solver/archive/binary/container/compiler/library/license custody is unresolved.
- Shell formulation and finite-rotation accuracy remain NC-01 work.
- Contact enforcement and pressure accuracy remain NC-02 work.
- Rigid analytical surfaces are represented by deterministic facets; approximation convergence is not qualified.
- FRD numeric ranges are provisional structural inventory only.
- Shell section force and external work output mappings remain unsupported.
- No plasticity, residual dent, damage, fracture, fatigue or code assessment.
- No UI integration and no production execution authorization.
