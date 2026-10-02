#!/usr/bin/env python3
"""
Generate Round 2 JSON from a CSV export of the Responses tab.

Usage:
    python generate_round2.py responses.csv data.json round2-data.json [minimum_n]

Consensus:
    >=80% scores 4-5 -> Include
    >=80% scores 1-2 -> Exclude
    Otherwise -> Round 2
    No consensus label is applied unless minimum_n complete procedure respondents exist.
"""
import csv, json, sys, statistics
from collections import defaultdict

if len(sys.argv) not in (4,5):
    raise SystemExit("Usage: python generate_round2.py responses.csv data.json round2-data.json [minimum_n]")

responses_csv, round1_json, output_json = sys.argv[1:4]
minimum_n = int(sys.argv[4]) if len(sys.argv)==5 else 3

with open(round1_json, encoding="utf-8") as f:
    source = json.load(f)

# Count unique consultant responses per item. Since each procedure must be fully
# completed before submission, item-level N corresponds to completed procedure N.
scores_by_item = defaultdict(dict)

with open(responses_csv, newline="", encoding="utf-8-sig") as f:
    for row in csv.DictReader(f):
        if str(row.get("round","")).strip() != "1":
            continue
        cid = (row.get("consultant_id") or "").strip()
        item_id = (row.get("item_id") or "").strip()
        if not cid or not item_id:
            continue
        try:
            score = int(float(row["score"]))
        except:
            continue
        scores_by_item[item_id][cid] = score  # last submission wins for duplicate consultant/item

out_items = []
summary = []

for item in source["items"]:
    scores = list(scores_by_item.get(item["id"], {}).values())
    n = len(scores)
    include_pct = sum(s >= 4 for s in scores)/n if n else None
    exclude_pct = sum(s <= 2 for s in scores)/n if n else None
    med = statistics.median(scores) if scores else None

    if n < minimum_n:
        status = "Insufficient responses"
    elif include_pct >= 0.80:
        status = "Include"
    elif exclude_pct >= 0.80:
        status = "Exclude"
    else:
        status = "Round 2"

    summary.append({
        "item_id": item["id"], "procedure": item["procedure"], "risk": item["risk"],
        "responses": n, "include_pct": include_pct, "exclude_pct": exclude_pct,
        "median": med, "status": status
    })

    if status in ("Round 2","Insufficient responses"):
        x = dict(item)
        x["round1_summary"] = summary[-1]
        out_items.append(x)

procedures = []
for x in out_items:
    if x["procedure"] not in procedures:
        procedures.append(x["procedure"])

out = {
  "project": dict(source["project"], round=2, minimum_responses_for_consensus=minimum_n),
  "procedures": procedures,
  "items": out_items,
  "round1_summary": summary
}
with open(output_json, "w", encoding="utf-8") as f:
    json.dump(out, f, indent=2, ensure_ascii=False)

print(f"Round 2 / insufficient-response items: {len(out_items)}")
