# PCF Import Export Contract

## Required features:
1. PCF import to canonical geometry.
2. PCF export or snapshot export from canonical geometry.
3. Import diagnostics.
4. Unsupported component list.
5. Missing property list.
6. Loss report.
7. Import confidence score.
8. Round-trip smoke test.

## Example Diagnostic
```json
{
  "imported": {
    "nodes": 10,
    "segments": 9,
    "elbows": 2,
    "tees": 1,
    "supports": 3
  },
  "warnings": [
    { "code": "MISSING_RATING", "count": 4 },
    { "code": "UNSUPPORTED_COMPONENT", "componentType": "..." }
  ],
  "lossReport": []
}
```
