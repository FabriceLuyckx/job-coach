"""On-device UI translation (Tier-2 languages).

Shipped Tier-1 locales are bundled with the frontend. Any other language the user
picks is generated here once by the configured AI engine: the English catalog and
the CV section labels are translated in batches, placeholder-validated, and cached
under DATA_DIR/locales so later loads are instant and offline.
"""

import json
import re
import threading
import time

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import config
from app.i18n.languages import is_valid_code, lang_name
from app.paths import LOCALES_DIR, UI_LOCALES_SRC
from app.services.cv_renderer import LABELS
from app.services.llm import complete, tool_args

router = APIRouter(prefix="/api/i18n", tags=["i18n"])

_PLACEHOLDER = re.compile(r"\{\{[^}]+\}\}")
_BATCH = 40

# In-memory generation status, one per language, mirroring the scan pattern.
_gen: dict[str, dict] = {}
_gen_lock = threading.Lock()

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


def _flatten(obj: dict, prefix: str = "") -> dict[str, str]:
    out: dict[str, str] = {}
    for k, v in obj.items():
        key = f"{prefix}.{k}" if prefix else k
        out.update(_flatten(v, key)) if isinstance(v, dict) else out.update({key: v})
    return out


def _unflatten(flat: dict[str, str]) -> dict:
    root: dict = {}
    for key, val in flat.items():
        parts = key.split(".")
        node = root
        for p in parts[:-1]:
            node = node.setdefault(p, {})
        node[parts[-1]] = val
    return root


def _placeholders_ok(src: str, dst: str) -> bool:
    return sorted(_PLACEHOLDER.findall(src)) == sorted(_PLACEHOLDER.findall(dst))


def _translate_batch(pairs, lang_display, cfg) -> dict[str, str]:
    listing = json.dumps([{"key": k, "text": v} for k, v in pairs], ensure_ascii=False)
    resp = complete(
        [
            {"role": "system", "content":
                f"You translate UI strings for a career/CV web app from English into "
                f"{lang_display}. Translate each item's 'text' naturally and concisely. "
                "Preserve every {{placeholder}} exactly and keep tags like <b>, <settings>, "
                "<link>, <code> unchanged and in place. Return one item per input key."},
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


def _translate_map(source: dict[str, str], lang_display: str, cfg: dict, progress=None) -> dict[str, str]:
    result: dict[str, str] = {}
    items = list(source.items())
    for start in range(0, len(items), _BATCH):
        batch = items[start:start + _BATCH]
        out = _translate_batch(batch, lang_display, cfg)
        for k, src in batch:
            dst = out.get(k, "")
            if dst and _placeholders_ok(src, dst):
                result[k] = dst
            else:
                retry = _translate_batch([(k, src)], lang_display, cfg).get(k, "")
                result[k] = retry if retry and _placeholders_ok(src, retry) else src
        if progress:
            progress(min(start + _BATCH, len(items)), len(items))
    return result


def _run_generation(lang: str) -> None:
    try:
        cfg = config.load()
        config.require_engine(cfg)  # raises if no engine ready
        display = lang_name(lang)

        en_catalog = _flatten(json.loads((UI_LOCALES_SRC / "en.json").read_text(encoding="utf-8")))
        labels = LABELS["en"]
        total = len(en_catalog) + len(labels)

        def progress(done_ui):
            with _gen_lock:
                _gen[lang].update({"current": done_ui, "total": total})

        # UI catalog.
        translated = _translate_map(en_catalog, display, cfg,
                                    progress=lambda d, _t: progress(d))
        LOCALES_DIR.mkdir(parents=True, exist_ok=True)
        (LOCALES_DIR / f"{lang}.json").write_text(
            json.dumps(_unflatten(translated), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

        # CV section labels (small, one batch).
        label_tr = _translate_map(labels, display, cfg)
        (LOCALES_DIR / f"cv_labels.{lang}.json").write_text(
            json.dumps(label_tr, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

        with _gen_lock:
            _gen[lang].update({"status": "done", "current": total, "total": total})
    except Exception as e:
        with _gen_lock:
            _gen[lang].update({"status": "error", "error": str(e)})


class GenerateRequest(BaseModel):
    lang: str


@router.post("/generate")
def generate(body: GenerateRequest):
    lang = re.sub(r"[^a-z]", "", (body.lang or "").lower())[:2]
    if not is_valid_code(lang) or lang == "en":
        raise HTTPException(400, "Provide a valid non-English 2-letter language code.")
    try:
        config.require_engine()
    except ValueError as e:
        raise HTTPException(400, str(e))
    with _gen_lock:
        if _gen.get(lang, {}).get("status") == "running":
            return {"lang": lang, "status": "running"}
        _gen[lang] = {"status": "running", "current": 0, "total": 0, "created": time.time()}
    threading.Thread(target=_run_generation, args=(lang,), daemon=True).start()
    return {"lang": lang, "status": "running"}


@router.get("/generate/status/{lang}")
def generate_status(lang: str):
    with _gen_lock:
        s = _gen.get(lang)
    if not s:
        return {"status": "idle"}
    return s


@router.get("/{lang}")
def get_locale(lang: str):
    """Serve a locale catalog: shipped (bundled) wins, else on-device generated."""
    lang = re.sub(r"[^a-z]", "", (lang or "").lower())[:2]
    shipped = UI_LOCALES_SRC / f"{lang}.json"
    if shipped.exists():
        return json.loads(shipped.read_text(encoding="utf-8"))
    generated = LOCALES_DIR / f"{lang}.json"
    if generated.exists():
        return json.loads(generated.read_text(encoding="utf-8"))
    raise HTTPException(404, "Locale not available")
