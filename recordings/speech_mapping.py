"""Map emitted speech characters to exact intervals in clean reader text.

Callers decide whether a block is narrated. These transformations mirror the
spoken script only; PDF coordinates remain in the reader paragraph's segments.
"""
from dataclasses import dataclass
import re


@dataclass
class SpeechMapping:
    text: str
    intervals: list

    def bounds(self, start, end):
        return source_bounds(self.intervals, start, end)


def source_bounds(intervals, start, end):
    """Return the source interval covered by speech, excluding announcements."""
    if not 0 <= start <= end <= len(intervals):
        raise ValueError('Speech interval is outside the emitted script')
    origins = [origin for origin in intervals[start:end] if origin is not None]
    if not origins:
        return None
    return min(origin[0] for origin in origins), max(origin[1] for origin in origins)


def unit_bounds(units):
    return source_bounds([origin for _, origin in units], 0, len(units))


def omit_citations(units, citations):
    for citation in reversed(citations):
        if citation.get('omitFromSpeech', True):
            del units[citation['start']:citation['end']]
    return units


def pronunciation_units(units, changes, block_index):
    text = ''.join(character for character, _ in units)
    for change in changes:
        if change['from'] not in text:
            raise ValueError(f'Pronunciation no longer matches block {block_index}: {change["from"]}')
    if not changes:
        return units
    replacements = {change['from']: change['to'] for change in changes}
    pattern = '|'.join(re.escape(value) for value in sorted(replacements, key=len, reverse=True))
    result, cursor = [], 0
    for match in re.finditer(pattern, text):
        result.extend(units[cursor:match.start()])
        origin = unit_bounds(units[match.start():match.end()])
        result.extend((character, origin) for character in replacements[match.group()])
        cursor = match.end()
    result.extend(units[cursor:])
    return result


def whitespace_units(units):
    text = ''.join(character for character, _ in units)
    result, cursor = [], 0
    for match in re.finditer(r'\S+', text):
        if result:
            result.append((' ', unit_bounds(units[cursor:match.start()])))
        result.extend(units[match.start():match.end()])
        cursor = match.end()
    return result


def punctuation_units(units):
    result = []
    for index, unit in enumerate(units):
        if unit[0] == ' ' and index+1 < len(units) and units[index+1][0] in ',.;:!?':
            continue
        result.append(unit)
    return result


def map_speech(text, citations=(), pronunciations=(), index=0, footnote_label=None):
    units = [(character, (offset, offset+1)) for offset, character in enumerate(text)]
    units = omit_citations(units, citations)
    units = pronunciation_units(units, pronunciations, index)
    units = punctuation_units(whitespace_units(units))
    if not any(character.isalnum() for character, _ in units):
        return None
    if footnote_label is not None:
        prefix = [(character, None) for character in f'Footnote {footnote_label}: ']
        suffix = [(character, None) for character in f' End footnote {footnote_label}.']
        units = prefix+units+suffix
    return SpeechMapping(''.join(character for character, _ in units),
                         [origin for _, origin in units])
