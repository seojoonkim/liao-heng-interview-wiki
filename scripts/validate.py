#!/usr/bin/env python3
"""정적 위키의 콘텐츠 불변 조건과 기본 문법을 검사한다."""
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
import json
import math
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
HTML = ROOT / "index.html"
CSS = ROOT / "styles.css"
JS = ROOT / "script.js"
TRANSCRIPT = ROOT / "transcript.json"
errors = []


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

timestamps = []
for href in parser.hrefs:
    parsed = urlsplit(href)
    if "bilibili.com" in parsed.netloc.lower() and re.search(r"(?:^|&)t=\d+(?:&|$)", parsed.query):
        timestamps.append(href)
require(len(timestamps) >= 7, f"공식 장 타임스탬프 링크 부족: {len(timestamps)}개")

try:
    transcript = json.loads(TRANSCRIPT.read_text(encoding="utf-8"))
except Exception as exc:
    transcript = {}
    errors.append(f"transcript.json 파싱 실패: {exc}")
segments = transcript.get("segments", [])
chapters = transcript.get("chapters", [])
highlights = transcript.get("highlights", [])
require(len(segments) == 8142, f"전사 구간은 8,142개여야 함: {len(segments)}개")
require(len(chapters) == 7, f"전사 장은 7개여야 함: {len(chapters)}개")
require(len(highlights) == 35, f"중요 지점은 35개여야 함: {len(highlights)}개")
require([item.get("id") for item in segments] == list(range(8142)), "전사 segment id가 0~8141 연속이 아님")
require(all(set(item) == {"id", "start", "end", "text"} for item in segments), "전사 segment 필드 오류")
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
print("- 전체 중국어 ASR 전사: 8,142개 구간, id 0~8141 연속")
print(f"- 내부 href: {len(anchors)}개, 누락 대상 0개")
print(f"- 공식 장 Bilibili 타임스탬프: {len(timestamps)}개")
print("- HTML 파싱/CSS 균형/로컬 자산: 정상")
