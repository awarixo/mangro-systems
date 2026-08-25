"""
Mangrosystems — Favicon Generator
Generates favicon.png, favicon-32x32.png, apple-touch-icon.png, and favicon.ico
using Syne ExtraBold "M.", matching the site's nav-logo wordmark and orange (#FF6A00).
Run once: python generate_favicon.py
"""

import os
import re
import urllib.request

from PIL import Image, ImageDraw, ImageFont

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
FONT_FILE = os.path.join(SCRIPT_DIR, "Syne-ExtraBold.ttf")

ORANGE = (255, 106, 0, 255)  # #FF6A00, same as --orange in index.html
BG_COLOR = (0, 0, 0, 0)  # transparent
TEXT = "M."
MASTER_SIZE = 512


def is_valid_ttf(path):
    try:
        with open(path, "rb") as f:
            magic = f.read(4)
        return magic in (b"\x00\x01\x00\x00", b"true", b"OTTO")
    except Exception:
        return False


def download_syne_font():
    if os.path.exists(FONT_FILE):
        if is_valid_ttf(FONT_FILE):
            print(f"Font already exists: {FONT_FILE}")
            return True
        os.remove(FONT_FILE)

    print("Downloading Syne ExtraBold from Google Fonts...")
    url = "https://fonts.googleapis.com/css2?family=Syne:wght@800&display=swap"
    user_agents = [
        "Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1)",
        "Mozilla/5.0 (Linux; Android 2.2; Nexus One) AppleWebKit/533.1",
    ]

    css = None
    for ua in user_agents:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": ua})
            css = urllib.request.urlopen(req, timeout=10).read().decode("utf-8")
            if "truetype" in css:
                print(f"  Got TTF response with UA: {ua[:40]}")
                break
        except Exception as e:
            print(f"  Request failed: {e}")

    if not css:
        return False

    match = re.search(r"src:\s*url\(([^)]+)\)\s*format\(['\"]truetype['\"]\)", css)
    if not match:
        print("  No truetype URL found in CSS.")
        return False

    font_url = match.group(1).strip("'\"")
    print(f"  Downloading font from: {font_url}")
    try:
        urllib.request.urlretrieve(font_url, FONT_FILE)
    except Exception as e:
        print(f"  Download failed: {e}")
        return False

    if not is_valid_ttf(FONT_FILE):
        print("  Downloaded file is not a valid TTF. Removing.")
        os.remove(FONT_FILE)
        return False

    print(f"  Saved valid TTF to: {FONT_FILE}")
    return True


def find_fallback_font(size):
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "C:/Windows/Fonts/ariblk.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            print(f"  Using fallback font: {path}")
            return ImageFont.truetype(path, size)
    print("  Using PIL default font (low quality — install Syne for best results)")
    return ImageFont.load_default()


def make_font(size):
    if os.path.exists(FONT_FILE):
        return ImageFont.truetype(FONT_FILE, size)
    return find_fallback_font(size)


def render_master(size, bg_color, on_white=False):
    img = Image.new("RGBA", (size, size), bg_color)
    draw = ImageDraw.Draw(img)

    padding = size * 0.10
    font_size = size
    font = make_font(font_size)

    while font_size > 10:
        bbox = draw.textbbox((0, 0), TEXT, font=font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        if tw <= size - padding * 2 and th <= size - padding * 2:
            break
        font_size -= 2
        font = make_font(font_size)

    bbox = draw.textbbox((0, 0), TEXT, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    x = (size - tw) / 2 - bbox[0]
    y = (size - th) / 2 - bbox[1]

    draw.text((x, y), TEXT, font=font, fill=ORANGE)
    return img


def main():
    ok = download_syne_font()
    if not ok:
        print("Continuing with system fallback font...")

    master = render_master(MASTER_SIZE, BG_COLOR)

    # Transparent PNGs at the sizes browsers/OSs commonly request
    master.resize((192, 192), Image.LANCZOS).save(os.path.join(SCRIPT_DIR, "favicon.png"))
    master.resize((32, 32), Image.LANCZOS).save(os.path.join(SCRIPT_DIR, "favicon-32x32.png"))
    master.resize((16, 16), Image.LANCZOS).save(os.path.join(SCRIPT_DIR, "favicon-16x16.png"))

    # Apple touch icon needs an opaque background (paper white, matching --paper)
    apple = render_master(MASTER_SIZE, (255, 253, 249, 255))
    apple.resize((180, 180), Image.LANCZOS).save(os.path.join(SCRIPT_DIR, "apple-touch-icon.png"))

    # Multi-resolution .ico for older browsers
    ico_sizes = [(16, 16), (32, 32), (48, 48), (64, 64)]
    master.save(
        os.path.join(SCRIPT_DIR, "favicon.ico"),
        format="ICO",
        sizes=ico_sizes,
    )

    print("\nSaved: favicon.png, favicon-32x32.png, favicon-16x16.png, apple-touch-icon.png, favicon.ico")
    print(f"Output dir: {SCRIPT_DIR}")


if __name__ == "__main__":
    main()
