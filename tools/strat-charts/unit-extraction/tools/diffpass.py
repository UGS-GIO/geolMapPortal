"""Compare independent transcriptions of the same chart, field by field.

Units are matched on `seq` after checking the counts agree. If the counts
differ the passes disagree about how many units exist, which is a structural
disagreement and is reported separately - matching by position after that point
would compare unrelated rows and manufacture a misleading error rate.
"""
import json, sys, re, unicodedata
from collections import defaultdict

FIELDS = ["row","period","parent_unit","unit_name","thickness_text","notes"]

def norm(v):
    if v is None: return ""
    s = unicodedata.normalize("NFKD", str(v))
    s = s.replace("–","-").replace("—","-").replace("’","'")
    s = s.replace("“",'"').replace("”",'"')
    s = re.sub(r"\s+"," ", s).strip().rstrip(".").lower()
    return s

def load(p):
    d = json.load(open(p))
    return d, {u["seq"]: u for u in d["units"]}

def compare(paths, chart):
    passes = []
    for p in paths:
        try: passes.append((p, load(p)))
        except FileNotFoundError: pass
    if len(passes) < 2:
        print(f"chart {chart}: fewer than two passes present, cannot measure"); return None
    counts = {p:(len(d["units"])) for p,(d,_) in passes}
    print(f"\n=== chart {chart} ===")
    for p,(d,_) in passes: print(f"  {p.split('/')[-1]:18s} {len(d['units'])} units")
    if len(set(counts.values())) > 1:
        print("  STRUCTURAL DISAGREEMENT on unit count -> field agreement not comparable")
    n = min(counts.values())
    stats = defaultdict(lambda: [0,0])       # field -> [agree, total]
    diffs = []
    for seq in range(1, n+1):
        for f in FIELDS:
            vals = [norm(by.get(seq,{}).get(f,"")) for _,(_,by) in passes]
            stats[f][1] += 1
            if len(set(vals)) == 1:
                stats[f][0] += 1
            else:
                diffs.append((seq, f, vals))
    tot_a = sum(v[0] for v in stats.values()); tot_t = sum(v[1] for v in stats.values())
    print(f"  cell agreement: {tot_a}/{tot_t} = {100*tot_a/tot_t:.2f}%")
    for f in FIELDS:
        a,t = stats[f]
        print(f"    {f:16s} {a:4d}/{t:<4d} {100*a/t:6.2f}%")
    if diffs:
        print(f"  {len(diffs)} disagreeing cells:")
        for seq,f,vals in diffs[:24]:
            print(f"    seq {seq:3d} {f:14s} " + " | ".join(f"{v[:44]!r}" for v in vals))
        if len(diffs) > 24: print(f"    ... {len(diffs)-24} more")
    return tot_a, tot_t

if __name__ == "__main__":
    import glob
    charts = sys.argv[1:] or ["034","105"]
    grand = [0,0]
    for c in charts:
        r = compare(sorted(glob.glob(f"pass*_{c}.json")), c)
        if r: grand[0]+=r[0]; grand[1]+=r[1]
    if grand[1]:
        print(f"\n=== OVERALL: {grand[0]}/{grand[1]} = {100*grand[0]/grand[1]:.2f}% cell agreement ===")
