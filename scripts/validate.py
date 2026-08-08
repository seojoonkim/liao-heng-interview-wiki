#!/usr/bin/env python3
"""정적 위키의 콘텐츠 불변 조건과 기본 문법을 검사한다."""
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
HTML = ROOT / "index.html"
CSS = ROOT / "styles.css"
JS = ROOT / "script.js"
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
require(len(timestamps) >= 35, f"Bilibili 타임스탬프 링크 부족: {len(timestamps)}개")

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
print("- 주제: 35개 (topic-1~35, 각각 1회)")
print("- 장: 7개 (chapter-1~7, 각각 1회)")
print(f"- 내부 href: {len(anchors)}개, 누락 대상 0개")
print(f"- Bilibili 타임스탬프: {len(timestamps)}개")
print("- HTML 파싱/CSS 균형/로컬 자산: 정상")
