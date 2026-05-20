import json
import os
import sys
import urllib.request
from pathlib import Path

from main import ParseTasksRequest, _local_parse

CASES_PATH = Path(__file__).parent / "evals" / "planner_cases.json"


def run_local_case(case: dict) -> dict:
    request = ParseTasksRequest(
        text=case["input"],
        default_date=case.get("default_date", "2026-05-03"),
        timezone=case.get("timezone", "America/New_York"),
        now=case.get("now", "2026-05-03T09:00:00-04:00"),
        existing_tasks=[],
        planning_rules=case.get("planning_rules", ""),
    )
    response = _local_parse(request)
    return response.model_dump()


def run_backend_case(case: dict, backend_url: str) -> dict:
    payload = {
        "text": case["input"],
        "default_date": case.get("default_date", "2026-05-03"),
        "timezone": case.get("timezone", "America/New_York"),
        "now": case.get("now", "2026-05-03T09:00:00-04:00"),
        "existing_tasks": [],
        "planning_rules": case.get("planning_rules", ""),
    }
    request = urllib.request.Request(
        backend_url.rstrip("/") + "/v1/parse-tasks",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=8) as response:
        return json.loads(response.read().decode("utf-8"))


def assert_case(case: dict, result: dict) -> list[str]:
    errors: list[str] = []
    tasks = result.get("tasks", [])
    expected = case["expect"]

    if "count" in expected and len(tasks) != expected["count"]:
        errors.append(f"expected {expected['count']} task(s), got {len(tasks)}")

    if not tasks:
        return errors

    first = tasks[0]
    if expected.get("title_contains") and expected["title_contains"].lower() not in first.get("title", "").lower():
        errors.append(f"title did not contain {expected['title_contains']!r}: {first.get('title')!r}")

    for key in ("time", "recurrence", "priority", "duration_minutes"):
        if key in expected and first.get(key) != expected[key]:
            errors.append(f"{key} expected {expected[key]!r}, got {first.get(key)!r}")

    if "recurrence_days" in expected:
        actual_days = sorted(first.get("recurrence_days") or [])
        if actual_days != expected["recurrence_days"]:
            errors.append(f"recurrence_days expected {expected['recurrence_days']!r}, got {actual_days!r}")

    return errors


def main() -> int:
    cases = json.loads(CASES_PATH.read_text())
    backend_url = os.getenv("AI_EVAL_BACKEND_URL", "").strip()
    failures: list[str] = []

    for case in cases:
        result = run_backend_case(case, backend_url) if backend_url else run_local_case(case)
        errors = assert_case(case, result)
        source = result.get("source", "backend" if backend_url else "local")
        if errors:
            failures.append(f"{case['name']} ({source}): " + "; ".join(errors))
        else:
            print(f"PASS {case['name']} ({source})")

    if failures:
        print("\nAI planner eval failures:", file=sys.stderr)
        for failure in failures:
            print(f"- {failure}", file=sys.stderr)
        return 1

    print(f"AI planner evals passed: {len(cases)} case(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
