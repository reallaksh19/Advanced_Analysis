from pathlib import Path

path = Path('src/workspace/topology-edit/topology-edit-branch-component-command.js')
text = path.read_text()
old = """export function normalizeTopologyEditBranchComponentRequest(input = {}) {
  const operationId = requiredText(input.operationId, 'operationId');
"""
new = """export function normalizeTopologyEditBranchComponentRequest(input = {}) {
  if (input?.schema === TOPOLOGY_EDIT_BRANCH_COMPONENT_REQUEST_SCHEMA) {
    return assertTopologyEditBranchComponentRequest(input);
  }
  const operationId = requiredText(input.operationId, 'operationId');
"""
if text.count(old) != 1:
    raise SystemExit(f'expected one normalization anchor, found {text.count(old)}')
text = text.replace(old, new)
old_token = "const token = request.requestHash.replace(/^sha256:/u, '').slice(0, 16);"
new_token = "const token = request.requestHash.split(':').at(-1).slice(0, 16);"
if text.count(old_token) != 1:
    raise SystemExit(f'expected one token anchor, found {text.count(old_token)}')
path.write_text(text.replace(old_token, new_token))
