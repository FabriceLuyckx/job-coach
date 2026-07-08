"""Dev tool: translate the English UI catalog into the shipped Tier-1 locales.

Diffs frontend/src/locales/en.json against each target locale and translates only
keys missing from the target (so routine releases cost cents, not a full
re-translation), using the configured AI engine. A key whose English *text*
changed keeps its old translation — use --full (or delete the key from the
target locale) to refresh it. Placeholders like {{name}} and tags like <b> are
preserved verbatim.

Usage:
    uv run python scripts/translate_locales.py                # all shipped locales, new keys only
    uv run python scripts/translate_locales.py --lang nl fr   # specific locales
    uv run python scripts/translate_locales.py --lang de --full   # full re-translation
"""

import argparse
import json
import re
from pathlib import Path

from app import config
from app.services.llm import complete, tool_args

LOCALES_DIR = Path(__file__).resolve().parent.parent / "frontend" / "src" / "locales"
EN_PATH = LOCALES_DIR / "en.json"

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
    out: dict[str, str] = {}
    for k, v in obj.items():
        key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            out.update(flatten(v, key))
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
    return root


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


def translate_locale(lang: str, full: bool, cfg: dict) -> None:
    lang_name = SHIPPED[lang]
    en = flatten(json.loads(EN_PATH.read_text()))
    dest_path = LOCALES_DIR / f"{lang}.json"
    existing = flatten(json.loads(dest_path.read_text())) if dest_path.exists() and not full else {}

    todo = {k: v for k, v in en.items() if k not in existing}
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
    args = ap.parse_args()

    cfg = config.load()
    try:
        config.require_engine(cfg)
    except ValueError as e:
        raise SystemExit(f"Configure an AI engine first: {e}")

    for lang in (args.lang or list(SHIPPED)):
        translate_locale(lang, args.full, cfg)


if __name__ == "__main__":
    main()
