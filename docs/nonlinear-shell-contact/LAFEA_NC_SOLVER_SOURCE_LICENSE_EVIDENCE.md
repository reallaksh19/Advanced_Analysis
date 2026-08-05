# LAFEA-NC — CalculiX Source and License Evidence

## Purpose

This work package acquires the first two real solver-custody evidence classes for the bound CalculiX CrunchiX 2.22 identity. It is stacked on the fail-closed solver-custody intake and does not create a new NC phase.

## Upstream binding

```text
repository:      https://github.com/Dhondtguido/CalculiX
commit:          cff1bb12ec7d24ad9048a1f54ae243a18d1a0b54
tree:            f53d7391769d610dcd1247cff8fb953072d11720
parent:          4bf1bda9e88de93608d2a6449cf024f77c2f7997
commit subject:  "posted ccx_2.22"
LICENSE blob:    d159169d1050894d3ea3b98e1c965c4058208fe1
SPDX identity:   GPL-2.0-or-later
```

The upstream commit, tree, parent, subject, and LICENSE Git blob are independently checked before evidence generation.

## Deterministic source archive

The workflow fetches the exact upstream commit and creates the source archive twice using:

```text
git archive --format=tar --prefix=CalculiX-<commit>/ <commit>
gzip -n -9
```

The two archives, license texts, provenance records, inventories, and reports must be byte-identical. The retained artifact contains the exact archive bytes, upstream LICENSE bytes, provenance record, generated license record, partial custody inventory, and fail-closed report.

## Authority result

This work package can verify exactly:

```text
SOURCE_ARCHIVE
LICENSE_RECORD
```

It must remain blocked on:

```text
EXECUTABLE_BINARY
CONTAINER_RECORD
BUILD_RECORD
PLATFORM_RECORD
LINKED_LIBRARIES_RECORD
THREAD_POLICY_RECORD
```

Even after the two evidence classes pass, `solverCustodyQualified`, `solverBridgeQualified`, shell/contact/code/module/production authority, and merge authority remain false.
