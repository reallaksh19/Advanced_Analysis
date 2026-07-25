# Canonical Geometry Contract

This document defines the Canonical Geometry contract for the Simplified Analysis app (Phase 6).

Canonical geometry serves as the stable, shared backbone between PCF import, sketching tools, 2D calculation, 3D guided cantilever screening, Pipe Rack routing, and engineering report generation.

## Schema Definition

The canonical geometry payload is an object containing the following primary entities:
- `project`: Project metadata.
- `units`: (Currently managed via `unit` string property on the root object).
- `nodes`: Array of 3D coordinates.
- `segments`: Connecting elements (e.g., pipes, bends) between nodes.
- `components`: Inline or attached items (valves, flanges).
- `supports`: Boundary conditions and constraints.
- `loads`: Applied forces/moments.
- `materials`: Material property definitions.
- `diagnostics`: Array of parsing/validation diagnostics.
- `sourceMetadata`: Data indicating origin (e.g., PCF parsing metadata).

## Validation Rules

Before solver execution, canonical geometry must be validated via `validateCanonicalGeometry`.

The following rules are enforced:
1. **Schema Version**: Must be present (`canonical-geometry-v1`). (Warning if missing)
2. **Units**: Must be present and supported (e.g., 'mm', 'in', 'm', 'ft'). (Fatal/Error if missing or unknown)
3. **Node IDs**: Must be strictly unique.
4. **Segment IDs**: Must be strictly unique.
5. **Topology**: Segment start and end IDs must reference existing nodes.
6. **Zero-Length**: Segments with zero length are rejected unless explicitly typed as `SUPPORT` or item marker.
7. **Components**: Must reference existing segment IDs or node IDs.
8. **Supports**: Must reference existing node IDs or segment IDs.
9. **Required Calculation Fields**: For pressure-containing components (PIPE, BEND, TEE, etc.), `diameter` (or `bore`) and `thickness` must exist.
10. **Duplicate Detection**: Identical coordinate coordinates or paths will generate warnings or errors.

## Diagnostic Severities

The validation routine populates the `diagnostics` array with standard severities:
- **INFO**: General metadata or minor normalization notices.
- **WARNING**: The geometry can proceed to calculations but may rely on defaults or contain dubious topology (e.g. duplicate path).
- **ERROR**: The geometry has broken topology or critical missing calculation properties.
- **FATAL**: The geometry cannot be processed at all.

## Usage

```javascript
import { validateCanonicalGeometry } from 'src/core/geometry/validateCanonicalGeometry.js';

const result = validateCanonicalGeometry(myGeometryPayload);
if (!result.ok) {
  console.error("Geometry failed validation", result.errors);
} else {
  // Safe to pass to solver
  const normalized = result.normalizedGeometry;
  // ...
}
```
