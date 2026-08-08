#!/usr/bin/env python3
"""Translate generated Chinese ASR segments to Korean while preserving IDs/timestamps."""
from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import subprocess
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "transcript.json"
OUTPUT = ROOT / "transcript-ko.json"
CHECKPOINT = ROOT / ".translation-ko"
CLAUDE = "/opt/homebrew/bin/claude"
MODEL = "claude-opus-5"

SCHEMA = json.dumps({
    "type": "object",
    "properties": {
        "translations": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "integer"},
                    "text": {"type": "string"},
                },
                "required": ["id", "text"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["translations"],
    "additionalProperties": False,
}, ensure_ascii=False)

POST_TRANSLATION_OVERRIDES = {
    172: "모든 사람이 연결되고",
    173: "모든 기기가 연결되는 것",
    891: "네",
    1056: "환상의 세계",
    1315: "SGI(에스지아이)",
    1537: "IBM(아이비엠), 델, EMC(이엠씨)",
    1538: "네트워크 어플라이언스",
    1699: "IBM(아이비엠)",
    1700: "HP(에이치피)",
    1980: "운명",
    2059: "에너지 비용",
    2369: "메카트로닉스",
    2468: "문화적 배경이",
    2529: "짚어드리겠습니다",
    2550: "텐서 코어",
    2645: "R1(알원)",
    2769: "의식",
    3172: "관점",
    3179: "오만함",
    3200: "우리는 할 수 있다",
    3201: "다른 누구도 할 수 없다",
    3411: "네",
    3493: "새로운 테이프아웃",
    3953: "네",
    4008: "단일 명령 다중 스레딩",
    4520: "네",
    5899: "SSD(에스에스디)",
    6275: "디지털화된 세계",
    6401: "아무도",
    6404: "아무도 이기지 못합니다",
    6405: "미국에서의 한 방",
    6412: "저는 중국에 오래 투자하고 싶습니다",
    6436: "MISOS(미소스)",
    6625: "왜일까요",
    6637: "이건 새로운 것입니다",
    6638: "오래된 것이 아닙니다",
    6650: "AI는 새로운 것입니다",
    6782: "이건 새로운 사업입니다",
    6799: "네",
    6829: "그럴 가치가 없습니다",
    6830: "아무것도 아닙니다",
    6852: "모든 것이 새로웠습니다",
    6921: "언제나",
    6970: "누가 미래를 정의할 것인가",
    6985: "네",
    6986: "여기에 미래가 있습니다",
    6987: "이것이 당신이 해나갈 방법입니다",
    7268: "놀랍게도",
    7416: "실리콘밸리",
    7604: "폰 노이만",
    7747: "적절한 시기",
    7748: "적절한 장소",
    7749: "적절한 요소",
    7756: "혁신가의 딜레마",
    7832: "일론 머스크",
    7922: "DEC(디이씨)",
    7923: "디지털 이큅먼트",
    8087: "메타유",
}

PROMPT = """아래 JSON은 중국어 자동 음성 인식(ASR) 인터뷰의 연속 구간이다. 각 항목의 id를 그대로 유지하면서 text만 자연스럽고 정확한 한국어로 번역하라.

번역 원칙:
- 내용을 요약·삭제·추가하지 말고 모든 발화를 번역한다.
- 앞뒤 구간이 이어지는 구어체임을 고려하되 각 id에는 해당 구간의 번역만 넣는다.
- 반도체·AI 기술 용어, 제품명, 회사명, 인명, 수치와 영문 약어를 정확히 보존한다.
- Huawei는 화웨이, Ascend/昇腾은 어센드, Moore's Law/摩尔定律은 무어의 법칙으로 표기한다.
- 불확실하거나 깨진 ASR도 임의로 새로운 사실을 만들지 말고 가능한 의미만 옮긴다.
- 마크다운, 주석, 화자 라벨을 넣지 않는다.
- 반드시 입력과 같은 개수·순서·id로 structured output을 반환한다.

입력 JSON:
"""


def load_source() -> dict:
    with SOURCE.open(encoding="utf-8") as f:
        data = json.load(f)
    segments = data.get("segments", [])
    if len(segments) != 8142 or [s.get("id") for s in segments] != list(range(8142)):
        raise SystemExit("source segment contract failed")
    return data


def chunks(items: list[dict], size: int) -> list[list[dict]]:
    return [items[i:i + size] for i in range(0, len(items), size)]


def checkpoint_path(batch: list[dict]) -> Path:
    return CHECKPOINT / f"{batch[0]['id']:04d}-{batch[-1]['id']:04d}.json"


def validate_batch(batch: list[dict], rows: list[dict]) -> None:
    expected = [item["id"] for item in batch]
    actual = [item.get("id") for item in rows]
    if actual != expected:
        raise ValueError(f"id mismatch: expected {expected[0]}..{expected[-1]}, got {actual[:2]}..{actual[-2:]}")
    for src, row in zip(batch, rows):
        if not isinstance(row.get("text"), str):
            raise ValueError(f"non-string translation at {src['id']}")
        if src["text"].strip() and not row["text"].strip():
            raise ValueError(f"empty translation at {src['id']}")


def translate_batch(batch: list[dict], attempts: int = 3) -> list[dict]:
    path = checkpoint_path(batch)
    if path.exists():
        rows = json.loads(path.read_text(encoding="utf-8"))
        validate_batch(batch, rows)
        return rows

    payload = json.dumps([{"id": x["id"], "text": x["text"]} for x in batch], ensure_ascii=False, separators=(",", ":"))
    prompt = PROMPT + payload
    env = os.environ.copy()
    env["HOME"] = "/Users/gimseojun"
    env.pop("ANTHROPIC_API_KEY", None)
    last_error = ""
    for attempt in range(1, attempts + 1):
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
        try:
            envelope = json.loads(proc.stdout)
            if proc.returncode != 0 or envelope.get("is_error"):
                raise ValueError(envelope.get("result") or proc.stderr or f"exit {proc.returncode}")
            if MODEL not in envelope.get("modelUsage", {}):
                raise ValueError(f"wrong model: {list(envelope.get('modelUsage', {}))}")
            structured = envelope.get("structured_output")
            if not isinstance(structured, dict):
                raise ValueError("missing structured_output")
            rows = structured.get("translations")
            if not isinstance(rows, list):
                raise ValueError("missing translations array")
            validate_batch(batch, rows)
            path.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
            print(f"OK {batch[0]['id']:04d}-{batch[-1]['id']:04d}", flush=True)
            return rows
        except Exception as exc:
            last_error = str(exc)
            print(f"RETRY {batch[0]['id']:04d}-{batch[-1]['id']:04d} attempt={attempt}: {last_error}", flush=True)
            time.sleep(attempt * 2)
    raise RuntimeError(f"batch {batch[0]['id']}-{batch[-1]['id']} failed: {last_error}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch-size", type=int, default=350)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()

    source = load_source()
    if args.verify_only:
        if not OUTPUT.exists():
            raise SystemExit("missing transcript-ko.json")
        translated = json.loads(OUTPUT.read_text(encoding="utf-8"))
        rows = translated.get("segments", [])
        if len(rows) != 8142 or [x.get("id") for x in rows] != list(range(8142)):
            raise SystemExit("translated segment contract failed")
        missing = [x["id"] for x in rows if source["segments"][x["id"]]["text"].strip() and not x.get("text", "").strip()]
        if missing:
            raise SystemExit(f"missing translations: {missing[:10]}")
        print("한국어 전사 검증 통과: 8,142개, 누락 0개")
        return

    CHECKPOINT.mkdir(exist_ok=True)
    work = chunks(source["segments"], args.batch_size)
    completed: dict[int, list[dict]] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        future_map = {pool.submit(translate_batch, batch): index for index, batch in enumerate(work)}
        for future in concurrent.futures.as_completed(future_map):
            completed[future_map[future]] = future.result()

    translations = [row for index in range(len(work)) for row in completed[index]]
    validate_batch(source["segments"], translations)
    output = {**source, "language": "ko", "sourceLanguage": "zh", "translationModel": MODEL}
    output["segments"] = [
        {
            "id": src["id"],
            "start": src["start"],
            "end": src["end"],
            "text": POST_TRANSLATION_OVERRIDES.get(src["id"], ko["text"]),
        }
        for src, ko in zip(source["segments"], translations)
    ]
    tmp = OUTPUT.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(OUTPUT)
    print(f"WROTE {OUTPUT}: {len(output['segments'])} segments")


if __name__ == "__main__":
    main()
