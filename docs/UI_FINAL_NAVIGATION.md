# UI Final Navigation

The user-facing navigation has been updated to remove confusing internal/legacy names.

## Final Navigation Tabs
1. **Home / Dashboard** (\`home\`)
2. **PCF Import** (\`pcf\`)
3. **Geometry / Sketcher** (\`sketcher\`)
4. **2D Simplified Stress Check** (\`simpAnalysis\`)
5. **3D Guided Cantilever** (\`3d-analysis\`)
6. **Pipe Rack & Expansion Loop** (\`piperack\`)
7. **Reports** (\`reports\`)
8. **Benchmarks / Validation** (\`benchmarks\`) - Hosts the SPL2 legacy benchmark
9. **Settings / Defaults** (\`settings\`)
10. **Debug / Diagnostics** (\`diagnostics\`)

## Removed/Hidden Tabs
- SPL2 Bundle (moved under Benchmarks)
- Calc Extended
- Simp Analysis
- Viewer (mapped to Home)
- Transform (removed)
- Datatable (mapped to PCF Import)
- Config (mapped to Settings)

The \`TopNav.jsx\` component has been updated to render the new tabs with intuitive icons, and the \`App.jsx\` routing has been adjusted accordingly.
