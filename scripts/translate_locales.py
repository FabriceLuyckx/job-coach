# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""Dev tool: translate the English UI catalog into the shipped Tier-1 locales.

Diffs frontend/src/locales/en.json against each target locale and translates only
keys missing from the target (so routine releases cost cents, not a full
re-translation), using the configured AI engine. Placeholders like {{name}} and
tags like <b> are preserved verbatim.

The pre-commit hook runs this with --changed: it re-translates keys whose English
text is new OR changed since HEAD, so translations stay in sync automatically and
you never have to run this by hand. --full forces a complete re-translation.

Usage:
    uv run python scripts/translate_locales.py                # all shipped locales, new keys only
    uv run python scripts/translate_locales.py --changed      # new + updated keys (pre-commit hook)
    uv run python scripts/translate_locales.py --lang nl fr   # specific locales
    uv run python scripts/translate_locales.py --lang de --full   # full re-translation
"""

import argparse
import json
import re
import subprocess
from pathlib import Path

from app import config
from app.services.llm import complete, tool_args

REPO_ROOT = Path(__file__).resolve().parent.parent
LOCALES_DIR = REPO_ROOT / "frontend" / "src" / "locales"
EN_PATH = LOCALES_DIR / "en.json"
EN_REL = "frontend/src/locales/en.json"

# Native-name targets; keep in sync with SHIPPED_LOCALES in frontend/src/i18n.ts.
SHIPPED = {
    "nl": "Dutch", "fr": "French", "de": "German", "es": "Spanish",
    "it": "Italian", "pt": "Portuguese", "pl": "Polish",
}

_PLACEHOLDER = re.compile(r"\{\{[^}]+\}\}")
_TAG = re.compile(r"</?[a-zA-Z]+>")
_BATCH = 40

_TOOL = {
    "type": "function",
    "function": {
        "name": "translations",
        "description": "Translated UI strings keyed by their original id",
        "parameters": {
            "type": "object",
            "required": ["items"],
            "properties": {
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "required": ["key", "text"],
                        "properties": {
                            "key": {"type": "string"},
                            "text": {"type": "string"},
                        },
                    },
                }
            },
        },
    },
}


def flatten(obj: dict, prefix: str = "") -> dict[str, str]:
    """Leaves are strings, or string-array items (exploded to `key.0`, `key.1`, …
    and reassembled into a list by unflatten)."""
    out: dict[str, str] = {}
    for k, v in obj.items():
        key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            out.update(flatten(v, key))
        elif isinstance(v, list):
            for i, item in enumerate(v):
                out[f"{key}.{i}"] = item
        else:
            out[key] = v
    return out


def unflatten(flat: dict[str, str]) -> dict:
    root: dict = {}
    for key, val in flat.items():
        parts = key.split(".")
        node = root
        for p in parts[:-1]:
            node = node.setdefault(p, {})
        node[parts[-1]] = val
    return _delistify(root)


def _delistify(node):
    """A dict whose keys are exactly "0".."n-1" is a flattened list — restore it."""
    if not isinstance(node, dict):
        return node
    for k in node:
        node[k] = _delistify(node[k])
    keys = list(node.keys())
    if keys and all(k.isdigit() for k in keys) and set(keys) == {str(i) for i in range(len(keys))}:
        return [node[str(i)] for i in range(len(keys))]
    return node


def _translate_batch(pairs: list[tuple[str, str]], lang_name: str, cfg: dict) -> dict[str, str]:
    listing = json.dumps([{"key": k, "text": v} for k, v in pairs], ensure_ascii=False, indent=2)
    resp = complete(
        [
            {"role": "system", "content":
                f"You translate UI strings for a career/CV web app from English into {lang_name}. "
                "Translate the 'text' of each item naturally and concisely for a software UI. "
                "CRITICAL: preserve every placeholder like {{name}} exactly, and keep HTML-ish tags "
                "such as <b>, <settings>, <link>, <code> unchanged and in place. Do not translate "
                "inside placeholders. Return one item per input key."},
            {"role": "user", "content": listing},
        ],
        tools=[_TOOL],
        tool_choice={"type": "function", "function": {"name": "translations"}},
        cfg=cfg,
        max_tokens=4096,
    )
    args = tool_args(resp, required=("items",))
    out: dict[str, str] = {}
    for i in args.get("items", []):
        if isinstance(i, dict) and i.get("key") and isinstance(i.get("text"), str):
            out[i["key"]] = i["text"]
    return out


def _placeholders_ok(src: str, dst: str) -> bool:
    """Same {{placeholders}} AND same <tags> — models sometimes invent <settings>
    links where the source has none, which then renders as literal markup."""
    return (sorted(_PLACEHOLDER.findall(src)) == sorted(_PLACEHOLDER.findall(dst))
            and sorted(_TAG.findall(src)) == sorted(_TAG.findall(dst)))


def _head_en() -> dict[str, str]:
    """The committed (HEAD) en.json, flattened. Empty when there's no prior
    version (first commit, or the file is new), which makes every key 'changed'."""
    try:
        blob = subprocess.run(
            ["git", "show", f"HEAD:{EN_REL}"],
            capture_output=True, text=True, cwd=REPO_ROOT, check=True,
        ).stdout
        return flatten(json.loads(blob))
    except Exception:
        return {}


def changed_keys(en: dict[str, str], head: dict[str, str]) -> set[str]:
    """Keys whose English text is new or differs from HEAD."""
    return {k for k, v in en.items() if head.get(k) != v}


def translate_locale(lang: str, full: bool, cfg: dict, force: set[str] | None = None) -> None:
    lang_name = SHIPPED[lang]
    en = flatten(json.loads(EN_PATH.read_text()))
    dest_path = LOCALES_DIR / f"{lang}.json"
    existing = flatten(json.loads(dest_path.read_text())) if dest_path.exists() and not full else {}
    force = force or set()

    # Translate keys missing from the target, plus any explicitly forced (changed).
    todo = {k: v for k, v in en.items() if k not in existing or k in force}
    print(f"[{lang}] {len(todo)} keys to translate ({len(en) - len(todo)} reused)")

    result = dict(existing)
    pending = list(todo.items())
    for i in range(0, len(pending), _BATCH):
        batch = pending[i:i + _BATCH]
        out = _translate_batch(batch, lang_name, cfg)
        for k, src in batch:
            dst = out.get(k, "")
            if dst and _placeholders_ok(src, dst):
                result[k] = dst
            else:
                # Retry once on placeholder mismatch, else keep English.
                retry = _translate_batch([(k, src)], lang_name, cfg).get(k, "")
                result[k] = retry if retry and _placeholders_ok(src, retry) else src
                if result[k] == src:
                    print(f"  ! kept English for {k}")
        print(f"  …{min(i + _BATCH, len(pending))}/{len(pending)}")

    # Only keep keys that still exist in English (drop stale ones).
    result = {k: v for k, v in result.items() if k in en}
    dest_path.write_text(json.dumps(unflatten(result), ensure_ascii=False, indent=2) + "\n")
    print(f"[{lang}] wrote {dest_path.relative_to(LOCALES_DIR.parent.parent.parent)}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--lang", nargs="*", choices=list(SHIPPED), help="Locales (default: all shipped)")
    ap.add_argument("--full", action="store_true", help="Re-translate every key, not just new/changed ones")
    ap.add_argument("--changed", action="store_true",
                    help="Translate keys new or changed since HEAD (used by the pre-commit hook)")
    args = ap.parse_args()

    force: set[str] | None = None
    if args.changed:
        en = flatten(json.loads(EN_PATH.read_text()))
        force = changed_keys(en, _head_en())
        if not force:
            print("No new or changed UI strings — nothing to translate.")
            return
        print(f"{len(force)} new/changed key(s) to translate across {len(args.lang or SHIPPED)} locale(s).")

    cfg = config.load()
    try:
        config.require_engine(cfg)
    except ValueError as e:
        raise SystemExit(f"Configure an AI engine first: {e}")

    for lang in (args.lang or list(SHIPPED)):
        translate_locale(lang, args.full, cfg, force)


if __name__ == "__main__":
    main()
