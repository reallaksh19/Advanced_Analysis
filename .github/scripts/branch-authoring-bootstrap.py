from pathlib import Path

path = Path('src/workspace/topology-edit/topology-edit-branch-component-command.js')
text = path.read_text()
replacements = {
    "  const catalogueHash = requiredHash(input.catalogueHash, 'catalogueHash');":
        "  const catalogueHash = requiredContentHash(input.catalogueHash, 'catalogueHash');",
    "  const catalogueRecordHash = requiredHash(\n    input.catalogueRecordHash,\n    'catalogueRecordHash',\n  );":
        "  const catalogueRecordHash = requiredContentHash(\n    input.catalogueRecordHash,\n    'catalogueRecordHash',\n  );",
}
for old, new in replacements.items():
    if text.count(old) != 1:
        raise SystemExit(f'expected one patch anchor, found {text.count(old)}: {old!r}')
    text = text.replace(old, new)
path.write_text(text)
