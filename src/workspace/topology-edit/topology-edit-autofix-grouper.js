/**
 * Topology Edit Draft — Large-Model Autofix Categorization & Grouper
 *
 * Groups 100s of detected topology issues into exact tolerance confidence buckets:
 * - EXACT_MERGE_HIGH_CONFIDENCE (< 6.0 mm)  --> Auto-checked by default
 * - NEAR_MATCH_MEDIUM_CONFIDENCE (6.0 mm to 25.0 mm) --> Grouped for manual review
 * - DEGENERATE_ELEMENTS & STRUCTURAL (Zero-length / Missing Restraints)
 */

export const AUTOFIX_BUCKETS = Object.freeze({
  EXACT_MERGE_HIGH_CONFIDENCE: 'EXACT_MERGE_HIGH_CONFIDENCE',
  NEAR_MATCH_MEDIUM_CONFIDENCE: 'NEAR_MATCH_MEDIUM_CONFIDENCE',
  DEGENERATE_STRUCTURAL: 'DEGENERATE_STRUCTURAL',
});

export class TopologyEditAutofixGrouper {
  static groupIssues(issues = [], toleranceExact = 6.0, toleranceNear = 25.0) {
    const buckets = {
      exactMerges: [],      // < 6.0 mm (Auto-checked by default)
      nearMatches: [],      // 6.0 mm to 25.0 mm
      structuralIssues: [], // Zero length / missing restraints
    };

    issues.forEach(issue => {
      const dist = issue.distance ?? 0;
      if (issue.kind === 'ZERO_LENGTH_ELEMENT' || issue.kind === 'UNSUPPORTED_BRANCH') {
        buckets.structuralIssues.push({
          ...issue,
          bucket: AUTOFIX_BUCKETS.DEGENERATE_STRUCTURAL,
          checked: true,
        });
      } else if (dist < toleranceExact) {
        buckets.exactMerges.push({
          ...issue,
          bucket: AUTOFIX_BUCKETS.EXACT_MERGE_HIGH_CONFIDENCE,
          checked: true, // Auto-checked by default!
        });
      } else if (dist <= toleranceNear) {
        buckets.nearMatches.push({
          ...issue,
          bucket: AUTOFIX_BUCKETS.NEAR_MATCH_MEDIUM_CONFIDENCE,
          checked: false, // Manual review required!
        });
      }
    });

    return Object.freeze({
      totalCount: issues.length,
      autoCheckedCount: buckets.exactMerges.length + buckets.structuralIssues.filter(i => i.checked).length,
      buckets: Object.freeze(buckets),
    });
  }

  static checkHighConfidenceOnly(groupedResult) {
    if (!groupedResult || !groupedResult.buckets) return groupedResult;
    const b = groupedResult.buckets;
    b.exactMerges.forEach(i => i.checked = true);
    b.nearMatches.forEach(i => i.checked = false);
    b.structuralIssues.forEach(i => i.checked = true);
    return groupedResult;
  }

  static clearAll(groupedResult) {
    if (!groupedResult || !groupedResult.buckets) return groupedResult;
    const b = groupedResult.buckets;
    b.exactMerges.forEach(i => i.checked = false);
    b.nearMatches.forEach(i => i.checked = false);
    b.structuralIssues.forEach(i => i.checked = false);
    return groupedResult;
  }
}
