# Linear FEA rigid-element authority

This package compiles the documented CAESAR II rigid-element rules into a sealed, deterministic authority record. It is a producer of stiffness, weight, thermal and participation evidence; it does not assemble or solve the global system and does not calculate piping-code stress.

The implemented rules are:

- stiffness uses the original inside diameter with ten times the entered pipe wall thickness;
- entered rigid weight is the component body-weight authority and no pipe-wall metal weight is inferred;
- a nonzero entered weight enables equivalent straight-pipe fluid weight and `1.75` times equivalent insulation/cladding weight;
- a zero entered weight produces zero rigid, fluid, insulation, refractory and cladding weight;
- insulation uses the entered outside diameter, while fluid uses the original inside diameter;
- weight is represented as a uniform line load whose consistent vector preserves resultant and first moment;
- finite-length thermal strain remains active;
- forces and moments remain recoverable, while piping-code stress is ineligible.

The public boundary is `compileCaesarRigidElementAuthority()`. Integration into a specific imported project remains a separate model-authority task.
