#!/usr/bin/env python3
"""Build the deterministic 1200×630 social card and record its layout contract."""
from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "liao-heng-portrait.webp"
OUTPUT = ROOT / "assets" / "og-liao-heng-right-type-v3.jpg"
CONTRACT = ROOT / "assets" / "og-liao-heng-right-type-v3.json"
FONT = Path("/System/Library/Fonts/AppleSDGothicNeo.ttc")

W, H = 1200, 630
# Measured once from the source frame (658×370), then locked as build input.
SOURCE_FACE_CENTER = (340, 150)
IMAGE_X = 270
TEXT_RIGHT = 650

source = Image.open(SOURCE).convert("RGB")
scale = max(W / source.width, H / source.height)
resized = source.resize((round(source.width * scale), round(source.height * scale)), Image.Resampling.LANCZOS)
y = (H - resized.height) // 2

# Atmospheric full-bleed base; the sharp frame is deliberately translated right.
base = resized.resize((W, H), Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(18))
base = ImageEnhance.Brightness(base).enhance(0.56)
base.paste(resized, (IMAGE_X, y))

# Strong editorial veil: opaque under copy, then a long smooth falloff toward the portrait.
overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
pixels = overlay.load()
assert pixels is not None
for x in range(W):
    if x <= 470:
        alpha = 232
    elif x <= 760:
        alpha = round(232 + (42 - 232) * ((x - 470) / 290))
    else:
        alpha = max(0, round(42 * (1 - (x - 760) / 310)))
    for yy in range(H):
        pixels[x, yy] = (11, 15, 20, alpha)
card = Image.alpha_composite(base.convert("RGBA"), overlay)

draw = ImageDraw.Draw(card)
def font(size, index=0):
    return ImageFont.truetype(str(FONT), size=size, index=index)

accent = (245, 204, 65, 255)
white = (255, 255, 255, 255)
muted = (224, 226, 230, 255)
text_runs = [
    ((78, 108), "화웨이 반도체 수석과학자", 31, accent),
    ((76, 170), "랴오헝 인터뷰", 78, white),
    ((80, 288), "반도체와 AI 시스템을 관통한", 34, muted),
    ((80, 340), "4시간 38분", 34, muted),
]
text_bounds = []
for position, text, size, color in text_runs:
    text_font = font(size)
    draw.text(position, text, font=text_font, fill=color, stroke_width=1 if size == 78 else 0, stroke_fill=color)
    text_bounds.append(draw.textbbox(position, text, font=text_font, stroke_width=1 if size == 78 else 0))

# A small source mark stays inside the copy-safe area without competing with the title.
footer_position = (80, 493)
footer_text = "FIELD NOTES  ·  07 CHAPTERS"
footer_font = font(21)
draw.text(footer_position, footer_text, font=footer_font, fill=(178, 183, 191, 255))
text_bounds.append(draw.textbbox(footer_position, footer_text, font=footer_font))

card.convert("RGB").save(OUTPUT, "JPEG", quality=91, optimize=True, progressive=True)
face_center = {
    "x": round(IMAGE_X + SOURCE_FACE_CENTER[0] * scale),
    "y": round(y + SOURCE_FACE_CENTER[1] * scale),
}
contract = {
    "source": SOURCE.name,
    "output": OUTPUT.name,
    "canvas": [W, H],
    "source_face_center": list(SOURCE_FACE_CENTER),
    "scale": scale,
    "sharp_image_x": IMAGE_X,
    "face_center": face_center,
    "text_safe_right": TEXT_RIGHT,
    "face_text_gap": face_center["x"] - TEXT_RIGHT,
    "gradient_opaque_until_x": 470,
    "gradient_falloff_until_x": 1070,
    "required_label": "화웨이 반도체 수석과학자",
    "font_sizes": [31, 78, 34, 34, 21],
    "text_max_right": max(bound[2] for bound in text_bounds),
    "text_max_bottom": max(bound[3] for bound in text_bounds),
}
CONTRACT.write_text(json.dumps(contract, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"built {OUTPUT.relative_to(ROOT)}; face center x={face_center['x']}; gap={contract['face_text_gap']}px")
