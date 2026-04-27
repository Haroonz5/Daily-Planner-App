import json
import os
import re
from datetime import date, datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()

Priority = Literal["Low", "Medium", "High"]


class ExistingTask(BaseModel):
    title: str
    date: str
    time: str
    priority: Priority | None = None


class ParseTasksRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1000)
    default_date: str
    timezone: str = "America/New_York"
    now: str | None = None
    existing_tasks: list[ExistingTask] = Field(default_factory=list)


class ParsedTask(BaseModel):
    title: str
    date: str
    time: str
    priority: Priority = "Medium"
    duration_minutes: int | None = Field(default=None, ge=1, le=720)
    notes: str = ""


class ParseTasksResponse(BaseModel):
    tasks: list[ParsedTask]
    warnings: list[str] = Field(default_factory=list)
    source: Literal["openai", "local"]


TASK_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "tasks": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "title": {"type": "string"},
                    "date": {"type": "string"},
                    "time": {"type": "string"},
                    "priority": {"type": "string", "enum": ["Low", "Medium", "High"]},
                    "duration_minutes": {"type": ["integer", "null"]},
                    "notes": {"type": "string"},
                },
                "required": [
                    "title",
                    "date",
                    "time",
                    "priority",
                    "duration_minutes",
                    "notes",
                ],
            },
        },
        "warnings": {
            "type": "array",
            "items": {"type": "string"},
        },
    },
    "required": ["tasks", "warnings"],
}


app = FastAPI(title="Daily Discipline AI", version="1.0.0")

allowed_origins = [
    origin.strip()
    for origin in os.getenv("AI_ALLOWED_ORIGINS", "*").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _parse_date_key(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()


def _format_time(hour: int, minute: int = 0, period: str | None = None) -> str:
    normalized_hour = hour

    if period:
        period = period.lower()
        if period == "pm" and normalized_hour != 12:
            normalized_hour += 12
        if period == "am" and normalized_hour == 12:
            normalized_hour = 0
    elif normalized_hour < 8:
        normalized_hour += 12

    suffix = "AM" if normalized_hour < 12 else "PM"
    display_hour = normalized_hour % 12 or 12
    return f"{display_hour}:{minute:02d} {suffix}"


def _weekday_date(base: date, weekday_name: str) -> date:
    weekdays = {
        "monday": 0,
        "tuesday": 1,
        "wednesday": 2,
        "thursday": 3,
        "friday": 4,
        "saturday": 5,
        "sunday": 6,
    }
    target = weekdays[weekday_name.lower()]
    delta = (target - base.weekday()) % 7
    return base + timedelta(days=delta or 7)


def _resolve_segment_date(segment: str, default_date: date) -> date:
    lower = segment.lower()

    if "tomorrow" in lower:
        return date.today() + timedelta(days=1)

    if "today" in lower:
        return date.today()

    if "next week" in lower:
        return default_date + timedelta(days=7)

    for weekday in (
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
    ):
        if weekday in lower:
            return _weekday_date(default_date, weekday)

    return default_date


def _priority_from_text(text: str) -> Priority:
    lower = text.lower()
    if any(word in lower for word in ("urgent", "important", "high priority")):
        return "High"
    if any(word in lower for word in ("easy", "low priority", "small")):
        return "Low"
    return "Medium"


def _duration_from_text(text: str) -> int | None:
    match = re.search(
        r"\bfor\s+(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?)\b",
        text,
        re.IGNORECASE,
    )
    if not match:
        return None

    value = float(match.group(1))
    unit = match.group(2).lower()
    if unit.startswith(("hour", "hr")):
        return int(value * 60)
    return int(value)


def _clean_title(segment: str) -> str:
    cleaned = re.sub(
        r"\b(today|tomorrow|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b",
        "",
        segment,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(
        r"\bfor\s+\d+(?:\.\d+)?\s*(hours?|hrs?|minutes?|mins?)\b",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(
        r"\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" ,.-")
    return cleaned[:1].upper() + cleaned[1:] if cleaned else "Task"


def _local_parse(request: ParseTasksRequest) -> ParseTasksResponse:
    default_date = _parse_date_key(request.default_date)
    segments = [
        segment.strip()
        for segment in re.split(r",|;|\band then\b|\bthen\b", request.text, flags=re.IGNORECASE)
        if segment.strip()
    ]
    parsed_tasks: list[ParsedTask] = []
    warnings: list[str] = []

    for segment in segments:
        time_match = re.search(
            r"\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b",
            segment,
            re.IGNORECASE,
        )
        if not time_match:
            warnings.append(f"Could not find a time for: {segment}")
            continue

        hour = int(time_match.group(1))
        minute = int(time_match.group(2) or "0")
        period = time_match.group(3)
        if hour > 12 or minute > 59:
            warnings.append(f"Could not understand the time for: {segment}")
            continue

        duration = _duration_from_text(segment)
        notes = f"Estimated duration: {duration} minutes" if duration else ""

        parsed_tasks.append(
            ParsedTask(
                title=_clean_title(segment),
                date=_resolve_segment_date(segment, default_date).isoformat(),
                time=_format_time(hour, minute, period),
                priority=_priority_from_text(segment),
                duration_minutes=duration,
                notes=notes,
            )
        )

    if not parsed_tasks:
        warnings.append("Try adding times with 'at', like 'Gym at 6 PM'.")

    return ParseTasksResponse(tasks=parsed_tasks, warnings=warnings, source="local")


def _openai_parse(request: ParseTasksRequest) -> ParseTasksResponse | None:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None

    try:
        from openai import OpenAI

        client = OpenAI(api_key=api_key)
        model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        now = request.now or datetime.now(ZoneInfo(request.timezone)).isoformat()
        prompt = {
            "user_text": request.text,
            "default_date": request.default_date,
            "timezone": request.timezone,
            "now": now,
            "existing_tasks": [task.model_dump() for task in request.existing_tasks],
        }

        response = client.chat.completions.create(
            model=model,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You parse natural language into Daily Discipline tasks. "
                        "Return only JSON matching this shape: "
                        '{"tasks":[{"title":"Gym","date":"YYYY-MM-DD","time":"6:00 PM",'
                        '"priority":"Low|Medium|High","duration_minutes":60,'
                        '"notes":""}],"warnings":[]}. '
                        "Use the provided default_date when no date is stated. "
                        "If AM/PM is ambiguous, infer the most likely future time for a productivity planner. "
                        "Keep titles short and action-oriented. Do not invent tasks."
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps(prompt),
                },
            ],
        )

        content = response.choices[0].message.content or "{}"
        data = json.loads(content)
        tasks = [ParsedTask(**task) for task in data.get("tasks", [])]
        warnings = [str(warning) for warning in data.get("warnings", [])]

        return ParseTasksResponse(tasks=tasks, warnings=warnings, source="openai")
    except Exception:
        return None


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/v1/parse-tasks", response_model=ParseTasksResponse)
def parse_tasks(request: ParseTasksRequest):
    parsed = _openai_parse(request)
    if parsed:
        return parsed
    return _local_parse(request)
