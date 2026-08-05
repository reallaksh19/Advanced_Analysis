# LAFEA-NC NC-01 — Shell Formulation Qualification Contract

## Purpose

NC-01 defines the evidence contract for a finite-rotation, small-strain Reissner–Mindlin shell procedure. It does not implement or qualify shell mechanics by itself.

## Pinned first-family assumptions

- Three translations and two physical director rotations per node.
- A sixth drilling degree of freedom may exist only as numerical stabilization and has no physical output authority.
- Objective exponential-map director update.
- Midsurface reference with explicit shell offsets and mandatory top/bottom recovery.
- Follower pressure on the current physical surface.
- First candidate family: quadratic reduced-integration S8R, subject to solver-specific qualification.

## Mandatory benchmark domains

Rigid-body objectivity, membrane patch, pure bending, transverse-shear/thin-limit behavior, warped-quadrilateral sensitivity, follower pressure, normal reversal, and mesh refinement.

Every benchmark requires immutable reference and raw-evidence hashes, stated reference uncertainty, a tolerance not smaller than that uncertainty, an adequate mesh ladder, and a passing disposition.

## Authority

Contracts-only CI may set `nc01ContractQualified=true`. It cannot set `shellFormulationQualified=true` without complete solver custody and passing benchmark evidence. NC-02 mechanics authorization remains blocked until that gate is satisfied. Contact, denting, plasticity, damage, fracture, fatigue, code assessment, and production execution are outside NC-01.
