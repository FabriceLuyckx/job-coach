# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""commit-msg hook matcher. Run with: uv run pytest"""

import subprocess
from pathlib import Path

HOOK = Path(__file__).resolve().parents[1] / "scripts" / "hooks" / "commit-msg"


def _warns(subject: str, tmp_path) -> bool:
    msg = tmp_path / "COMMIT_EDITMSG"
    msg.write_text(subject + "\n")
    r = subprocess.run([str(HOOK), str(msg)], capture_output=True, text=True)
    assert r.returncode == 0  # never blocks
    return "Non-conventional" in r.stderr


def test_conventional_subjects_pass(tmp_path):
    for ok in ["feat: add X", "fix!: drop Y", "chore(deps): bump", "Merge branch 'x'"]:
        assert not _warns(ok, tmp_path), ok


def test_non_conventional_warns(tmp_path):
    for bad in ["random subject", "Add a thing", "feat add X"]:
        assert _warns(bad, tmp_path), bad
