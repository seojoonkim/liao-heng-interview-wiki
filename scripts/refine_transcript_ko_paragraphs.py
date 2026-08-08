#!/usr/bin/env python3
"""Refine Korean ASR segments into punctuated, coherent reading paragraphs with Opus 5."""
from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import re
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TRANSCRIPT = ROOT / "transcript-ko.json"
CHECKPOINT = ROOT / ".paragraph-ko"
CLAUDE = "/opt/homebrew/bin/claude"
MODEL = "claude-opus-5"
FINAL_PUNCTUATION = re.compile(r"[.!?…][\"'”’）)\]]*$")

SCHEMA = json.dumps({
    "type": "object",
    "properties": {
        "paragraphs": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "segmentStartId": {"type": "integer"},
                    "segmentEndId": {"type": "integer"},
                    "text": {"type": "string"},
                },
                "required": ["segmentStartId", "segmentEndId", "text"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["paragraphs"],
    "additionalProperties": False,
}, ensure_ascii=False)

PROMPT = """아래는 한 인터뷰의 연속된 한국어 ASR 번역 조각입니다. 이를 독자가 읽기 좋은 한국어 문장과 단락으로 편집하세요.

필수 원칙:
- 입력 내용을 요약·삭제·추가하지 마세요. 머뭇거림과 반복도 의미를 보존하면서 자연스러운 구어 문장으로 정리하세요.
- 조각 사이의 문맥을 연결해 완결된 문장을 만드세요. 단순히 공백으로 이어 붙이지 마세요.
- 쉼표, 마침표, 물음표, 느낌표를 문맥에 맞게 넣으세요. 모든 단락은 반드시 완결 문장부호(. ? ! …)로 끝나야 합니다.
- 한 문장 도중에 단락을 바꾸지 마세요. 보통 2~6개의 관련 문장을 한 단락으로 묶으세요. 짧은 대답이나 질문-답변 전환은 독립 단락이어도 됩니다.
- 각 출력 단락은 연속된 입력 ID 범위를 정확히 나타내야 합니다. 첫 범위부터 마지막 범위까지 ID를 누락·중복 없이 한 번씩 포함하세요.
- forcedStarts의 ID는 반드시 새 단락의 segmentStartId여야 합니다.
- 고유명사, 기술 용어, 수치, 발언 취지를 보존하세요. 화자 라벨이나 마크다운은 넣지 마세요.
- 출력 text에는 타임스탬프를 넣지 마세요.

입력 JSON:
"""


def load_data() -> dict:
    data = json.loads(TRANSCRIPT.read_text(encoding="utf-8"))
    segments = data.get("segments", [])
    if len(segments) != 8142 or [row.get("id") for row in segments] != list(range(8142)):
        raise SystemExit("segment contract failed")
    return data


def mandatory_starts(data: dict) -> set[int]:
    starts = {0}
    starts.update(int(row["segmentStartId"]) for row in data.get("chapters", []))
    return starts


def batch_ranges(data: dict, target_size: int) -> list[tuple[int, int]]:
    inferred = sorted({int(row["segmentStartId"]) for row in data.get("paragraphs", [])} | mandatory_starts(data))
    starts = [0]
    cursor = 0
    total = len(data["segments"])
    while cursor + target_size < total:
        target = cursor + target_size
        candidates = [value for value in inferred if target - 35 <= value <= target + 35 and value > cursor]
        next_start = min(candidates, key=lambda value: abs(value - target)) if candidates else target
        starts.append(next_start)
        cursor = next_start
    return [(start, (starts[index + 1] - 1 if index + 1 < len(starts) else total - 1)) for index, start in enumerate(starts)]


def checkpoint_path(start: int, end: int) -> Path:
    return CHECKPOINT / f"{start:04d}-{end:04d}.json"


def validate_rows(start: int, end: int, forced: set[int], rows: list[dict]) -> None:
    if not rows:
        raise ValueError("empty paragraphs")
    expected = start
    starts = set()
    for index, row in enumerate(rows):
        if set(row) != {"segmentStartId", "segmentEndId", "text"}:
            raise ValueError(f"schema mismatch at {index}")
        row_start = row["segmentStartId"]
        row_end = row["segmentEndId"]
        text = row["text"].strip()
        if row_start != expected or row_end < row_start or row_end > end:
            raise ValueError(f"coverage mismatch at {index}: expected {expected}, got {row_start}-{row_end}")
        if not text or not FINAL_PUNCTUATION.search(text):
            raise ValueError(f"missing text/punctuation at {row_start}-{row_end}: {text[-80:]!r}")
        starts.add(row_start)
        expected = row_end + 1
    if expected != end + 1:
        raise ValueError(f"range ends at {expected - 1}, expected {end}")
    missing = sorted(forced - starts)
    if missing:
        raise ValueError(f"missing forced starts: {missing}")


def refine_batch(data: dict, start: int, end: int, attempts: int = 3) -> list[dict]:
    path = checkpoint_path(start, end)
    forced = {value for value in mandatory_starts(data) if start <= value <= end}
    forced.add(start)
    if path.exists():
        rows = json.loads(path.read_text(encoding="utf-8"))
        validate_rows(start, end, forced, rows)
        return rows

    payload = {
        "range": {"start": start, "end": end},
        "forcedStarts": sorted(forced),
        "segments": [{"id": row["id"], "text": row.get("text", "")} for row in data["segments"][start:end + 1]],
    }
    prompt = PROMPT + json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    env = os.environ.copy()
    env["HOME"] = "/Users/gimseojun"
    env.pop("ANTHROPIC_API_KEY", None)
    last_error = ""
    for attempt in range(1, attempts + 1):
        try:
            proc = subprocess.run([
                CLAUDE, "-p", prompt,
                "--model", MODEL,
                "--effort", "low",
                "--max-turns", "1",
                "--tools", "",
                "--output-format", "json",
                "--json-schema", SCHEMA,
                "--no-session-persistence",
            ], text=True, capture_output=True, env=env, timeout=300)
            envelope = json.loads(proc.stdout)
            if proc.returncode != 0 or envelope.get("is_error"):
                raise ValueError(envelope.get("result") or proc.stderr or f"exit {proc.returncode}")
            if MODEL not in envelope.get("modelUsage", {}):
                raise ValueError(f"wrong model: {list(envelope.get('modelUsage', {}))}")
            structured = envelope.get("structured_output")
            rows = structured.get("paragraphs") if isinstance(structured, dict) else None
            if not isinstance(rows, list):
                raise ValueError("missing paragraphs")
            validate_rows(start, end, forced, rows)
            path.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
            print(f"OK {start:04d}-{end:04d} paragraphs={len(rows)}", flush=True)
            return rows
        except Exception as exc:
            last_error = str(exc)
            print(f"RETRY {start:04d}-{end:04d} attempt={attempt}: {last_error}", flush=True)
            time.sleep(attempt * 2)
    raise RuntimeError(f"batch {start}-{end} failed: {last_error}")


def assemble(data: dict, rows: list[dict]) -> list[dict]:
    segments = data["segments"]
    paragraphs = []
    for index, row in enumerate(rows):
        start_id = row["segmentStartId"]
        end_id = row["segmentEndId"]
        paragraphs.append({
            "id": index,
            "start": segments[start_id]["start"],
            "end": segments[end_id]["end"],
            "segmentStartId": start_id,
            "segmentEndId": end_id,
            "text": row["text"].strip(),
        })
    forced = mandatory_starts(data)
    validate_rows(0, len(segments) - 1, forced, [
        {"segmentStartId": row["segmentStartId"], "segmentEndId": row["segmentEndId"], "text": row["text"]}
        for row in paragraphs
    ])
    return paragraphs


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--batch-size", type=int, default=350)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()
    data = load_data()
    if args.verify_only:
        rows = data.get("paragraphs", [])
        assembled = [{"segmentStartId": row["segmentStartId"], "segmentEndId": row["segmentEndId"], "text": row["text"]} for row in rows]
        validate_rows(0, 8141, mandatory_starts(data), assembled)
        print(f"문맥 단락 검증 통과: {len(rows)}개")
        return

    CHECKPOINT.mkdir(exist_ok=True)
    ranges = batch_ranges(data, args.batch_size)
    completed: dict[int, list[dict]] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(refine_batch, data, start, end): index for index, (start, end) in enumerate(ranges)}
        for future in concurrent.futures.as_completed(futures):
            completed[futures[future]] = future.result()
    rows = [row for index in range(len(ranges)) for row in completed[index]]
    data["paragraphs"] = assemble(data, rows)
    data["paragraphModel"] = MODEL
    tmp = TRANSCRIPT.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(TRANSCRIPT)
    print(f"WROTE {TRANSCRIPT}: {len(data['paragraphs'])} paragraphs")


if __name__ == "__main__":
    main()
