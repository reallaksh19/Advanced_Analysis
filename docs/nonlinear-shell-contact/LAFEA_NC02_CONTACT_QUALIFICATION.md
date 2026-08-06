# LAFEA-NC NC-02 Frictionless Contact Qualification

This current-main replacement supersedes stale contract PR #652. It consumes the exact qualified NC-01 receipt and does not trust caller-created PASS or authority fields.

## Registered procedure

- CalculiX 2.22 node-to-surface contact with large-sliding re-pairing;
- deformable S8R slave shell against a fixed C3D8 master surface;
- declared physical shell side including half-thickness offset;
- frictionless linear penalty law with nominal slope `1.0e7`;
- positive open gap, negative penetration and positive compressive pressure;
- zero tensile pressure, zero tangential traction and zero frictional work;
- explicit opening, closure, sliding, release and re-contact custody.

The benchmark slave uses a high elastic modulus to isolate the contact algorithm from shell flexibility. This does not extend authority beyond the registered contact procedure or replace NC-01 shell qualification.

## Real evidence domains

```text
NC02-CT-01 normal compression patch
NC02-CT-02 opening with zero tensile traction
NC02-CT-03 frictionless sliding under constant closure
NC02-CT-04 curved rigid surface
NC02-CT-05 rigid-facet edge transition
NC02-CT-06 large relative sliding and re-pairing
NC02-CT-07 release and re-contact
NC02-CT-08 orientation reversal
NC02-CT-09 penalty-sensitivity ladder
NC02-CT-10 four-level mesh-refinement ladder
```

Every domain retains exact decks, raw DAT/FRD output, solver streams, signed gaps, contact pressures, active states, penetration, master/slave resultants, contact energy, tangential traction, closest-point identity, orientation evidence, raw/reference/oracle hashes and a governed mutation.

## Acceptance boundaries

- penetration divided by the registered one-unit contact-patch characteristic length: at most `0.011`;
- global resultant residual: at most `0.005`;
- tangential traction ratio: at most `1e-8`;
- contact-work imbalance: at most `1e-8`;
- pressure-law error: at most `1e-5` except explicitly tighter benchmark tolerances;
- penalty-resultant spread over `[0.5, 1, 2]`: at most `0.01`;
- four-level mesh-resultant spread: at most `0.001`.

Tolerances are fixed by the contract before the exact-head workflow executes.

## Authority boundary

A passing receipt may set only:

```text
nc02ContractQualified = true
shellFormulationQualified = true
contactProcedureQualified = true
nc03Authorized = true
```

Denting, plasticity, code assessment, module, production, automatic asset acceptance, autonomous disposition, fitness-for-service and remaining-strength authority remain false.
