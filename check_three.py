import os
import glob

for root, _, files in os.walk('src'):
    for f in files:
        if not f.endswith('.js') and not f.endswith('.jsx'): continue
        path = os.path.join(root, f)
        with open(path, 'r') as file:
            content = file.read()
            if 'THREE.' in content and 'import * as THREE' not in content:
                print(f"File {path} uses THREE but doesn't import it!")
