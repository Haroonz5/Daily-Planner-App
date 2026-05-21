import json
import os
import statistics
import sys
import time
import urllib.request
from pathlib import Path
from typing import Any

from main import ParseTasksRequest, _local_parse

CASES_PATH = Path(__file__).parent / "evals" / "planner_cases.json"
REPORT_PATH = Path(__file__).parent / "evals" / "latest-report.json"


def run_local_case(case: dict[str, Any]) -> dict[str, Any]:
    request = ParseTasksRequest(
        text=case["input"],
        default_date=case.get("default_date", "2026-05-03"),
        timezone=case.get("timezone", "America/New_York"),
        now=case.get("now", "2026-05-03T09:00:00-04:00"),
        existing_tasks=case.get("existing_tasks", []),
        planning_rules=case.get("planning_rules", ""),
    )
    response = _local_parse(request)
    return response.model_dump()


def run_backend_case(case: dict[str, Any], backend_url: str) -> dict[str, Any]:
    payload = {
        "text": case["input"],
        "default_date": case.get("default_date", "2026-05-03"),
        "timezone": case.get("timezone", "America/New_York"),
        "now": case.get("now", "2026-05-03T09:00:00-04:00"),
        "existing_tasks": case.get("existing_tasks", []),
        "planning_rules": case.get("planning_rules", ""),
    }
    headers = {"Content-Type": "application/json"}
    token = os.getenv("AI_EVAL_AUTH_TOKEN", "").strip()
    admin_token = os.getenv("AI_EVAL_ADMIN_TOKEN", "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if admin_token:
        headers["X-Admin-Token"] = admin_token

    request = urllib.request.Request(
        backend_url.rstrip("/") + "/v1/parse-tasks",
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def get_nested(value: dict[str, Any], dotted_key: str) -> Any:
    current: Any = value
    for part in dotted_key.split("."):
        if isinstance(current, dict):
            current = current.get(part)
        else:
            return None
    return current


def assert_task(task: dict[str, Any], expected: dict[str, Any], index: int) -> list[str]:
    errors: list[str] = []
    if expected.get("title_contains") and expected["title_contains"].lower() not in task.get("title", "").lower():
        errors.append(f"task {index} title did not contain {expected['title_contains']!r}: {task.get('title')!r}")

    for key in ("date", "time", "recurrence", "priority", "duration_minutes"):
        if key in expected and task.get(key) != expected[key]:
            errors.append(f"task {index} {key} expected {expected[key]!r}, got {task.get(key)!r}")

    if "recurrence_days" in expected:
        actual_days = sorted(task.get("recurrence_days") or [])
        if actual_days != expected["recurrence_days"]:
            errors.append(f"task {index} recurrence_days expected {expected['recurrence_days']!r}, got {actual_days!r}")

    return errors


def assert_case(case: dict[str, Any], result: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    tasks = result.get("tasks", [])
    expected = case["expect"]

    if "count" in expected and len(tasks) != expected["count"]:
        errors.append(f"expected {expected['count']} task(s), got {len(tasks)}")

    if "source" in expected and result.get("source") != expected["source"]:
        errors.append(f"source expected {expected['source']!r}, got {result.get('source')!r}")

    if "first" in expected and tasks:
        errors.extend(assert_task(tasks[0], expected["first"], 0))

    # Backwards-compatible shorthand for older cases.
    shorthand_keys = {"title_contains", "time", "recurrence", "priority", "duration_minutes", "recurrence_days", "date"}
    if shorthand_keys.intersection(expected.keys()) and tasks:
        errors.extend(assert_task(tasks[0], expected, 0))

    for task_expectation in expected.get("tasks", []):
        index = task_expectation.get("index", 0)
        if index >= len(tasks):
            errors.append(f"expected task index {index}, but only {len(tasks)} task(s) returned")
            continue
        errors.extend(assert_task(tasks[index], task_expectation, index))

    for dotted_key, expected_value in expected.get("fields", {}).items():
        actual = get_nested(result, dotted_key)
        if actual != expected_value:
            errors.append(f"{dotted_key} expected {expected_value!r}, got {actual!r}")

    return errors


def main() -> int:
    cases = json.loads(CASES_PATH.read_text())
    backend_url = os.getenv("AI_EVAL_BACKEND_URL", "").strip()
    failures: list[str] = []
    rows: list[dict[str, Any]] = []

    for case in cases:
        started = time.perf_counter()
        try:
            result = run_backend_case(case, backend_url) if backend_url else run_local_case(case)
            elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
            errors = assert_case(case, result)
            source = result.get("source", "backend" if backend_url else "local")
        except Exception as exc:  # noqa: BLE001 - eval output should capture all failures.
            elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
            result = {}
            errors = [str(exc)]
            source = "error"

        passed = not errors
        rows.append({
            "name": case["name"],
            "category": case.get("category", "planner"),
            "source": source,
            "passed": passed,
            "latency_ms": elapsed_ms,
            "errors": errors,
            "task_count": len(result.get("tasks", [])) if isinstance(result, dict) else 0,
        })

        if passed:
            print(f"PASS {case['name']} ({source}, {elapsed_ms}ms)")
        else:
            failures.append(f"{case['name']} ({source}): " + "; ".join(errors))

    passed_count = sum(1 for row in rows if row["passed"])
    latencies = [row["latency_ms"] for row in rows]
    report = {
        "mode": "backend" if backend_url else "local",
        "backend_url": backend_url or None,
        "total": len(rows),
        "passed": passed_count,
        "failed": len(rows) - passed_count,
        "pass_rate": round(passed_count / max(len(rows), 1), 4),
        "latency_ms": {
            "avg": round(statistics.mean(latencies), 2) if latencies else 0,
            "max": max(latencies) if latencies else 0,
        },
        "cases": rows,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2))

    if failures:
        print("\nAI planner eval failures:", file=sys.stderr)
        for failure in failures:
            print(f"- {failure}", file=sys.stderr)
        print(f"\nWrote report to {REPORT_PATH}", file=sys.stderr)
        return 1

    print(f"AI planner evals passed: {len(cases)} case(s)")
    print(f"Wrote report to {REPORT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
