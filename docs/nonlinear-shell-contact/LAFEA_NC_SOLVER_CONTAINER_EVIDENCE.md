# LAFEA-NC Immutable Solver Container Evidence

## Purpose

This work package closes the final solver-custody evidence class by assembling an immutable OCI image from the sealed CalculiX 2.22 interpreter-custody artifact. It does not rebuild the executable and does not use a mutable base image.

The result may qualify **solver custody only**. Solver-bridge, shell formulation, contact, denting, code assessment, module, production, fitness-for-service, remaining-strength and merge authority remain false until their independent evidence packages are executed.

## Exact input binding

```text
interpreter evidence run:      31002498404
interpreter artifact:          lafea-nc-solver-interpreter-374547d65155c6c35c3d6336cc0ea32d71399f49-1
interpreter artifact digest:   sha256:2bba2951c60a1901b6a3072d7e7f7e5407a35ea4823013a4f964e685572d0f3a
CalculiX source commit:        cff1bb12ec7d24ad9048a1f54ae243a18d1a0b54
executable SHA-256:            9a33d293706a66bee86f2f0ecf996a66758f904c20d61ad8c83ddc0f92ae4b7e
interpreter SHA-256:           1cd555ac46b7887edeaf3c42aac5408c8135e52f6b37870da2cf82d5fe14e829
source archive SHA-256:        901908b655837fadc0a2753331bbaf81916ee1701b4c015254f1b09a15eec97f
license SHA-256:               8177f97513213526df2cf6184d8ff986c675afb514d4e68a404010521b880643
```

## OCI construction

The workflow constructs an OCI image layout directly from governed evidence bytes:

- no parent or mutable base image;
- one deterministic GNU-tar layer compressed with `gzip -n -9`;
- fixed creation time, ownership, ordering and entrypoint;
- exact executable, dynamic loader and all ten linked-library ledger entries;
- exact source archive and GPL-2.0-or-later license text;
- controlled build, platform, library, thread and license records;
- interpreter provenance and minimal-chroot runtime probe;
- prior `7/8` custody inventory and report.

The image configuration fixes:

```text
platform:       linux/amd64
entrypoint:     /opt/calculix/ccx_2.22
OMP threads:    1
OPENBLAS:       1
MKL:            1
library path:   /lib/x86_64-linux-gnu
```

## Verification

Two independent OCI assemblies must be byte-identical. The verifier independently reconstructs and checks:

1. OCI index, manifest, config and layer descriptor digests and sizes;
2. uncompressed layer diff ID;
3. exact entrypoint, environment and identity labels;
4. exact executable, loader, libraries, source archive and license bytes;
5. carried interpreter provenance, probe and prior custody receipts;
6. minimal rootfs execution with exit status `201` and the exact CalculiX usage response;
7. immutable container record and nested OCI archive hash;
8. deterministic full solver-custody replay.

## Authority boundary

A successful exact-head run must produce:

```text
status:                      SOLVER_CUSTODY_QUALIFIED
verified evidence classes:   8/8
solverCustodyQualified:      true
solverBridgeQualified:       false
shellFormulationQualified:   false
contactProcedureQualified:   false
codeAssessmentQualified:     false
moduleQualified:             false
productionExecutionAuthorized: false
mergeAuthorized:             false
```

No numerical benchmark, solver bridge, engineering acceptance or production authority is granted by the container receipt.
