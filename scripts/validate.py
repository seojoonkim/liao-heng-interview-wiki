#!/usr/bin/env python3
"""정적 리더의 콘텐츠 불변 조건과 기본 문법을 검사한다."""
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
from PIL import Image
import json
import math
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
HTML = ROOT / "index.html"
CSS = ROOT / "styles.css"
JS = ROOT / "script.js"
SOURCE_TRANSCRIPT = ROOT / "transcript.json"
TRANSCRIPT = ROOT / "transcript-ko.json"
OG_IMAGE = ROOT / "assets" / "og-liao-heng-scientist.jpg"
SITE_URL = "https://liao-heng-interview-wiki.vercel.app/"
OG_IMAGE_URL = f"{SITE_URL}assets/og-liao-heng-scientist.jpg"
SOCIAL_TITLE = "랴오헝 인터뷰 — 반도체 연구자의 필드 노트"
SOCIAL_DESCRIPTION = "화웨이 반도체 수석과학자 랴오헝의 4시간 38분 인터뷰를 7개 장, 35개 중요 지점, 전체 한국어 번역 전사로 읽는 필드 노트."
OG_IMAGE_ALT = "랴오헝 인터뷰 필드 노트 — 랴오헝 사진과 7개 장·35개 중요 지점 안내"
errors = []
SOCIAL_ONLY = "--social-only" in sys.argv[1:]


def require(condition, message):
    if not condition:
        errors.append(message)


class DocumentParser(HTMLParser):
    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids = []
        self.hrefs = []
        self.scripts = []
        self.stylesheets = []
        self.metadata = []
        self.links = []
        self.stack = []

    def handle_decl(self, decl):
        pass

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if values.get("id"):
            self.ids.append(values["id"])
        if values.get("href"):
            self.hrefs.append(values["href"])
        if tag == "script" and values.get("src"):
            self.scripts.append(values["src"])
        if tag == "link" and "stylesheet" in values.get("rel", "").split() and values.get("href"):
            self.stylesheets.append(values["href"])
        if tag == "meta" and values.get("content") is not None:
            key = values.get("property") or values.get("name")
            if key:
                self.metadata.append((key, values["content"]))
        if tag == "link":
            self.links.append(values)
        if tag not in self.VOID:
            self.stack.append(tag)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.VOID:
            self.stack.pop()

    def handle_endtag(self, tag):
        if tag in self.VOID:
            return
        if not self.stack or self.stack[-1] != tag:
            errors.append(f"HTML 닫는 태그 순서 오류: </{tag}>")
            return
        self.stack.pop()


def balanced_css(text):
    """주석과 문자열을 제외하고 CSS 괄호가 균형인지 검사한다."""
    pairs = {"}": "{", ")": "(", "]": "["}
    stack = []
    quote = None
    escaped = False
    comment = False
    i = 0
    while i < len(text):
        char = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""
        if comment:
            if char == "*" and nxt == "/":
                comment = False
                i += 2
                continue
        elif quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
        elif char == "/" and nxt == "*":
            comment = True
            i += 2
            continue
        elif char in "\"'":
            quote = char
        elif char in "{([":
            stack.append(char)
        elif char in "})]":
            if not stack or stack.pop() != pairs[char]:
                return False
        i += 1
    return not stack and not quote and not comment


html = HTML.read_text(encoding="utf-8")
css = CSS.read_text(encoding="utf-8")
parser = DocumentParser()
try:
    parser.feed(html)
    parser.close()
except Exception as exc:
    errors.append(f"HTML 파싱 실패: {exc}")

require(html.lstrip().lower().startswith("<!doctype html>"), "HTML5 doctype 누락")
require(not parser.stack, f"닫히지 않은 HTML 태그: {parser.stack}")
metadata = dict(parser.metadata)
metadata_counts = Counter(key for key, _ in parser.metadata)
expected_metadata = {
    "description": SOCIAL_DESCRIPTION,
    "theme-color": "#292c33",
    "og:type": "article",
    "og:site_name": "랴오헝 인터뷰 위키",
    "og:title": SOCIAL_TITLE,
    "og:description": SOCIAL_DESCRIPTION,
    "og:url": SITE_URL,
    "og:locale": "ko_KR",
    "og:image": OG_IMAGE_URL,
    "og:image:secure_url": OG_IMAGE_URL,
    "og:image:width": "1200",
    "og:image:height": "630",
    "og:image:type": "image/jpeg",
    "og:image:alt": OG_IMAGE_ALT,
    "twitter:card": "summary_large_image",
    "twitter:title": SOCIAL_TITLE,
    "twitter:description": SOCIAL_DESCRIPTION,
    "twitter:image": OG_IMAGE_URL,
    "twitter:image:alt": OG_IMAGE_ALT,
}
for key, value in expected_metadata.items():
    require(metadata_counts[key] == 1, f"소셜 메타 {key}는 원본 HTML head에 정확히 1회여야 함")
    require(metadata.get(key) == value, f"소셜 메타 {key} 값 오류")
canonicals = [link.get("href") for link in parser.links if "canonical" in link.get("rel", "").split()]
require(canonicals == [SITE_URL], "canonical URL은 원본 HTML head에 정확히 지정되어야 함")
require(f"<title>{SOCIAL_TITLE}</title>" in html, "문서 title 오류")
try:
    with Image.open(OG_IMAGE) as image:
        require(image.format == "JPEG", f"OG 이미지는 JPEG여야 함: {image.format}")
        require(image.size == (1200, 630), f"OG 이미지 크기는 1200×630이어야 함: {image.size}")
        require(image.mode == "RGB", f"OG 이미지는 RGB여야 함: {image.mode}")
except Exception as exc:
    errors.append(f"OG 이미지 검사 실패: {exc}")
require(OG_IMAGE.is_file() and OG_IMAGE.stat().st_size <= 500_000, "OG 이미지는 존재하며 500KB 이하여야 함")
if SOCIAL_ONLY:
    if errors:
        print("소셜 카드 검증 실패:")
        for error in errors:
            print(f"- {error}")
        sys.exit(1)
    print("소셜 카드 검증 통과")
    print("- canonical/Open Graph/Twitter 원본 HTML 메타: 정상")
    print("- OG 이미지: JPEG, RGB, 1200×630, 500KB 이하")
    sys.exit(0)
id_counts = Counter(parser.ids)
duplicates = sorted(value for value, count in id_counts.items() if count > 1)
require(not duplicates, f"중복 id: {duplicates}")

for number in range(1, 36):
    require(id_counts[f"topic-{number}"] == 1, f"topic-{number}는 정확히 1회여야 함")
for number in range(1, 8):
    require(id_counts[f"chapter-{number}"] == 1, f"chapter-{number}는 정확히 1회여야 함")
require(not [value for value in parser.ids if re.fullmatch(r"topic-\d+", value) and not 1 <= int(value[6:]) <= 35], "1~35 밖의 topic id 존재")
require(not [value for value in parser.ids if re.fullmatch(r"chapter-\d+", value) and not 1 <= int(value[8:]) <= 7], "1~7 밖의 chapter id 존재")

anchors = [href[1:] for href in parser.hrefs if href.startswith("#") and len(href) > 1]
missing = sorted(set(anchors) - set(parser.ids))
require(not missing, f"대상이 없는 내부 앵커: {missing}")

require(id_counts["timeline"] == 0, "공식 타임라인 섹션이 남아 있음")
require("공식 타임라인" not in html, "공식 타임라인 제목이 남아 있음")

try:
    transcript = json.loads(TRANSCRIPT.read_text(encoding="utf-8"))
except Exception as exc:
    transcript = {}
    errors.append(f"transcript-ko.json 파싱 실패: {exc}")
try:
    source_transcript = json.loads(SOURCE_TRANSCRIPT.read_text(encoding="utf-8"))
except Exception as exc:
    source_transcript = {}
    errors.append(f"transcript.json 파싱 실패: {exc}")
segments = transcript.get("segments", [])
source_segments = source_transcript.get("segments", [])
chapters = transcript.get("chapters", [])
highlights = transcript.get("highlights", [])
paragraphs = transcript.get("paragraphs", [])
require(transcript.get("language") == "ko", "전사 language는 ko여야 함")
require(transcript.get("sourceLanguage") == "zh", "전사 sourceLanguage는 zh여야 함")
require(len(segments) == 8142, f"전사 구간은 8,142개여야 함: {len(segments)}개")
require(len(source_segments) == 8142, f"원문 전사 구간은 8,142개여야 함: {len(source_segments)}개")
require(len(chapters) == 7, f"전사 장은 7개여야 함: {len(chapters)}개")
require(len(highlights) == 35, f"중요 지점은 35개여야 함: {len(highlights)}개")
require(100 < len(paragraphs) < len(segments), f"의미 단락 수 오류: {len(paragraphs)}개")
if paragraphs:
    require(paragraphs[0].get("segmentStartId") == 0, "첫 단락은 segment 0부터 시작해야 함")
    require(paragraphs[-1].get("segmentEndId") == 8141, "마지막 단락은 segment 8141까지 포함해야 함")
    for index, paragraph in enumerate(paragraphs):
        require(paragraph.get("id") == index, f"단락 id 오류: {index}")
        require(paragraph.get("segmentStartId", math.inf) <= paragraph.get("segmentEndId", -math.inf), f"단락 범위 오류: {index}")
        if index:
            require(paragraph.get("segmentStartId") == paragraphs[index - 1].get("segmentEndId") + 1, f"단락 범위 누락/중복: {index}")
        text = paragraph.get("text", "").strip()
        require(not text or re.search(r"[.!?…][\"'”’）)\]]*$", text), f"단락 문장부호 누락: {index}")
    require(all(any(
        paragraph.get("segmentStartId") <= item.get("segmentStartId") <= paragraph.get("segmentEndId")
        for paragraph in paragraphs
    ) for item in highlights), "중요 지점을 포함하는 단락 누락")
require([item.get("id") for item in segments] == list(range(8142)), "전사 segment id가 0~8141 연속이 아님")
require(all(set(item) == {"id", "start", "end", "text"} for item in segments), "전사 segment 필드 오류")
require(all(
    not source.get("text", "").strip() or translated.get("text", "").strip()
    for source, translated in zip(source_segments, segments)
), "원문이 비어 있지 않은 구간에 빈 한국어 번역 존재")
non_korean = [
    item.get("id") for item in segments
    if item.get("text", "").strip()
    and not re.search(r"[가-힣]", item["text"])
    and not re.fullmatch(r"[\d\s.,!?]+", item["text"])
]
require(not non_korean, f"한국어 없이 외국어만 남은 전사 구간: {non_korean[:20]}")
require({item.get("anchor") for item in highlights} == {f"topic-{number}" for number in range(1, 36)}, "중요 지점 anchor 누락")
number = lambda value: isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
require(all(number(item.get(key)) for item in segments for key in ("start", "end")), "전사 시간에 유한수가 아닌 값 존재")
require(all(item.get("start", math.inf) <= item.get("end", -math.inf) for item in segments), "전사 구간에 start > end 존재")
start_regressions = [a.get("id") for a, b in zip(segments, segments[1:]) if a.get("start", math.inf) > b.get("start", -math.inf)]
require(start_regressions == [1968, 6726], f"예상 밖의 전사 start 순서 감소: {start_regressions}")
require(all(segments[index].get("end") == segments[index].get("start") for index in start_regressions), "ASR start 역전 구간이 zero-length로 clamp되지 않음")
if segments:
    transcript_start, transcript_end = segments[0].get("start"), segments[-1].get("end")
    require(all(
        number(item.get("start")) and number(item.get("end"))
        and transcript_start <= item["start"] < item["end"] <= transcript_end
        and 0 <= item.get("segmentStartId", -1) <= item.get("segmentEndId", -1) < len(segments)
        for item in chapters
    ), "장 시간/segment 경계 오류")
    require(all(chapters[index]["end"] == chapters[index + 1]["start"] for index in range(len(chapters) - 1)), "장 경계가 연속적이지 않음")
    require(all(
        isinstance(item.get("chapter"), int) and 1 <= item["chapter"] <= len(chapters)
        and number(item.get("start")) and number(item.get("end"))
        and chapters[item["chapter"] - 1]["start"] <= item["start"] < item["end"] <= chapters[item["chapter"] - 1]["end"]
        and 0 <= item.get("segmentStartId", -1) <= item.get("segmentEndId", -1) < len(segments)
        for item in highlights
    ), "중요 지점 시간/segment/장 경계 오류")

for asset in parser.stylesheets + parser.scripts:
    if not urlsplit(asset).scheme:
        require((ROOT / asset).is_file(), f"로컬 자산 누락: {asset}")
require("styles.css" in parser.stylesheets, "styles.css 연결 누락")
require("script.js" in parser.scripts, "script.js 연결 누락")
require(balanced_css(css), "CSS 괄호·문자열·주석 균형 오류")
require(JS.is_file() and JS.stat().st_size > 0, "script.js 누락 또는 빈 파일")

if errors:
    print("검증 실패:")
    for error in errors:
        print(f"- {error}")
    sys.exit(1)

print("정적 검증 통과")
print("- 중요 지점: 35개 (topic-1~35, 각각 1회)")
print("- 장: 7개 (chapter-1~7, 각각 1회)")
print("- 전체 한국어 번역 전사: 8,142개 구간, language=ko, sourceLanguage=zh, 번역 누락 0개")
print(f"- 내부 href: {len(anchors)}개, 누락 대상 0개")
print("- 공식 타임라인 섹션: 제거됨")
print("- HTML 파싱/CSS 균형/로컬 자산: 정상")
print("- canonical/Open Graph/Twitter 원본 HTML 메타: 정상")
print("- OG 이미지: JPEG, RGB, 1200×630, 500KB 이하")
