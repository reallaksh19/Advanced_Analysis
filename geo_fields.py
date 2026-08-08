import json
from collections import defaultdict

with open(r'F:/CODE-6/Advanced_Analysis/benchmarks/Sjson.json') as f:
    data = json.load(f)

types_of_interest = ['ELBO', 'FLAN', 'VALV', 'TEE', 'REDU', 'OLET', 'PIPE', 'GASK']
geo_keys = ['APOS','LPOS','BPOS','HPOS','TPOS','ANGL','RADI','HEIG',
            'ORI','ARRI','LEAV','ABORE','LBORE','ABOP','LBOP',
            'ITLE OF IL TUB OF CE','DTXR','SPRE']

# Print one example per type
seen = set()
for branch in data:
    for child in branch.get('children', []):
        t = child.get('type')
        if t in types_of_interest and t not in seen:
            seen.add(t)
            a = child.get('attributes', {})
            print(f'=== {t} : {child["name"][:60]} ===')
            for k in geo_keys:
                v = a.get(k)
                if v is not None:
                    print(f'  {k}: {v}')
            print()

print()
print('=== GEOMETRY FIELDS AVAILABILITY PER TYPE ===')
# For each type, which geo fields are present/null/missing?
field_stats = defaultdict(lambda: defaultdict(lambda: {'present':0,'null':0,'missing':0}))
for branch in data:
    for child in branch.get('children', []):
        t = child.get('type')
        if t not in types_of_interest:
            continue
        a = child.get('attributes', {})
        for k in geo_keys:
            if k in a:
                if a[k] is None:
                    field_stats[t][k]['null'] += 1
                else:
                    field_stats[t][k]['present'] += 1
            else:
                field_stats[t][k]['missing'] += 1

# Count total per type
type_counts = defaultdict(int)
for branch in data:
    for child in branch.get('children', []):
        t = child.get('type')
        if t in types_of_interest:
            type_counts[t] += 1

for t in types_of_interest:
    n = type_counts[t]
    print(f'\n{t} (n={n}):')
    for k in geo_keys:
        s = field_stats[t][k]
        p, nu, mi = s['present'], s['null'], s['missing']
        if p + nu + mi > 0:
            status = '✓ always' if p==n else ('✗ always null' if nu==n else ('✗ always missing' if mi==n else f'mix(present={p},null={nu},missing={mi})'))
            print(f'  {k:30s}: {status}')

print()
print('=== ELBO ANGL / RADI distribution ===')
from collections import Counter
angl_c = Counter()
radi_c = Counter()
for branch in data:
    for child in branch.get('children', []):
        if child.get('type') == 'ELBO':
            a = child.get('attributes', {})
            angl_c[a.get('ANGL','MISSING')] += 1
            radi_c[a.get('RADI','MISSING')] += 1
print('ANGL:', dict(angl_c))
print('RADI:', dict(radi_c))

print()
print('=== ITLE OF IL TUB OF CE (centre-to-face dist) per type ===')
for branch in data:
    for child in branch.get('children', []):
        t = child.get('type')
        if t in ['ELBO','FLAN','OLET','TEE','REDU']:
            a = child.get('attributes', {})
            itle = a.get('ITLE OF IL TUB OF CE')
            apos = a.get('APOS')
            lpos = a.get('LPOS')
            if apos and lpos and isinstance(apos, dict) and isinstance(lpos, dict):
                dx = lpos['x']-apos['x']
                dy = lpos['y']-apos['y']
                dz = lpos['z']-apos['z']
                length = (dx**2+dy**2+dz**2)**0.5
                print(f'  {t}: ITLE={itle}, computed APOS->LPOS length={length:.2f}mm')
