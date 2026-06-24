#!/usr/bin/env python3
"""Parse the free-text الأمثلة cell into structured example blocks.

A cell is a sequence of condition blocks separated by ' - '. Each block carries
an optional condition label (text ending in ':'), a list of "مفرد جمع" example
pairs separated by '،', and optional inline 'وشذ' (irregular) sub-blocks and
parenthetical notes. Parentheses may themselves contain ':' and '،', so they are
protected before any splitting.

Output per cell: list of blocks, each:
    {"شرط": <label str>, "شاذ": <bool>, "أزواج": [[مفرد, جمع], ...], "ملاحظة": <prose str>}
"""
import re

PLACE = ""  # private-use sentinel for protected parentheticals


def protect(text):
    notes = []

    def grab(m):
        notes.append(m.group(0))  # keep the parens
        return PLACE + str(len(notes) - 1) + PLACE

    return re.sub(r"\([^)]*\)", grab, text), notes


def restore(text, notes):
    return re.sub(PLACE + r"(\d+)" + PLACE, lambda m: notes[int(m.group(1))], text)


def split_pairs(region, notes):
    """Split a pairs region into (pairs, trailing_prose)."""
    pairs, prose = [], ""
    items = [x.strip() for x in region.split("،")]
    for i, item in enumerate(items):
        if not item:
            continue
        # the last item may carry trailing prose after the final '...'
        is_last = i == len(items) - 1
        if is_last and "..." in item:
            head, _, tail = item.rpartition("...")
            item = head.strip()
            tail = tail.strip()
            if tail:
                prose = restore(tail, notes)
            if not item:
                continue
        item = item.replace("...", "").strip()
        item = restore(item, notes).strip()
        if not item:
            continue
        toks = item.split()
        if len(toks) == 1:
            # not a real pair — treat as prose fragment
            prose = (prose + " " + item).strip()
            continue
        pairs.append([toks[0], " ".join(toks[1:])])
    return pairs, prose


def label_and_reason(raw):
    """Turn a raw colon-label into (text, is_irregular)."""
    raw = raw.strip(" -").strip()
    irregular = raw.startswith("وشذ") or raw.startswith("شذ")
    if irregular:
        rest = raw[raw.find("شذ") + 2:].strip()
        return rest, True  # rest is e.g. "(لأنه أجوف)" or ""
    return raw, False


def parse(text):
    if not text or not text.strip():
        return []
    prot, notes = protect(text.strip())
    blocks = []
    # top-level conditions are separated by ' - ' (and an optional leading '- ')
    segments = re.split(r"\s+-\s+", prot.lstrip("- ").strip())
    for seg in segments:
        seg = seg.strip()
        if not seg:
            continue
        parts = seg.split(":")
        # parts[0] = label for the region in parts[1]; the tail of each region is
        # the label for the next region.
        cur_label = parts[0].strip() if len(parts) > 1 else ""
        if len(parts) == 1:
            # no colon → plain pairs, no condition
            pairs, prose = split_pairs(parts[0], notes)
            blocks.append(_mk("", False, pairs, prose))
            continue
        for k in range(1, len(parts)):
            region = parts[k]
            if k < len(parts) - 1:
                # region = pairs ... <next_label>; the next label is the tail
                # after the last '...' (labels here always follow an ellipsis).
                cut = region.rfind("...")
                if cut == -1:
                    cut = region.rfind("،")
                pairs_text = region[: cut + 3] if "..." in region else region[: cut + 1] if cut != -1 else region
                next_label = region[cut + 3:] if "..." in region else region[cut + 1:] if cut != -1 else ""
            else:
                pairs_text, next_label = region, ""
            label, irregular = label_and_reason(cur_label)
            pairs, prose = split_pairs(pairs_text, notes)
            label = restore(label, notes).strip()
            if label.startswith("(") and label.endswith(")"):
                label = label[1:-1].strip()  # unwrap a reason like (لأنه أجوف)
            if pairs or prose or label or irregular:
                blocks.append(_mk(label, irregular, pairs, prose))
            cur_label = next_label
    return blocks


def _mk(label, irregular, pairs, prose):
    b = {"شرط": label.strip(), "شاذ": irregular, "أزواج": pairs}
    if prose.strip():
        b["ملاحظة"] = prose.strip()
    return b


if __name__ == "__main__":
    import json
    import os
    ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    d = json.load(open(os.path.join(ROOT, "data", "json", "جموع التكسير.json")))
    total_pairs = anomalies = blocks_n = prose_n = 0
    samples = []
    for r in d:
        bl = parse(r["الأمثلة"])
        blocks_n += len(bl)
        for b in bl:
            if b.get("ملاحظة"):
                prose_n += 1
            for p in b["أزواج"]:
                total_pairs += 1
                # an anomaly = a "pair" whose singular looks too long (likely prose)
                if len(p[0]) > 12 or not p[1]:
                    anomalies += 1
                    if len(samples) < 25:
                        samples.append((r["المفرد"] + "→" + r["الجمع"], p))
    print(f"rows: {len(d)}  blocks: {blocks_n}  pairs: {total_pairs}")
    print(f"prose notes: {prose_n}  anomalous pairs: {anomalies}")
    for s in samples:
        print("  ANOMALY", s)
    # show a few fully-parsed examples
    print("\n--- sample parses ---")
    for want in ["أَفْعَل", "فَعْل", "فاعِل"]:
        for r in d:
            if r["المفرد"] == want and ("إذا" in r["الأمثلة"] or "وشذ" in r["الأمثلة"]):
                print(f"\n[{r['المفرد']}→{r['الجمع']}] {r['الأمثلة']}")
                print(json.dumps(parse(r["الأمثلة"]), ensure_ascii=False, indent=2))
                break
