# Ten-cylinder reducer condensation authority

This package implements the documented CAESAR II structural representation of a reducer as ten cylindrical spans with progressively changing diameter and wall thickness. It assembles the ten local beam matrices and statically condenses the nine internal stations to a normal two-node, twelve-DOF boundary.

Gravity and thermal initial-strain vectors are assembled on the ten physical cylinders and condensed through the same internal stiffness partition. Reducer code SIFs remain a separate authority and must not use a condensed equivalent section.

The public documentation does not state whether each CAESAR cylinder samples its section at a midpoint, endpoint or another location. This implementation therefore records `MIDPOINT_LINEAR_INTERPOLATION_CANDIDATE_V1` and returns `CANDIDATE_PENDING_SECTION_SAMPLING_VERIFICATION`; it does not claim exact CAESAR parity.
