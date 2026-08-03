# Backups

Point-in-time snapshots of the core LFEA solver, taken at milestones worth
being able to restore or diff against independently of git history depth.

## appS_R1_Bechmarked.zip

Snapshot of `src/core/` (all core solver packages), `scripts/` (all
check/benchmark scripts), `package.json`, and `docs/OWNER_ROADMAP.md`.

- **Source commit**: `main` @ `cb9e2a2` (M013 merged — #506)
- **Milestone**: ASME B31.3 Appendix S Example 1 (Round 1) — the LFEA
  solver's real production chain (B-2.2/B-2.3 → B-3.1/B-3.2 → gravity/
  thermal augmentation → B-3.3 sparse solve → B-3.4 recovery) reproduces
  the ASME-published Table S301.5.1 (displacements/rotations) and Table
  S301.5.2 (reactions) to documented, justified tolerance.
- **Not included**: sustained-stress/displacement-stress-range validation
  (Tables S301.6/S301.7) — not yet benchmarked as of this snapshot.
