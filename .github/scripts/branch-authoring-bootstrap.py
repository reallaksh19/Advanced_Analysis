from pathlib import Path

path = Path('src/workspace/topology-edit/topology-edit-checker.js')
text = path.read_text()
old = """      const required = requiredPhysicalClearance(a, b, policy.physicalClearanceMm);
      if (required !== null && separation < required) {
"""
new = """      const required = governedBranchMatingPair(a, b)
        ? null
        : requiredPhysicalClearance(a, b, policy.physicalClearanceMm);
      if (required !== null && separation < required) {
"""
if text.count(old) != 1:
    raise SystemExit(f'expected one clearance anchor, found {text.count(old)}')
text = text.replace(old, new)
old_helper = """function shareNode(a, b) {
  return a.fromNodeId === b.fromNodeId || a.fromNodeId === b.toNodeId
    || a.toNodeId === b.fromNodeId || a.toNodeId === b.toNodeId;
}

function collinearOverlap(a, b, tolerance) {
"""
new_helper = """function shareNode(a, b) {
  return a.fromNodeId === b.fromNodeId || a.fromNodeId === b.toNodeId
    || a.toNodeId === b.fromNodeId || a.toNodeId === b.toNodeId;
}

function governedBranchMatingPair(a, b) {
  const operationId = String(a.branchComponentOperationId ?? '').trim();
  if (!operationId || operationId !== String(b.branchComponentOperationId ?? '').trim()) {
    return false;
  }
  const roles = new Set([
    String(a.branchComponentRole ?? '').toUpperCase(),
    String(b.branchComponentRole ?? '').toUpperCase(),
  ]);
  return roles.has('BRANCH_PIPE')
    && (roles.has('HOST_FROM') || roles.has('HOST_TO'));
}

function collinearOverlap(a, b, tolerance) {
"""
if text.count(old_helper) != 1:
    raise SystemExit(f'expected one helper anchor, found {text.count(old_helper)}')
path.write_text(text.replace(old_helper, new_helper))
