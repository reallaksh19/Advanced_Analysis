# LAFEA-NC NC-05 Plastic Denting Qualification

NC-05 integrates only the previously qualified NC-02 frictionless contact procedure, NC-03 elastic denting geometry/load sequence, and NC-04 monotonic J2 material lot. It qualifies a bounded permanent-dent procedure, not collapse, failure pressure, damage, fracture, fatigue, code assessment, fitness-for-service, remaining strength, or production execution.

## Registered cell

- full S8R cylindrical shell, D/t = 40 and L/D = 2;
- rounded rigid C3D8 indenter, radius/D = 0.4 and patch width/D = 0.5;
- follower pressure ratio pD/(2tE) = 9.52381e-4;
- imposed indenter travel/D = 0.04;
- exact NC-04 material lot: E = 210000, nu = 0.3 and true-stress/log-plastic-strain table (250,0), (300,0.002), (350,0.01), (450,0.05);
- displacement-controlled indentation, pressure-maintained unload and final depressurization.

## Required evidence

1. pressure-preload equilibrium;
2. elastoplastic load path and active contact;
3. plastic activation and localization;
4. permanent residual dent;
5. elastic-to-plastic depth transition;
6. pressure sensitivity;
7. boundary-extent sensitivity;
8. circumferential shell-mesh sensitivity;
9. increment convergence;
10. byte-identical independent replay.

The exact-head workflow executes eight unique CalculiX cases twice, validates immutable NC-04 and solver custody, compares canonical evidence byte-for-byte, evaluates twice, and retains diagnostic and authoritative artifacts.

## Authority boundary

A qualified receipt may grant `plasticDentingProcedureQualified=true` and `nc06Authorized=true`. It must keep collapse, failure-pressure, damage, fracture, fatigue, code-assessment, module, production, automatic-acceptance, autonomous-disposition, fitness-for-service, and remaining-strength authority false.
