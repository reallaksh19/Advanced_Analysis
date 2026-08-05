# LAFEA-NC Solver Bridge Evidence

## Purpose

This work package executes the governed NC-00 model-to-deck-to-solver-to-result bridge against the solver custody qualified in the immutable OCI evidence package. It is the first numerical execution package, but it does not qualify shell mechanics, contact mechanics, denting, code assessment, fitness-for-service, module execution, production use, or merge authority.

## Corrective findings

Real CalculiX 2.22 execution exposed contract/runtime mismatches that synthetic contract fixtures could not reveal:

1. the original deck writer emitted 22-character scientific values, while the CalculiX free-field reader accepts the governed values only within its 20-character numeric field;
2. a legitimate FRD dataset is named `ERROR`, which must not be interpreted as a solver diagnostic;
3. nonlinear iteration logs may contain transient `no convergence` messages before a later converged increment and final `Job finished` marker;
4. CalculiX reports step ordinals rather than preserving the requested `NAME=` token, so exact step order must be reconstructed by governed ordinal count.

The corrected deck profile is versioned as:

```text
CALCULIX_2_22_NC00_DECK_V2
SCIENTIFIC_15_SIGNIFICANT_DIGITS_CCX_FIELD20_V1
```

## Exact solver custody input

```text
container evidence run:      31003696654
container artifact:          8929389138
artifact digest:             sha256:86a3e3fa66fe88e0eb47627418205a9d4ed22e9ede6b4517ffb6518fa9d54a30
OCI image digest:            sha256:e6a82117027ef72afbecd597b81ebd83e5b40bdcfc63a70422b799aeb79270fb
solver executable SHA-256:   9a33d293706a66bee86f2f0ecf996a66758f904c20d61ad8c83ddc0f92ae4b7e
custody inventory hash:      sha256:3055a9587b2481d05d7691e81eeba35fd30d0a37de16761f0b587c6af0eba5ab
custody report hash:         sha256:768335de3f424803ebd4b1afe72cece375ff2cdcaf3e76d3be04c2f030648f54
```

Before execution, every host dynamic library resolved by the exact executable must byte-match the corresponding retained OCI library ledger entry. The executable is copied as a regular non-symlink file and re-hashed before each governed execution.

## Isolation and execution

The complete bridge controller runs inside a new Linux network namespace. It requires:

```text
interfaces: lo only
routes:     none
shell:      prohibited by execution runner
threads:    OMP=1, OPENBLAS=1
locale:     C
zone:       UTC
```

The existing NC-00 execution runner writes the deterministic input deck into a private mode-0700 directory, invokes only the approved executable with fixed arguments `-i model`, applies bounded streams and timeout controls, rejects non-allowlisted files and symbolic links, verifies the input deck after execution, retains raw outputs, parses structural inventory, and independently reconstructs model/profile/deck/manifest/output bindings.

## Governed fixtures

All existing NC-00 positive fixtures are executed, including the minimal shell case, rigid plane/contact case, explicit multistep case, and the plane, sphere, cylinder, and saddle rigid-surface adapters. The existing negative controls, independent reconstruction, deterministic deck replay, and completed-result controls are rerun unchanged.

Two complete bridge executions must produce:

- identical NC-00 report semantic hashes;
- byte-identical decks, mappings, FRD, STA, CVG, DAT, 12D and stderr evidence where present;
- identical solver stdout after normalizing only the reported elapsed runtime;
- identical fixture-level deterministic execution evidence.

## Authority boundary

A successful exact-head run may produce:

```text
solverCustodyQualified:        true
solverBridgeQualified:         true
nc01Authorized:                true
shellFormulationQualified:     false
contactProcedureQualified:     false
elasticDentingQualified:       false
plasticMaterialQualified:      false
plasticDentingQualified:       false
codeAssessmentQualified:       false
moduleQualified:               false
productionExecutionAuthorized: false
mergeAuthorized:               false
```

`nc01Authorized=true` permits the next shell-formulation benchmark work package to start. It is not shell-formulation qualification.
