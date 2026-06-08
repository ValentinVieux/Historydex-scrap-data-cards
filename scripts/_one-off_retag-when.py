"""One-off script: applies the WHEN mechanic refactor to data/approved.

Cf. plan: brainstormons-tous-les-deux-structured-floyd.md (2026-05-11).

Two operations:
1) Re-tag 13 short-span (<=10 years) periodique cards to ponctuelle.
2) Rewrite "Sur quelle periode" -> "Vers quelle periode" on the remaining
   periodique cards' whenPrompt.pre.

Output format mirrors save-card.ts: indent=2, no ASCII escaping, trailing newline.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APPROVED = ROOT / "data" / "approved"

JUSTIFICATION_TAIL = (
    " Re-tague ponctuelle car span <= 10 ans (politique du 2026-05-11) ; "
    "bornes reelles preservees dans timeDisplayLabel."
)

# Per-card spec for re-tagging. Keyed by slug (file basename without .json).
# Each value gives the new pivotYear, whenDelta, and whenPrompt fields.
RETAG_SPEC: dict[str, dict] = {
    "genocide-tutsis-rwanda": {
        "pivot": 1994,
        "delta": 5,
        "pre": "Quand a été ",
        "verb": "commis",
        "post": " ce génocide ?",
    },
    "holodomor-famine-ukrainienne": {
        "pivot": 1933,
        "delta": 5,
        "pre": "Quand est ",
        "verb": "survenue",
        "post": " cette famine ?",
    },
    "longue-marche-mao": {
        "pivot": 1935,
        "delta": 5,
        "pre": "Quand a été ",
        "verb": "menée",
        "post": " cette marche ?",
    },
    "bataille-de-stalingrad": {
        "pivot": 1943,
        "delta": 5,
        "pre": "Quand s'est ",
        "verb": "déroulée",
        "post": " cette bataille ?",
    },
    "conquete-du-mexique-cortes": {
        "pivot": 1521,
        "delta": 5,
        "pre": "Quand s'est ",
        "verb": "déroulée",
        "post": " cette conquête ?",
    },
    "premiere-croisade": {
        "pivot": 1099,
        "delta": 5,
        "pre": "Quand s'est ",
        "verb": "déroulée",
        "post": " cette croisade ?",
    },
    "premier-voyage-james-cook": {
        "pivot": 1770,
        "delta": 5,
        "pre": "Quand a été ",
        "verb": "menée",
        "post": " cette expédition ?",
    },
    "grande-vague-de-hokusai": {
        "pivot": 1831,
        "delta": 5,
        "pre": "Quand a été ",
        "verb": "créée",
        "post": " cette œuvre ?",
    },
    "premiere-guerre-mondiale": {
        "pivot": 1916,
        "delta": 5,
        "pre": "Quand s'est ",
        "verb": "déroulée",
        "post": " cette guerre ?",
    },
    "peste-noire-en-europe": {
        "pivot": 1348,
        "delta": 5,
        "pre": "Quand est ",
        "verb": "survenue",
        "post": " cette pandémie ?",
    },
    "genocide-armenien": {
        "pivot": 1915,
        "delta": 10,
        "pre": "Quand a été ",
        "verb": "commis",
        "post": " ce génocide ?",
    },
    "construction-kremlin-moscou": {
        "pivot": 1490,
        "delta": 10,
        "pre": "Quand a été ",
        "verb": "bâtie",
        "post": " cette muraille ?",
    },
    "canal-de-suez": {
        "pivot": 1869,
        "delta": 10,
        "pre": "Quand a été ",
        "verb": "creusé",
        "post": " ce canal ?",
    },
}


def write_card(path: Path, card: dict) -> None:
    # Bump contentVersion to track the change (mirrors save-card.ts).
    ed = card.get("editorial")
    if isinstance(ed, dict) and isinstance(ed.get("contentVersion"), int):
        ed["contentVersion"] += 1
    body = json.dumps(card, indent=2, ensure_ascii=False) + "\n"
    path.write_text(body, encoding="utf-8")


def retag_to_ponctuelle(card: dict, spec: dict) -> tuple[bool, str]:
    t = card["canonical"]["time"]
    fr = card["display"]["locales"]["fr"]
    changed = False

    if t["tag"] != "ponctuelle":
        t["tag"] = "ponctuelle"
        changed = True
    if t.get("startYear") is not None:
        t["startYear"] = None
        changed = True
    if t.get("endYear") is not None:
        t["endYear"] = None
        changed = True
    if t.get("pivotYear") != spec["pivot"]:
        t["pivotYear"] = spec["pivot"]
        changed = True
    if not t.get("justification", "").endswith(JUSTIFICATION_TAIL.strip()):
        t["justification"] = t.get("justification", "") + JUSTIFICATION_TAIL
        changed = True

    wp = fr["whenPrompt"]
    for k, v in (("pre", spec["pre"]), ("verb", spec["verb"]), ("post", spec["post"])):
        if wp.get(k) != v:
            wp[k] = v
            changed = True

    gp = card["gameplay"]
    if gp.get("whenDelta") != spec["delta"]:
        gp["whenDelta"] = spec["delta"]
        changed = True

    return changed, f"retag→ponctuelle pivot={spec['pivot']} Δ={spec['delta']}"


def rewrite_sur_to_vers(card: dict) -> tuple[bool, str]:
    fr = card["display"]["locales"]["fr"]
    wp = fr["whenPrompt"]
    pre = wp.get("pre", "")
    new_pre = pre.replace("Sur quelle période", "Vers quelle période")
    if new_pre == pre:
        return False, "no-op (no 'Sur quelle période' found)"
    wp["pre"] = new_pre
    return True, f"pre: {pre!r} → {new_pre!r}"


def main() -> int:
    if not APPROVED.is_dir():
        print(f"ERROR: {APPROVED} does not exist", file=sys.stderr)
        return 1

    files = sorted(p for p in APPROVED.iterdir() if p.suffix == ".json")
    retag_done: list[str] = []
    rewrite_done: list[str] = []
    untouched: list[str] = []

    for path in files:
        slug = path.stem
        card = json.loads(path.read_text(encoding="utf-8"))
        t = card["canonical"]["time"]

        if slug in RETAG_SPEC:
            # Sanity: must be currently periodique.
            if t["tag"] != "periodique":
                print(f"WARN  {slug}: expected tag=periodique, got {t['tag']!r} (skipping retag)")
                untouched.append(slug)
                continue
            changed, note = retag_to_ponctuelle(card, RETAG_SPEC[slug])
            if changed:
                write_card(path, card)
                retag_done.append(f"{slug}: {note}")
            else:
                untouched.append(slug)
            continue

        if t["tag"] != "periodique":
            untouched.append(slug)
            continue

        # Remaining periodique cards: rewrite "Sur" -> "Vers" in whenPrompt.pre.
        changed, note = rewrite_sur_to_vers(card)
        if changed:
            write_card(path, card)
            rewrite_done.append(f"{slug}: {note}")
        else:
            untouched.append(slug)

    print()
    print(f"=== Re-tagged to ponctuelle ({len(retag_done)}/13) ===")
    for line in retag_done:
        print(f"  • {line}")
    print()
    print(f"=== whenPrompt rewritten Sur→Vers ({len(rewrite_done)}/38) ===")
    for line in rewrite_done:
        print(f"  • {line}")
    print()
    print(f"Total touched: {len(retag_done) + len(rewrite_done)} files")
    return 0


if __name__ == "__main__":
    sys.exit(main())
