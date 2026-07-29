# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""A scan/re-check already in flight is re-attached to, never duplicated.

The page keeps its scan id only in memory, so a hard refresh mid-scan loses it
while the server keeps running. Without the guard the next click starts a second
concurrent job — and since the local engine serialises all AI behind one lock,
two scans just take turns and double the cost. Run with: uv run pytest
"""

import threading
import time

import pytest

from app.api import jobs


def _reset():
    with jobs._scans_lock:
        jobs._scans.clear()


def _noop(scan_id: str) -> None:
    """Stand-in worker: the guard is about bookkeeping, not scanning."""


def test_starts_a_job_when_none_running():
    _reset()
    r = jobs._start_or_attach("scan", _noop)
    assert r["already_running"] is False
    assert r["kind"] == "scan"
    assert r["scan_id"] in jobs._scans


def test_second_start_attaches_instead_of_duplicating():
    _reset()
    first = jobs._start_or_attach("scan", _noop)
    with jobs._scans_lock:  # the worker is a no-op, so pin the state it would set
        jobs._scans[first["scan_id"]]["status"] = "running"

    second = jobs._start_or_attach("scan", _noop)
    assert second["already_running"] is True
    assert second["scan_id"] == first["scan_id"]
    assert len(jobs._scans) == 1, "a second concurrent scan was created"


def test_recheck_attaches_to_a_running_scan_and_reports_its_real_kind():
    """The client polls whatever came back, so it must be told what it actually
    is — otherwise a re-attached scan is labelled with the button that was
    clicked and reports the wrong completion message."""
    _reset()
    first = jobs._start_or_attach("scan", _noop)
    with jobs._scans_lock:
        jobs._scans[first["scan_id"]]["status"] = "running"

    r = jobs._start_or_attach("recheck", _noop)
    assert r["already_running"] is True
    assert r["kind"] == "scan", "re-attached job must report the running kind"


def test_finished_job_does_not_block_a_new_one():
    _reset()
    first = jobs._start_or_attach("scan", _noop)
    with jobs._scans_lock:
        jobs._scans[first["scan_id"]]["status"] = "done"

    second = jobs._start_or_attach("scan", _noop)
    assert second["already_running"] is False
    assert second["scan_id"] != first["scan_id"]


def test_concurrent_starts_yield_one_job():
    """The guard reads and writes under one lock, so a race can't slip a second
    job through."""
    _reset()
    results = []

    def go():
        results.append(jobs._start_or_attach("scan", _noop))

    threads = [threading.Thread(target=go) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    started = [r for r in results if not r["already_running"]]
    assert len(started) == 1, f"expected exactly one real start, got {len(started)}"
    assert len({r["scan_id"] for r in results}) == 1


@pytest.mark.parametrize("worker", [jobs._run_scan, jobs._run_recheck])
def test_broken_engine_fails_the_run_once_not_per_source(monkeypatch, worker):
    """A dead AI engine must fail the run with the engine's own message — never
    be misattributed as N per-source 'the page couldn't be read' errors."""
    _reset()

    def broken_engine(cfg=None):
        raise ValueError("Local AI model not downloaded yet — finish setup in Settings.")

    monkeypatch.setattr(jobs.config, "require_engine", broken_engine)
    scan_id = "engine-test"
    with jobs._scans_lock:
        jobs._scans[scan_id] = {"status": "pending", "created": time.time(),
                                "kind": "scan", "cancel": threading.Event()}
    worker(scan_id)

    s = jobs._scans[scan_id]
    assert s["status"] == "error"
    assert s["error"] == "Local AI model not downloaded yet — finish setup in Settings."
    assert not s.get("errors"), "engine failure must not produce per-source errors"
