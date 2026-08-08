#!/usr/bin/env python3
"""Build browser transcript data without modifying the raw ASR source.

Topic titles/timestamps are extracted from the existing index.html. Official chapter
bounds are fixed by the recording's published chapter starts; each highlight ends at
the next topic (or chapter end), making source-span highlighting possible in the UI.
"""

from __future__ import annotations

import argparse
import html
import json
import math
import re
from pathlib import Path

CHAPTER_STARTS = [128, 4652, 5505, 7098, 12089, 13163, 15405]
CHAPTER_TITLES = [
    "칩의 역사: 독점 아래의 긴 일몰",
    "무어의 법칙",
    "18층 보탑",
    "화웨이 어센드 역사와 중국의 길",
    "인재와 컴퓨팅 파워",
    "AI와 칩 기술 최전선",
    "엔지니어 이야기",
]
EXPECTED_SEGMENTS = 8142
EXPECTED_CHAPTERS = 7
EXPECTED_HIGHLIGHTS = 35

TOPIC_RE = re.compile(
    r'<article class="topic" id="topic-(?P<id>\d+)".*?'
    r'<h3 id="topic-\d+-title">(?P<title>.*?)</h3>'
    r'<a class="timestamp" href="[^"]*\?t=(?P<start>\d+)".*?'
    r'(?P<timestamp>\d{2}:\d{2}:\d{2})',
    re.DOTALL,
)


def clean_text(value: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", value)).strip()


def chapter_for(second: float) -> int:
    chapter = 1
    for index, start in enumerate(CHAPTER_STARTS, start=1):
        if second >= start:
            chapter = index
        else:
            break
    return chapter


def segment_span(segments: list[dict], start: float, end: float) -> tuple[int, int]:
    matching = [s["id"] for s in segments if s["end"] > start and s["start"] < end]
    if matching:
        # Whisper can emit zero-length trailing segments at the exact recording
        # end. They are still source segments and belong to the final range.
        last_id = segments[-1]["id"] if end == segments[-1]["end"] else matching[-1]
        return matching[0], last_id
    nearest = min(segments, key=lambda s: abs(s["start"] - start))["id"]
    return nearest, nearest


def build(source_path: Path, index_path: Path, output_path: Path) -> dict:
    source = json.loads(source_path.read_text(encoding="utf-8"))
    raw_segments = source.get("segments", [])
    segments = [
        {
            "id": segment["id"],
            "start": segment["start"],
            "end": max(segment["start"], segment["end"]),
            "text": segment["text"],
        }
        for segment in raw_segments
    ]
    if not segments:
        raise ValueError("source contains no segments")

    index_html = index_path.read_text(encoding="utf-8")
    extracted = [
        {
            "id": int(match.group("id")),
            "title": clean_text(match.group("title")),
            "start": int(match.group("start")),
            "timestamp": match.group("timestamp"),
        }
        for match in TOPIC_RE.finditer(index_html)
    ]
    # After the one-time HTML migration, reuse the already extracted navigation
    # metadata from transcript.json so subsequent data rebuilds remain repeatable.
    if not extracted and output_path.exists():
        existing = json.loads(output_path.read_text(encoding="utf-8"))
        extracted = [
            {
                "id": item["id"],
                "title": item["title"],
                "start": item["start"],
                "timestamp": item["timestamp"],
            }
            for item in existing.get("highlights", [])
        ]
    if len(extracted) != EXPECTED_HIGHLIGHTS:
        raise ValueError(
            f"expected {EXPECTED_HIGHLIGHTS} topics in index.html, found {len(extracted)}"
        )

    transcript_end = segments[-1]["end"]
    chapters = []
    for index, (start, title) in enumerate(zip(CHAPTER_STARTS, CHAPTER_TITLES), start=1):
        end = CHAPTER_STARTS[index] if index < len(CHAPTER_STARTS) else transcript_end
        first_id, last_id = segment_span(segments, start, end)
        chapters.append(
            {
                "id": index,
                "anchor": f"chapter-{index}",
                "title": title,
                "start": start,
                "end": end,
                "segmentStartId": first_id,
                "segmentEndId": last_id,
            }
        )

    highlights = []
    for index, topic in enumerate(extracted):
        chapter_id = chapter_for(topic["start"])
        chapter_end = chapters[chapter_id - 1]["end"]
        next_start = extracted[index + 1]["start"] if index + 1 < len(extracted) else chapter_end
        end = min(next_start, chapter_end)
        first_id, last_id = segment_span(segments, topic["start"], end)
        highlights.append(
            {
                **topic,
                "anchor": f"topic-{topic['id']}",
                "chapter": chapter_id,
                "end": end,
                "segmentStartId": first_id,
                "segmentEndId": last_id,
            }
        )

    payload = {
        "meta": {
            "language": "zh",
            "kind": "automatic-speech-recognition",
            "verbatimVerified": False,
            "segmentCount": len(segments),
            "chapterCount": len(chapters),
            "highlightCount": len(highlights),
            "transcriptStart": segments[0]["start"],
            "transcriptEnd": transcript_end,
        },
        "chapters": chapters,
        "highlights": highlights,
        "segments": segments,
    }
    output_path.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    return payload


def verify(payload: dict) -> None:
    segments = payload["segments"]
    chapters = payload["chapters"]
    highlights = payload["highlights"]
    assert len(segments) == EXPECTED_SEGMENTS, len(segments)
    assert len(chapters) == EXPECTED_CHAPTERS, len(chapters)
    assert len(highlights) == EXPECTED_HIGHLIGHTS, len(highlights)
    assert [chapter["start"] for chapter in chapters] == CHAPTER_STARTS
    assert all(set(segment) == {"id", "start", "end", "text"} for segment in segments)
    assert len({segment["id"] for segment in segments}) == EXPECTED_SEGMENTS
    assert all(
        isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
        for segment in segments for value in (segment["start"], segment["end"])
    )
    assert all(segment["start"] <= segment["end"] for segment in segments)
    start_regressions = [
        a["id"] for a, b in zip(segments, segments[1:]) if a["start"] > b["start"]
    ]
    # The two raw ASR timestamp reversals are retained because projection must not
    # rewrite starts; both are made zero-length by the end clamp above.
    assert start_regressions == [1968, 6726]
    assert all(segments[index]["end"] == segments[index]["start"] for index in start_regressions)
    transcript_start, transcript_end = segments[0]["start"], segments[-1]["end"]
    assert all(
        transcript_start <= chapter["start"] < chapter["end"] <= transcript_end
        and chapter["segmentStartId"] <= chapter["segmentEndId"]
        for chapter in chapters
    )
    assert all(chapters[index]["end"] == chapters[index + 1]["start"] for index in range(len(chapters) - 1))
    assert all(
        chapters[item["chapter"] - 1]["start"] <= item["start"] < item["end"] <= chapters[item["chapter"] - 1]["end"]
        for item in highlights
    )
    assert all(item["segmentStartId"] <= item["segmentEndId"] for item in highlights)


def migrate_index(index_path: Path, payload: dict) -> None:
    """Replace only the legacy Q&A chapter block with transcript-reader structure."""
    document = index_path.read_text(encoding="utf-8")
    start_marker = '<section class="content-section chapter" id="chapter-1"'
    end_marker = '<section class="content-section appendix" id="theses"'
    start = document.find(start_marker)
    end = document.find(end_marker)
    if start < 0 or end < 0 or end <= start:
        if 'id="transcript"' in document:
            return
        raise ValueError("could not locate the legacy Q&A chapter block")

    chapter_sections = []
    for chapter in payload["chapters"]:
        chapter_highlights = [
            item for item in payload["highlights"] if item["chapter"] == chapter["id"]
        ]
        links = "".join(
            f'<li><a href="#{item["anchor"]}" data-nav-topic="{item["id"]}">'
            f'<span>{item["id"]:02d}</span>{html.escape(item["title"])}</a></li>'
            for item in chapter_highlights
        )
        anchors = "".join(
            f'<span id="{item["anchor"]}" class="transcript-topic-anchor" '
            f'data-topic="{item["id"]}" data-start="{item["start"]}" '
            f'data-end="{item["end"]}" data-segment-start="{item["segmentStartId"]}" '
            f'data-segment-end="{item["segmentEndId"]}" aria-hidden="true"></span>'
            for item in chapter_highlights
        )
        chapter_sections.append(
            f'<section class="content-section chapter transcript-chapter" '
            f'id="{chapter["anchor"]}" data-chapter="{chapter["id"]}" '
            f'data-start="{chapter["start"]}" data-end="{chapter["end"]}" '
            f'aria-labelledby="chapter-{chapter["id"]}-title">\n'
            f'<header class="chapter-heading"><span class="chapter-index">CHAPTER '
            f'{chapter["id"]:02d}</span><h2 id="chapter-{chapter["id"]}-title">'
            f'{html.escape(chapter["title"])}</h2><span class="chapter-line" '
            f'aria-hidden="true"></span></header>\n'
            f'<nav class="transcript-highlights" aria-label="{chapter["id"]}장 중요 지점">'
            f'<ol>{links}</ol></nav>\n{anchors}'
            f'<div class="transcript-segments" data-transcript-chapter="{chapter["id"]}"></div>\n'
            f'</section>'
        )

    reader = (
        '<section class="content-section transcript-reader" id="transcript" '
        'aria-labelledby="transcript-title" aria-busy="true">\n'
        '<header class="section-heading"><span class="eyebrow">FULL TRANSCRIPT · 中文 ASR</span>'
        '<h2 id="transcript-title">전체 중국어 ASR 트랜스크립트</h2></header>\n'
        '<div class="transcript-disclaimer" role="note"><strong>전사 정확도 안내:</strong> '
        '아래 내용은 인터뷰 전체 오디오를 중국어 자동 음성 인식(ASR)으로 변환한 결과이며, '
        '사람이 원음과 대조해 축자 검증한 공식 전사본이 아닙니다. 고유명사·숫자·영문 약어와 '
        '문장 경계에 오인식이 있을 수 있으므로 인용 전 반드시 원본 영상을 확인하세요.</div>\n'
        '<p id="transcriptLoading" class="transcript-state" role="status">'
        '전체 전사 8,142개 구간을 불러오는 중입니다…</p>\n'
        '<div id="transcriptError" class="transcript-state transcript-error" role="alert" hidden>'
        '트랜스크립트를 불러오지 못했습니다. 페이지를 새로고침하거나 transcript.json 파일을 확인하세요.'
        '</div>\n'
        '<div class="transcript-segments transcript-intro" data-transcript-intro '
        'data-start="0" data-end="128" aria-label="공식 1장 이전 도입부"></div>\n'
        + "\n".join(chapter_sections)
        + '\n<noscript><p class="transcript-state">전체 전사를 표시하려면 JavaScript를 켜 주세요.</p></noscript>\n'
        '</section>\n'
    )
    document = document[:start] + reader + document[end:]
    index_path.write_text(document, encoding="utf-8")


def main() -> None:
    project = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source",
        type=Path,
        default=Path("/Users/gimseojun/sion-workspace/outputs/liao-heng-interview/transcript-zh.json"),
    )
    parser.add_argument("--index", type=Path, default=project / "index.html")
    parser.add_argument("--output", type=Path, default=project / "transcript.json")
    parser.add_argument("--verify-only", action="store_true")
    parser.add_argument(
        "--migrate-index",
        action="store_true",
        help="replace the legacy Q&A block with transcript-reader markup",
    )
    args = parser.parse_args()

    if args.verify_only:
        payload = json.loads(args.output.read_text(encoding="utf-8"))
    else:
        payload = build(args.source, args.index, args.output)
    verify(payload)
    if args.migrate_index:
        migrate_index(args.index, payload)
    print(
        "verified: "
        f"segments={len(payload['segments'])}, "
        f"chapters={len(payload['chapters'])}, "
        f"highlights={len(payload['highlights'])}, "
        f"last_end={payload['segments'][-1]['end']}"
    )


if __name__ == "__main__":
    main()
