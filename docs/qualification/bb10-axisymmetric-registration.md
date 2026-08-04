# BB-10 Axisymmetric Q8 Formulation Registration

This record accompanies `AXI-Q8-REG-001` and documents the shared formulation scope only. It does not qualify the `C2D-FLANGE-HUB` application.

## Registered formulation

Meridional coordinates are `r-z`, with nodal ordering `[u_r1,u_z1,...,u_r8,u_z8]` and engineering strain/stress orderings:

```text
strain = [epsilon_r, epsilon_z, epsilon_theta, gamma_rz]
stress = [sigma_r, sigma_z, sigma_theta, tau_rz]
```

The production `B` matrix retains `epsilon_theta = sum(N_i u_ri)/r`, and the isotropic four-component constitutive matrix uses engineering shear. Element stiffness is integrated with full 3x3 Gauss quadrature and the axisymmetric volume measure `2*pi*r*det(J)`.

## Registration cases

- `AXI-Q8-REG-001-A`: one-element, regular multi-element, and genuinely distorted manufactured-field patches.
- `AXI-Q8-REG-001-B`: four-level long-cylinder Lamé plane-strain benchmark with all axial DOFs constrained, fixed physical probes, analytical energy, and axial-reaction checks.
- `AXI-Q8-REG-001-C`: cylindrical pressure, annular axial traction, and variable annular traction with independent analytical/high-order references and virtual-work checks.

## Independent oracle

The independent oracle implements its own Q8 shape derivatives, axisymmetric `B`, constitutive response, element stiffness, edge integration, Lamé fields, energy, and axial resultant. It does not import the production formulation or loading routines.

## Authority boundary

A validated, internally hashed axisymmetric registration approval receipt is required before the flange-hub registry record can move from `BLOCKED_PENDING_AXISYMMETRIC_REGISTRATION` to `FORMULATION_QUALIFIED`.

The registration retains all of the following as false:

```text
flangeHubApplicationQualified
flangeHubNumericalOutputQualified
codeAssessmentQualified
moduleQualified
applicationModulePromoted
productionSwitchAuthorized
```

Elements touching or crossing the symmetry axis are outside this registration. The implementation is limited to small-strain, linear, homogeneous isotropic elasticity using full-integration eight-node serendipity quadrilaterals.
