import json
from collections import Counter

with open(r'F:/CODE-6/Advanced_Analysis/benchmarks/Sjson.json') as f:
    data = json.load(f)

# ---- BRANCH-level positions ----
print('=== BRANCH-level positions (HPOS/TPOS) ===')
for branch in data:
    attrs = branch.get('attributes', {})
    hpos = attrs.get('HPOS')
    tpos = attrs.get('TPOS')
    name = branch.get('name', '')[:50]
    print(f'  {name}')
    print(f'    HPOS={hpos}')
    print(f'    TPOS={tpos}')

print()

# ---- Coordinate ranges & unique Z ----
all_pos = []
for branch in data:
    for child in branch.get('children', []):
        a = child.get('attributes', {})
        for field in ['APOS', 'LPOS']:
            pos = a.get(field)
            if pos and isinstance(pos, dict):
                all_pos.append((pos['x'], pos['y'], pos['z']))

xs = [p[0] for p in all_pos]
ys = [p[1] for p in all_pos]
zs = [p[2] for p in all_pos]
zvals = sorted(set(zs))
print(f'=== Coordinate ranges ===')
print(f'X: {min(xs):.3f} to {max(xs):.3f}  (span {max(xs)-min(xs):.1f} mm)')
print(f'Y: {min(ys):.3f} to {max(ys):.3f}  (span {max(ys)-min(ys):.1f} mm)')
print(f'Z: {min(zs):.3f} to {max(zs):.3f}  (span {max(zs)-min(zs):.1f} mm)')
print(f'Unique Z values ({len(zvals)}): {zvals[:20]}')

print()

# ---- POSI string samples ----
print('=== POSI string samples (axis naming convention) ===')
count = 0
for branch in data:
    for child in branch.get('children', []):
        posi = child.get('attributes', {}).get('POSI')
        if posi and count < 8:
            print(f'  {posi}')
            count += 1

print()

# ---- ORI values ----
print('=== ORI values ===')
oris = Counter()
for branch in data:
    for child in branch.get('children', []):
        ori = child.get('attributes', {}).get('ORI')
        if ori:
            oris[ori] += 1
for k, v in oris.most_common():
    print(f'  {k!r}: {v}')

print()

# ---- APOS vs LPOS gap analysis ----
print('=== APOS vs LPOS - continuity check ===')
gaps = []
for branch in data:
    prev_lpos = None
    prev_name = None
    for child in branch.get('children', []):
        a = child.get('attributes', {})
        apos = a.get('APOS')
        lpos = a.get('LPOS')
        name = child.get('name', '')
        if prev_lpos and apos and isinstance(apos, dict) and isinstance(prev_lpos, dict):
            dx = apos['x'] - prev_lpos['x']
            dy = apos['y'] - prev_lpos['y']
            dz = apos['z'] - prev_lpos['z']
            dist = (dx**2 + dy**2 + dz**2) ** 0.5
            if dist > 1.0:  # gap bigger than 1mm
                gaps.append((dist, prev_name[:40], name[:40]))
        prev_lpos = lpos
        prev_name = name

gaps.sort(reverse=True)
print(f'Total continuity gaps > 1mm: {len(gaps)}')
for dist, n1, n2 in gaps[:10]:
    print(f'  gap={dist:.2f}mm: {n1!r} -> {n2!r}')

print()

# ---- Check HPOS/TPOS on children ----
print('=== Children with null BPOS/HPOS/TPOS ===')
bpos_none = hpos_none = tpos_none = 0
for branch in data:
    for child in branch.get('children', []):
        a = child.get('attributes', {})
        if a.get('BPOS') is None: bpos_none += 1
        if a.get('HPOS') is None: hpos_none += 1
        if a.get('TPOS') is None: tpos_none += 1
total_children = sum(len(b.get('children', [])) for b in data)
print(f'Total children: {total_children}')
print(f'BPOS=null: {bpos_none}/{total_children}')
print(f'HPOS=null: {hpos_none}/{total_children}')
print(f'TPOS=null: {tpos_none}/{total_children}')

# ---- Coordinate system: AVEVA / E3D uses E(ast)/N(orth)/U(p) ----
# vs 3D editor which uses X/Y/Z
# Check mapping
print()
print('=== Coordinate Mapping Analysis ===')
# AVEVA PDMS/E3D uses: E=East(X), N=North(Y), U=Up(Z)
# But the JSON uses x/y/z keys
# Check POSI strings vs APOS coords to understand mapping
samples = []
for branch in data:
    for child in branch.get('children', []):
        a = child.get('attributes', {})
        posi = a.get('POSI')
        apos = a.get('APOS')
        if posi and apos and isinstance(apos, dict):
            samples.append((posi, apos))

print('POSI string vs APOS dict (first 5 non-matching):')
for posi, apos in samples[:5]:
    # POSI format: "E 421773.221mm S 1141125mm U 1184.15mm"
    # S = South = negative North
    parts = posi.split()
    try:
        e_val = float(parts[1].replace('mm',''))
        n_val = float(parts[3].replace('mm',''))  # S means -N
        u_val = float(parts[5].replace('mm',''))
        print(f'  POSI E={e_val}, S={n_val}, U={u_val}')
        print(f'  APOS x={apos["x"]}, y={apos["y"]}, z={apos["z"]}')
        print(f'  --> x maps to E? {abs(e_val - apos["x"]) < 1}')
        print(f'  --> y maps to -S(N)? y={apos["y"]}, -S={-n_val} match={abs(apos["y"] - (-n_val)) < 1}')
        print(f'  --> z maps to U? {abs(u_val - apos["z"]) < 1}')
        print()
    except Exception as ex:
        print(f'  parse error: {ex}, posi={posi}')
