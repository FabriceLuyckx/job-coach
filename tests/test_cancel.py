# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""Async-job cancellation: a running job that observes its cancel token and
raises GenerationCancelled surfaces as a 'cancelled' job, and status stays
JSON-serialisable (no Event leaks). Run with: uv run pytest"""

import threading
import time

from fastapi.testclient import TestClient

from app.api import cv
from app.main import app
from app.services.llm import GenerationCancelled, current_cancel

client = TestClient(app)


def _wait(pred, timeout=3.0):
    end = time.time() + timeout
    while time.time() < end:
        if pred():
            return True
        time.sleep(0.01)
    return False


def test_cancel_marks_job_cancelled_and_status_serialises():
    started = threading.Event()

    def work(set_stage):
        started.set()
        ev = current_cancel.get()  # set by run_async's worker on this thread
        assert ev is not None, "worker should publish a cancel token"
        while not ev.is_set():     # stand in for a slow local generation
            time.sleep(0.01)
        raise GenerationCancelled()

    job_id = cv.run_async(work)
    assert started.wait(2)

    # status must be JSON-serialisable (the cancel Event is stripped)
    r = client.get(f"/api/cv/status/{job_id}")
    assert r.status_code == 200 and "cancel" not in r.json()

    # cancel via the endpoint → job ends as 'cancelled', not 'error'
    assert client.post(f"/api/cv/cancel/{job_id}").json() == {"ok": True}
    assert _wait(lambda: cv._jobs[job_id]["status"] == "cancelled")


def test_cancel_unknown_job_404():
    assert client.post("/api/cv/cancel/nope").status_code == 404


def test_local_stream_interrupts_and_closes():
    """The local engine's streaming loop stops pulling tokens once cancel fires
    (so llama.cpp stops computing) and closes the generator."""
    from app.services.engines import local

    ev = threading.Event()
    closed = {"v": False}

    class FakeStream:
        def __init__(self):
            self.n = 0

        def __iter__(self):
            return self

        def __next__(self):
            self.n += 1
            if self.n == 3:
                ev.set()  # simulate the user cancelling mid-generation
            if self.n > 100:
                raise StopIteration
            return {"choices": [{"delta": {"content": "x"}}]}

        def close(self):
            closed["v"] = True

    class FakeLlm:
        def create_chat_completion(self, **kwargs):
            assert kwargs.get("stream") is True
            return FakeStream()

    try:
        local._stream_content(FakeLlm(), {"messages": []}, ev)
        assert False, "expected GenerationCancelled"
    except GenerationCancelled:
        pass
    assert closed["v"], "abandoned generator must be closed so compute stops"
