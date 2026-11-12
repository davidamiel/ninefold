"""Parse Court docket pages and labels without ambiguous backtracking patterns."""

import re
from datetime import datetime
from urllib.parse import urljoin

from bs4 import BeautifulSoup
from order_import_support import BASE

RELIEF_WORDS = ("stay", "injunct", "bail", "vacat", "mandate", "judgment", "recall")
PARTY_ROLES = {
    "applicant",
    "applicants",
    "petitioner",
    "petitioners",
    "respondent",
    "respondents",
}


def normalize(text):
    return " ".join(text.split())


def substantive_application(description):
    _, found, tail = description.lower().partition("application")
    if not found or not any(word in tail for word in RELIEF_WORDS):
        return False
    # Find the first extension marker, then inspect only its suffix for "time".
    for word in ("extend", "extension"):
        _, marker, suffix = tail.partition(word)
        if marker and "time" in suffix:
            return False
    return True


def parse_proceedings(soup):
    proceedings = []
    for table in soup.select("table.ProceedingItem"):
        cells = table.select("td")
        if len(cells) != 2:
            raise ValueError("Docket proceeding must have a date and description cell")
        date = (
            datetime.strptime(cells[0].get_text(" ", strip=True), "%b %d %Y")
            .date()
            .isoformat()
        )
        links = [
            {
                "label": anchor.get_text(" ", strip=True),
                "url": urljoin(BASE, anchor["href"]),
            }
            for anchor in cells[1].select("a[href]")
        ]
        block = cells[1].select_one(".documentlinks")
        if block is not None:
            block.extract()
        description = normalize(cells[1].get_text(" ", strip=True))
        if not description:
            raise ValueError("Docket proceeding has no description")
        proceedings.append({"date": date, "description": description, "links": links})
    if not proceedings:
        raise ValueError("Docket has no recognized proceedings")
    return proceedings


def parse_docket(content):
    soup = BeautifulSoup(content, "html.parser")
    info = {}
    for row in soup.select("#docketinfo tr"):
        cells = row.select("td")
        if len(cells) == 2:
            info[cells[0].get_text(" ", strip=True).rstrip(":")] = normalize(
                cells[1].get_text(" ", strip=True)
            )
    caption = info.get("Title")
    if not caption:
        title_element = soup.select_one(".title")
        if title_element is not None:
            caption = normalize(title_element.get_text(" ", strip=True))
    return info, caption, parse_proceedings(soup)


def case_name(caption):
    words = normalize(caption).split(" ")
    result = []
    for position, word in enumerate(words):
        next_word = words[position + 1].lower() if position + 1 < len(words) else None
        if word.lower() in PARTY_ROLES and next_word in ("v.", None):
            if result:
                result[-1] = result[-1].rstrip(",")
        else:
            result.append(word)
    return " ".join(result)


def filing_title(description):
    text = normalize(description)
    for ending in (" filed.", " filed"):
        if text.endswith(ending):
            return text[: -len(ending)]
    return text


def application_title(description):
    title = normalize(description)
    # Anchored, bounded docket syntax; no repeated arbitrary whitespace scans.
    title = re.sub(r"^Application \([^)]{0,32}\) ?", "Application ", title)
    position = title.lower().find(" submitted to")
    if position >= 0:
        title = title[:position].rstrip(",")
    return title.rstrip(".")
