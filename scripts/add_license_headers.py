#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""Insert an SPDX AGPL header into source files that don't have one yet.

Usage: add_license_headers.py FILE [FILE ...]
Run by scripts/hooks/pre-commit on staged files; also used for the one-time
tree-wide backfill. Always exits 0 - a missing header is never a commit blocker.
"""

import sys
from pathlib import Path

COMMENT_PREFIX = {
    ".py": "#",
    ".sh": "#",
    ".ts": "//",
    ".tsx": "//",
}

EXCLUDED_PREFIXES = (
    "frontend/src/locales/",
    "frontend/dist/",
    "node_modules/",
    "output/",
    "models/",
    ".venv/",
)

SPDX_LINE = "SPDX-License-Identifier: AGPL-3.0-or-later"
COPYRIGHT_LINE = "Copyright (C) 2026 Fabrice Luyckx"


def add_header(path: Path) -> bool:
    prefix = COMMENT_PREFIX.get(path.suffix)
    if prefix is None:
        return False
    # ponytail: prefix match assumes a repo-relative path. True for both real
    # callers (the hook's `git diff` output, the backfill's `git ls-files`
    # output) — an absolute path bypasses exclusion, fine until a third caller
    # needs it.
    posix_path = path.as_posix()
    if any(posix_path.startswith(excluded) for excluded in EXCLUDED_PREFIXES):
        return False

    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return False

    lines = text.splitlines(keepends=True)
    if any(SPDX_LINE in line for line in lines[:5]):
        return False

    insert_at = 0
    if lines and lines[0].startswith("#!"):
        if not lines[0].endswith("\n"):
            lines[0] += "\n"
        insert_at = 1
    header = f"{prefix} {SPDX_LINE}\n{prefix} {COPYRIGHT_LINE}\n\n"
    lines.insert(insert_at, header)
    path.write_text("".join(lines), encoding="utf-8")
    return True


def main(argv: list[str]) -> int:
    for arg in argv:
        path = Path(arg)
        if path.is_file() and add_header(path):
            print(arg)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
