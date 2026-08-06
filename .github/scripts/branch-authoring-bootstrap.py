from pathlib import Path

ROOT = Path('.')

def replace_once(path, old, new):
    p = ROOT / path
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'missing patch anchor in {path}: {old[:140]!r}')
    if text.count(old) != 1:
        raise SystemExit(f'non-unique patch anchor in {path}: {text.count(old)}')
    p.write_text(text.replace(old, new))

replace_once(
    'src/workspace/topology-edit/authoring/topology-edit-authoring-session.js',
    "      numberField('branchNominalSizeMm', 'Branch size', 'mm', null, { positive: true, authority: 'CATALOGUE' }),",
    "      numberField('branchNominalSizeMm', 'Branch size', 'mm', 50, { positive: true, authority: 'CATALOGUE' }),",
)

replace_once(
    'src/workspace/topology-edit/topology-edit-branch-component-command.js',
    "  const hostEdgeHash = requiredHash(input.hostEdgeHash, 'hostEdgeHash');",
    "  const hostEdgeHash = requiredContentHash(input.hostEdgeHash, 'hostEdgeHash');",
)
replace_once(
    'src/workspace/topology-edit/topology-edit-branch-component-command.js',
    "function requiredHash(value, field) {\n  const normalized = requiredText(value, field);",
    "function requiredContentHash(value, field) {\n  const normalized = requiredText(value, field);\n  if (!/^(?:sha256:[0-9a-f]{64}|fnv1a64:[0-9a-f]{16})$/u.test(normalized)) {\n    throw new RangeError(\n      `TopologyEditBranchComponentRequest: ${field} must be a sha256 hash or fnv1a64 semantic hash.`,\n    );\n  }\n  return normalized;\n}\n\nfunction requiredHash(value, field) {\n  const normalized = requiredText(value, field);",
)
