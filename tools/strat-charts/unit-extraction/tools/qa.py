"""Automated checks over the extracted unit rows.

None of these prove a transcription is right. They flag rows worth a human
look, which is the only honest thing an automated check can do here.
"""
import glob, json, re, os, unicodedata
from collections import Counter, defaultdict

# youngest -> oldest. Only used to flag ORDER violations, never to correct one.
SCALE = ["Q","QUATERNARY","PLIO","PLIOCENE","MIOCENE","OLIGOCENE","EOCENE","PALEOCENE",
         "TERTIARY","CRET","CRETACEOUS","JURASSIC","TRIASSIC","TR","PERMIAN","P",
         "PENN","PENNSYLVANIAN","IP","MISS","MISSISSIPPIAN","DEVONIAN","D","SILURIAN","S",
         "ORDOVICIAN","O","CAMBRIAN","CAMB","NEOPROTEROZOIC","PROTEROZOIC","PC","PЄ",
         "PP","ARCHEAN"]
RANK = {p:i for i,p in enumerate(SCALE)}

def norm(s):
    s = unicodedata.normalize("NFKD", str(s or ""))
    return re.sub(r"\s+"," ", s).strip()

def key(s):
    return re.sub(r"[^a-z0-9]","", norm(s).lower())

def parse_thick(t):
    t = norm(t).replace(",","")
    nums = [int(x) for x in re.findall(r"\d+", t)]
    if not nums: return (None, None)
    return (min(nums), max(nums))

charts, units = {}, []
for f in sorted(glob.glob("pass1_*.json")):
    d = json.load(open(f))
    charts[d["chart_id"]] = d
    for u in d["units"]:
        u["_chart"] = d["chart_id"]; units.append(u)

print(f"charts {len(charts)}   units {len(units)}\n")

# 1. period order
viol = []
for cid, d in charts.items():
    last = -1; lastp = None
    for u in d["units"]:
        p = norm(u.get("period","")).upper()
        r = RANK.get(p)
        if r is None: continue
        if r < last:
            viol.append((cid, u.get("seq"), lastp, p))
        last = max(last, r); lastp = p
print(f"[1] period-order violations: {len(viol)}")
for v in viol[:10]: print(f"      chart {v[0]:>3} seq {v[1]:>3}: {v[2]} -> {v[3]}")

# 2. thickness sanity
badt = [(u["_chart"],u.get("seq"),u.get("thickness_text"))
        for u in units
        if (lambda mn,mx: mn is not None and (mn>mx or mx>60000))(*parse_thick(u.get("thickness_text","")))]
print(f"\n[2] thickness out of range or min>max: {len(badt)}")
for b in badt[:8]: print(f"      chart {b[0]:>3} seq {b[1]:>3}: {b[2]!r}")

# 3. cross-chart lexicon
names = Counter(key(u.get("unit_name")) for u in units if not u.get("is_banner"))
disp  = {}
for u in units:
    k = key(u.get("unit_name"))
    disp.setdefault(k, norm(u.get("unit_name")))
single = [k for k,c in names.items() if c==1 and len(k)>3]
print(f"\n[3] distinct unit names: {len(names)}   appearing once: {len(single)}")

def near(a,b):
    if abs(len(a)-len(b))>3: return False
    if a in b or b in a: return True
    d=sum(1 for x,y in zip(a,b) if x!=y)+abs(len(a)-len(b))
    return d<=2
pairs=[]
keys=[k for k,c in names.items() if len(k)>5]
for i,a in enumerate(keys):
    for b in keys[i+1:]:
        if a!=b and near(a,b): pairs.append((disp[a],names[a],disp[b],names[b]))
print(f"    near-duplicate name pairs: {len(pairs)}")
for p in sorted(pairs, key=lambda x:-(x[1]+x[3]))[:12]:
    print(f"      {p[0]!r} x{p[1]}  ~  {p[2]!r} x{p[3]}")

# 4. most common formations - a smoke test that the corpus looks like Utah geology
print("\n[4] most frequent units across charts:")
top = Counter(norm(u.get("unit_name")) for u in units if not u.get("is_banner")).most_common(14)
for n,c in top: print(f"      {c:3d}  {n}")
