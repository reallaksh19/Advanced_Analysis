# Known Limitations

* **Not a Full Stress Analysis Replacement:** The application performs Screening and Design-Aid calculations but is not formally code-compliant pipe stress analysis.
* **Scope Restriction:** Complex branch scoping, unusual boundaries, un-standard pipe sizes, or extreme layout considerations will trigger warnings and are natively unsupported.
* **SPL2 Pending:** Some numeric benchmarks generated via the SPL2 application may still mark as `PENDING_NUMERIC_EXTRACTION`. The application must not certify benchmarks natively if references are missing.
* **Calculation Warnings:** Calculations outside designated geometries and screening boundaries will safely provide structured error or warning messages. No implicit fallbacks to hidden variables are permitted.
