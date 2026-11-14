"""Export private code-point maps as browser UTF-16 offsets without editing them."""
from copy import deepcopy


def boundaries(text):
    offsets = [0]
    for character in text:
        offsets.append(offsets[-1] + (2 if ord(character) > 0xFFFF else 1))
    return offsets


def checked_index(value, limit, *, endpoint=True):
    if type(value) is not int or not 0 <= value <= limit or not endpoint and value == limit:
        raise ValueError('Invalid code-point offset')
    return value


def mapped_units(text, mapping, raw, visible):
    if len(mapping) != len(text):
        raise ValueError('A private source map needs one entry per code point')
    exported = []
    for index, offset in enumerate(mapping):
        checked_index(offset, len(raw)-1, endpoint=False)
        # Identity astral characters map both surrogate units. A replacement
        # expanding a BMP character maps both units to that original character;
        # a contraction keeps the original character's start.
        width = raw[offset+1] - raw[offset]
        exported.extend(raw[offset] + min(unit, width-1)
                        for unit in range(visible[index+1]-visible[index]))
    return exported


def convert_segment(segment, page_offsets, source_offset):
    text = segment['text']
    visible = boundaries(text)
    segment['map'] = mapped_units(text, segment['map'], page_offsets(segment['page']), visible)
    for citation in segment.get('citations', []):
        start = checked_index(citation['start'], len(text))
        end = checked_index(citation['end'], len(text))
        if start >= end:
            raise ValueError('Invalid citation range')
        citation.update(start=visible[start], end=visible[end])
        if 'referenceOffset' in citation:
            citation['referenceOffset'] = source_offset(citation['referencePage'], citation['referenceOffset'])


def convert_cues(cues, source_offset):
    for cue in cues['cues']:
        for source_range in cue['ranges']:
            page, start, end = source_range['page'], source_range['start'], source_range['end']
            if type(start) is not int or type(end) is not int or start >= end:
                raise ValueError('Invalid cue source range')
            source_range.update(start=source_offset(page, start), end=source_offset(page, end))


def public_payload(body, cues, source_pages):
    """Return copied body and one voice's cues with public offsets in UTF-16.

    Inputs use Python code points. source_pages is the original extraction's
    pages array, containing text dictionaries. Text, versions, audio identities
    and times remain unchanged. sectionSources maps statute names to citation
    strings, so it has no coordinates to convert.
    """
    if body.get('offsetEncoding') or cues.get('offsetEncoding'):
        raise ValueError('Public offsets have already been encoded')
    public_body, public_cues = deepcopy(body), deepcopy(cues)
    pages = {}

    def page_offsets(page):
        checked_index(page, len(source_pages), endpoint=False)
        if page not in pages:
            pages[page] = boundaries(source_pages[page]['text'])
        return pages[page]

    def source_offset(page, offset, *, endpoint=True):
        offsets = page_offsets(page)
        return offsets[checked_index(offset, len(offsets)-1, endpoint=endpoint)]

    for paragraph in public_body['paragraphs']:
        for segment in paragraph['segments']:
            convert_segment(segment, page_offsets, source_offset)
    convert_cues(public_cues, source_offset)

    if public_body != body or public_cues != cues:
        public_body['offsetEncoding'] = public_cues['offsetEncoding'] = 'utf16'
    return public_body, public_cues
