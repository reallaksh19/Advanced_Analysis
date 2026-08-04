# Agent 14 handoff — ten-cylinder reducer condensation

This change adds a pure candidate authority for CAESAR II's documented ten-cylinder reducer representation.

## Implemented

- ten equal-length cylindrical spans;
- midpoint linear interpolation of outside diameter and wall thickness;
- physical annulus `A`, `I` and `J` per span;
- assembly of ten beam stiffness matrices;
- static condensation of nine internal stations to twelve boundary DOFs;
- physical metal, fluid and insulation weight per span;
- condensed gravity vector preserving resultant and first moment;
- thermal strain per span and condensed initial-strain vector;
- explicit separation from reducer code SIF/stress authority.

## Qualification boundary

Public Hexagon documentation confirms ten successively changing cylinders but does not publish the exact representative section sampling location. The midpoint rule is therefore recorded as `MIDPOINT_LINEAR_INTERPOLATION_CANDIDATE_V1`, and the authority remains `CANDIDATE_PENDING_SECTION_SAMPLING_VERIFICATION` until a Technical Reference statement or controlled CAESAR benchmark resolves that point.
