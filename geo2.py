import json, sys, math
sys.stdout.reconfigure(encoding='utf-8')
with open(r'F:/CODE-6/Advanced_Analysis/benchmarks/Sjson.json') as f:
    data = json.load(f)

for branch in data:
    for child in branch.get('children',[]):
        t = child.get('type')
        nm = child.get('name','')[:50]
        if t in ['REDU','TEE']:
            a = child.get('attributes',{})
            apos = a.get('APOS',{}); lpos = a.get('LPOS',{})
            dx=lpos['x']-apos['x']; dy=lpos['y']-apos['y']; dz=lpos['z']-apos['z']
            length = math.sqrt(dx**2+dy**2+dz**2)
            print(f'{t}: {nm}')
            print(f'  APOS={apos}')
            print(f'  LPOS={lpos}')
            print(f'  delta=({dx:.3f},{dy:.3f},{dz:.3f}) len={length:.2f}mm')
            print(f'  ABORE={a.get("ABORE")} LBORE={a.get("LBORE")} ITLE={a.get("ITLE OF IL TUB OF CE")}')
            print(f'  ORI={a.get("ORI")} ARRI={a.get("ARRI")} LEAV={a.get("LEAV")}')
            print(f'  CREF={a.get("CREF")}')
            print(f'  DTXR={a.get("DTXR")}')
            print()

print('=== ELBO geometry ===')
for branch in data:
    for child in branch.get('children',[]):
        if child.get('type') == 'ELBO':
            a = child.get('attributes',{})
            apos = a.get('APOS',{}); lpos = a.get('LPOS',{})
            dx=lpos['x']-apos['x']; dy=lpos['y']-apos['y']; dz=lpos['z']-apos['z']
            length = math.sqrt(dx**2+dy**2+dz**2)
            itle = a.get('ITLE OF IL TUB OF CE','?')
            print(f'  ANGL={a.get("ANGL")} RADI={a.get("RADI")} ITLE={itle} chord={length:.2f}mm ORI={a.get("ORI")}')
