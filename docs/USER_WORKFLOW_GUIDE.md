# User Workflow Guide

This guide outlines the canonical end-to-end workflow for end users of the Simplified Calc Suite.

## 1. PCF Import (or Sketching)
Users start by providing input geometry.
* **PCF Import:** Upload standard `.pcf` piping component files. The app parses the file, generates import diagnostics (including a loss report and confidence score), and transforms the elements into Canonical Geometry.
* **Sketch/Manual Input:** Alternatively, users can map geometry directly via manual input (or UI sketches), maintaining adherence to Canonical Geometry formats.

## 2. Geometry Validation
The application validates the Canonical Geometry:
* Schema version checking
* Unit normalization
* Uniqueness validations for Node IDs and Segment IDs
* Required properties checking (diameters, wall thicknesses, material configurations)

## 3. Screening & Calculations (2D Calc & 3D Calc)
With valid geometry loaded:
* **2D Simplified Stress Check:** Run the screening logic to inspect items like cantilever loads or simple span distributions. The solver clearly issues warnings, and discloses the applied formulas and calculations.
* **3D Guided Cantilever:** Perform screening for anchors, guides, supports, and approximate free spans. This will not perform full stress analysis, but output deterministic guidance for scoping.

## 4. Pipe Rack & Expansion Loop
Users route portions of the geometry through the PipeRack/Loop module:
* Checks the rack span screening
* Provides loop sizing recommendations and thermal growth estimates
* Highlights span limits and design-aid clearance constraints

## 5. Engineering Report Generation
Finally, generate printable, auditable outputs.
* **Report Output:** The finalized solver inputs, boundary constraints, warnings, limitation caveats, and deterministic outputs are aggregated into JSON and HTML engineering reports.
