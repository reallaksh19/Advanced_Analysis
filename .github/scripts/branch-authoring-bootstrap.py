from pathlib import Path

path = Path('e2e/topology-edit-branch-authoring.spec.js')
text = path.read_text()
old = "expect(applied.components[0].catalogueRecordHash).toMatch(/^sha256:/u);"
new = "expect(applied.components[0].catalogueRecordHash).toMatch(/^fnv1a64:[0-9a-f]{16}$/u);"
if text.count(old) != 1:
    raise SystemExit(f'expected one browser assertion anchor, found {text.count(old)}')
path.write_text(text.replace(old, new))
