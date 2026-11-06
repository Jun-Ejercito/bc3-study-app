#!/usr/bin/env python3
"""Extract visible Japanese text from Word OOXML.

Rules:
- Use visible text only: w:t outside field instructions, plus kanji base parsed from
  EQ ruby fields (instrText). Never emit instrText / field-switch debris.
- Skip phonetic guide runs (pure hiragana immediately before a kanji segment),
  which this corpus stores as sibling w:t before the kanji.
"""
from __future__ import annotations
import re
import zipfile
from lxml import etree

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
EQ_BASE = re.compile(
    r"\\o\\ad\(\\s\\up\s*\d+\((?P<yomi>[^)]*)\),(?P<base>[^)]*)\)"
)
HIRAGANA_ONLY = re.compile(r"^[\u3041-\u3096\u3099-\u309fー]+$")
KANJI_START = re.compile(r"^[\u4e00-\u9fff々〆ヵヶ]")
# Grammatical particles kept even when the next segment is kanji (e.g. の意義).
PARTICLE_BEFORE_KANJI = set("をのばがにでへとやもへは")


def _local(el) -> str:
    return etree.QName(el).localname


def _parse_eq_base(instr: str) -> str:
    """Return kanji/kana base from EQ ruby instruction; empty if not parseable."""
    m = EQ_BASE.search(instr)
    if m:
        return m.group("base")
    # Fallback: last `),X)` chunk often carries the base alone in split instrText
    m2 = re.search(r"\),([^)]+)\)\s*$", instr)
    if m2 and not m2.group(1).startswith("Font"):
        return m2.group(1)
    return ""


def paragraph_segments(p) -> list[tuple[str, str]]:
    """Return ordered ('t'|'eq', text) segments for one w:p."""
    segs: list[tuple[str, str]] = []
    in_field = False
    instr_buf: list[str] = []

    def flush_eq():
        nonlocal instr_buf
        raw = "".join(instr_buf)
        instr_buf = []
        base = _parse_eq_base(raw)
        if base:
            segs.append(("eq", base))

    for el in p.iter():
        tag = _local(el)
        if tag == "fldChar":
            typ = el.get(f"{W}fldCharType")
            if typ == "begin":
                in_field = True
                instr_buf = []
            elif typ == "separate":
                # Complex fields with a result: discard instruction, keep following w:t
                in_field = False
                instr_buf = []
            elif typ == "end":
                if instr_buf:
                    flush_eq()
                in_field = False
        elif tag == "instrText":
            if in_field:
                instr_buf.append(el.text or "")
        elif tag == "t":
            if in_field:
                # Result region after 'separate', or stray — only keep if not in instr mode
                # Our EQ fields have no separate; ignore t inside begin..end if any
                continue
            text = el.text or ""
            if text:
                segs.append(("t", text))
    return segs


def segments_to_visible(segs: list[tuple[str, str]]) -> str:
    """Drop phonetic-guide hiragana runs that immediately precede kanji."""
    out: list[str] = []
    i = 0
    while i < len(segs):
        _, text = segs[i]
        if HIRAGANA_ONLY.match(text):
            j = i + 1
            while j < len(segs) and segs[j][1] == "":
                j += 1
            if j < len(segs) and KANJI_START.match(segs[j][1]):
                # Skip phonetic guides; keep single-char grammatical particles.
                if len(text) >= 2 or text not in PARTICLE_BEFORE_KANJI:
                    i += 1
                    continue
        out.append(text)
        i += 1
    return "".join(out)


def paragraph_text(p) -> str:
    return segments_to_visible(paragraph_segments(p))


def docx_paragraphs(path: str) -> list[str]:
    with zipfile.ZipFile(path) as z:
        root = etree.fromstring(z.read("word/document.xml"))
    return [paragraph_text(p) for p in root.iter(f"{W}p")]


def docx_plain(path: str) -> str:
    return "\n".join(t for t in docx_paragraphs(path) if t.strip())


DEBRIS_RE = re.compile(
    r"jc2|Font:游|hps\d+|EQ\s*\\|\\\\o\\\\ad|instrText|\\?\*\\?\s*\"Font"
)


def has_debris(text: str) -> bool:
    return bool(DEBRIS_RE.search(text or ""))
