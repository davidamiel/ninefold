"""Interpret explicit application dispositions without treating interim stays as final."""

import re

DISPOSITION = re.compile(
    r"\bapplications?(?:\s*\([^)]{0,32}\))?[^.;]{0,500}?\b(denied|granted|dismissed|withdrawn)\b",
    re.IGNORECASE,
)


def disposition(text):
    match = DISPOSITION.search(text)
    if match is None:
        return None
    clause = match[0].lower()
    if (
        re.search(r"\bsubmitted\b", clause)
        or "administrative stay" in clause
        or "interim stay" in clause
    ):
        return None
    outcome = match[1].lower()
    tail = text[match.end() : match.end() + 30].lower()
    if outcome == "denied" and tail.startswith(" as moot"):
        return "Application Denied as Moot"
    if outcome == "granted" and tail.startswith(" in part"):
        return "Application Granted in Part"
    return "Application " + outcome.title()


def final_state(proceedings):
    state, result, decided = "Pending", None, None
    for proceeding in proceedings:
        text = proceeding["description"]
        lower = text.lower()
        if lower.startswith("application") and any(
            word in lower for word in ("submitted", "refiled", "renewed")
        ):
            state, result, decided = "Pending", None, None
        outcome = disposition(text)
        if outcome is not None:
            state, result, decided = "Decided", outcome, proceeding["date"]
    return state, result, decided
