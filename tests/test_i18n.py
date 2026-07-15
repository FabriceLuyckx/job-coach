# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""i18n guards: translation validation, CV-label completeness, and shipped-catalog
parity (keys, {{placeholders}}, <tags>) against the English source."""

import json
from pathlib import Path

from app.api.i18n import _placeholders_ok
from app.services.cv_renderer import LABELS

ROOT = Path(__file__).resolve().parent.parent
LOCALES = ROOT / "frontend" / "src" / "locales"
SHIPPED = ("nl", "fr", "de", "es", "it", "pt", "pl")


def _flat(obj: dict, prefix: str = "") -> dict[str, str]:
    out: dict[str, str] = {}
    for k, v in obj.items():
        key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            out.update(_flat(v, key))
        else:
            out[key] = v
    return out


def test_placeholder_and_tag_validation():
    assert _placeholders_ok("Hello {{name}}", "Hallo {{name}}")
    assert not _placeholders_ok("Hello {{name}}", "Hallo {{naam}}")
    # Invented tags must be rejected — with plain t() they render as literal markup.
    assert not _placeholders_ok("Go to Settings.", "Ga naar <settings>Instellingen</settings>.")
    assert _placeholders_ok("Go to <settings>Settings</settings>.",
                            "Ga naar <settings>Instellingen</settings>.")


def test_cv_labels_cover_all_shipped_languages():
    en_keys = set(LABELS["en"])
    for lang in ("en",) + SHIPPED:
        assert set(LABELS.get(lang, {})) == en_keys, f"cv_labels.json incomplete for '{lang}'"


def test_shipped_catalogs_match_english_keys_and_markup():
    en = _flat(json.loads((LOCALES / "en.json").read_text(encoding="utf-8")))
    for loc in SHIPPED:
        cat = _flat(json.loads((LOCALES / f"{loc}.json").read_text(encoding="utf-8")))
        assert set(cat) == set(en), f"{loc}: key set differs from en.json"
        bad = [k for k in en if not _placeholders_ok(en[k], cat[k])]
        assert not bad, f"{loc}: placeholder/tag mismatch in {bad[:5]}"
