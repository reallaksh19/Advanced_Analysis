# LAFEA-NC external solver profile

## Provisional kernel

The provisional executor is CalculiX CrunchiX 2.22, bound to source commit:

```text
cff1bb12ec7d24ad9048a1f54ae243a18d1a0b54
```

The solver remains a numerical executor. LAFEA owns canonical geometry, materials, sections, contact-pair identity, load-step order, units, requested outputs, limitations, qualification state and evidence hashes.

## Required custody

A bridge-qualified profile must bind:

```text
solver name and exact version
source repository and source commit
source archive SHA-256
binary SHA-256
container image and immutable digest
operating system and CPU architecture
compiler name, version and flags
linked-library manifest hash
fixed thread count
allowlisted environment
license identifier and reviewed disposition
```

The repository does not commit a CalculiX binary. Source/archive, binary, container, toolchain and license-review custody are unresolved until owner-approved evidence is supplied.

## Canonical-to-solver mappings

```text
SHELL_Q4_EXTERNAL_KERNEL_V1 → solver-specific Q4 shell identity in the deck profile
RIGID_PLANE                 → deterministic S4 plane facet + rigid-body reference node
RIGID_SPHERE                → deterministic polar-cap S3/S4 facets + rigid-body reference node
RIGID_CYLINDER              → deterministic S4 cylindrical facets + rigid-body reference node
RIGID_SADDLE                → deterministic concave cylindrical S4 facets + rigid-body reference node
```

Rigid-surface faceting is controlled by `NC00_DETERMINISTIC_RIGID_SURFACE_FACETING_V1`. Coordinates are quantized using a registered significant-digit policy, and geometry mappings are hash-bound. This mapping proves reproducible deck syntax only.

## Execution command

The runner uses a fixed executable and argument array with `shell: false`. Callers cannot provide executable paths, working directories, environment variables, include files, network locations, container overrides or arbitrary arguments.

## Result boundary

NC-00 parses structural completion and inventory evidence from allowlisted solver outputs. It does not select or qualify a final engineering frame, and it does not promote shell, contact or denting authority from solver completion alone.
