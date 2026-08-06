from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[1]
helper = root / 'scripts/tmp-finalize-sjson-node-pos-v2.py'
text = helper.read_text()
old = "Node/POS trace is not resolved: ${{nodePositionTrace.schema}} / ${{nodePositionTrace.status}}."
new = "Node/POS trace is not resolved: ${nodePositionTrace.schema} / ${nodePositionTrace.status}."
if old not in text:
    raise SystemExit('Expected escaped JavaScript template expression not found.')
helper.write_text(text.replace(old, new, 1))
Path(__file__).unlink()
subprocess.run(['python', str(helper)], cwd=root, check=True)
