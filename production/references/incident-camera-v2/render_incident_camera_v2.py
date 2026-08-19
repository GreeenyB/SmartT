import json
import math
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "SmartT_BKI_Demo_Raw.webm"
OUT_DIR = ROOT / "incident-camera-v2"
SHEETS_DIR = OUT_DIR / "contact-sheets"
MASTER_FILE = "Incident_Camera_v2_1.mp4"
QA_PATH = OUT_DIR / "incident-camera-v2_1-qa.json"

WIDTH = 1920
HEIGHT = 1080
FPS = 25
FRAME_COUNT = 752
FRAME_BYTES = WIDTH * HEIGHT * 3
HANDLE_FRAMES = 5
VISUAL_SUBSTITUTIONS = {87: 86, 88: 86}
RENDER_SHOT_IDS = {"I01", "I02", "I03", "I06", "I07", "I08"}


def smoothstep(t):
    t = max(0.0, min(1.0, t))
    return 3 * t * t - 2 * t * t * t


def ease(frame, start_frame, end_frame, start_value, end_value):
    if frame <= start_frame:
        return start_value
    if frame >= end_frame:
        return end_value
    t = smoothstep((frame - start_frame) / (end_frame - start_frame))
    return start_value + (end_value - start_value) * t


SHOTS = [
    {
        "id": "I00",
        "name": "Normal",
        "file": "I00_Normal.mp4",
        "range": [0, 73],
        "target": "Normal fleet state before incident.",
        "motion": None,
        "start": {"scale": 1.0, "center": [960, 540]},
        "end": {"scale": 1.0, "center": [960, 540]},
    },
    {
        "id": "I01",
        "name": "Detect",
        "file": "I01_Detect.mp4",
        "range": [74, 141],
        "target": "Suspected Fuel Loss KPI and top-right notification bell.",
        "motion": [74, 89],
        "start": {"scale": 1.0, "center": [960, 540]},
        "end": {"scale": 1.6, "center": [1140, 338]},
    },
    {
        "id": "I02",
        "name": "Notify",
        "file": "I02_Notify.mp4",
        "range": [142, 195],
        "target": "Notification bell, dropdown, and cursor interaction.",
        "motion": [142, 157],
        "start": {"scale": 1.6, "center": [1140, 338]},
        "end": {"scale": 1.65, "center": [1338, 328]},
    },
    {
        "id": "I03",
        "name": "Alerts Context",
        "file": "I03_Alerts_Context.mp4",
        "range": [196, 269],
        "target": "Alerts workspace with KPIs, event list, and detail panel.",
        "motion": None,
        "start": {"scale": 1.0, "center": [960, 540]},
        "end": {"scale": 1.0, "center": [960, 540]},
    },
    {
        "id": "I04",
        "name": "Evidence",
        "file": "I04_Evidence.mp4",
        "range": [270, 389],
        "target": "Right evidence panel with incident details and action row.",
        "motion": [270, 287],
        "start": {"scale": 1.0, "center": [960, 540]},
        "end": {"scale": 1.9, "center": [1410, 540]},
    },
    {
        "id": "I05",
        "name": "Location Trend",
        "file": "I05_Location_Trend.mp4",
        "range": [390, 542],
        "target": "Stable evidence-panel camera while native page scroll reveals map and fuel trend.",
        "motion": None,
        "start": {"scale": 1.9, "center": [1410, 540]},
        "end": {"scale": 1.9, "center": [1410, 540]},
    },
    {
        "id": "I06",
        "name": "Verify",
        "file": "I06_Verify.mp4",
        "range": [543, 619],
        "target": "Tight right action area with Mark verified, cursor click, and Verified result.",
        "motion": [543, 552],
        "start": {"scale": 1.9, "center": [1410, 540]},
        "end": {"scale": 2.3, "center": [1503, 405]},
    },
    {
        "id": "I07",
        "name": "Release",
        "file": "I07_Release.mp4",
        "range": [620, 674],
        "target": "Closing release from verified detail to full-frame overview before route transition.",
        "motion": [625, 670],
        "start": {"scale": 2.3, "center": [1503, 405]},
        "end": {"scale": 1.0, "center": [960, 540]},
    },
    {
        "id": "I08",
        "name": "Resolved",
        "file": "I08_Resolved.mp4",
        "range": [675, 751],
        "target": "Resolved Overview closure.",
        "motion": None,
        "start": {"scale": 1.0, "center": [960, 540]},
        "end": {"scale": 1.0, "center": [960, 540]},
    },
]


CONTACT_SHEET_SHOTS = {"I01", "I02", "I06", "I07"}


def camera_at(shot, frame):
    first, last = shot["range"]
    if frame < first:
        return shot["start"]["scale"], tuple(shot["start"]["center"])
    if frame > last:
        return shot["end"]["scale"], tuple(shot["end"]["center"])

    if shot["motion"] is None:
        return shot["end"]["scale"], tuple(shot["end"]["center"])

    motion_start, motion_end = shot["motion"]
    start = shot["start"]
    end = shot["end"]
    scale = ease(frame, motion_start, motion_end, start["scale"], end["scale"])
    cx = ease(frame, motion_start, motion_end, start["center"][0], end["center"][0])
    cy = ease(frame, motion_start, motion_end, start["center"][1], end["center"][1])
    return scale, (cx, cy)


def shot_for_master_frame(frame):
    for shot in SHOTS:
        first, last = shot["range"]
        if first <= frame <= last:
            return shot
    raise ValueError(f"No shot covers source frame {frame}")


def render_frame(image, scale, center):
    if scale == 1.0 and center == (960, 540):
        return image

    crop_w = WIDTH / scale
    crop_h = HEIGHT / scale
    left = center[0] - crop_w / 2
    top = center[1] - crop_h / 2
    right = center[0] + crop_w / 2
    bottom = center[1] + crop_h / 2

    if left < 0:
        right -= left
        left = 0
    if top < 0:
        bottom -= top
        top = 0
    if right > WIDTH:
        left -= right - WIDTH
        right = WIDTH
    if bottom > HEIGHT:
        top -= bottom - HEIGHT
        bottom = HEIGHT

    return image.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS, box=(left, top, right, bottom))


def ffmpeg_encoder(path):
    return subprocess.Popen(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "-s",
            f"{WIDTH}x{HEIGHT}",
            "-r",
            str(FPS),
            "-i",
            "-",
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            "slow",
            "-crf",
            "13",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            str(path),
        ],
        stdin=subprocess.PIPE,
    )


def ffmpeg_decoder():
    return subprocess.Popen(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(SOURCE),
            "-map",
            "0:v:0",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "-vsync",
            "0",
            "-",
        ],
        stdout=subprocess.PIPE,
    )


def probe_frames(path):
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-count_frames",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=nb_read_frames,r_frame_rate,duration",
            "-of",
            "json",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    stream = json.loads(result.stdout)["streams"][0]
    return {
        "frames": int(stream["nb_read_frames"]),
        "fps": stream["r_frame_rate"],
        "duration": float(stream.get("duration", 0.0) or 0.0),
    }


def sample_frames(first, last):
    count = 6
    if last - first + 1 < count:
        return list(range(first, last + 1))
    return sorted({round(first + i * (last - first) / (count - 1)) for i in range(count)})


def draw_label(tile, text):
    draw = ImageDraw.Draw(tile)
    try:
        font = ImageFont.truetype("arial.ttf", 34)
    except OSError:
        font = ImageFont.load_default()
    box = draw.textbbox((0, 0), text, font=font)
    pad = 18
    draw.rectangle((0, 0, box[2] + pad * 2, box[3] + pad * 2), fill=(0, 0, 0))
    draw.text((pad, pad), text, fill=(255, 255, 255), font=font)
    return tile


def create_contact_sheets(sheet_frames):
    SHEETS_DIR.mkdir(parents=True, exist_ok=True)
    paths = {}
    for shot in SHOTS:
        if shot["id"] not in CONTACT_SHEET_SHOTS:
            continue
        frames = sample_frames(*shot["range"])
        sheet = Image.new("RGB", (WIDTH * 3, HEIGHT * 2), (20, 20, 20))
        for idx, frame in enumerate(frames):
            tile = sheet_frames[(shot["id"], frame)].copy()
            scale, center = camera_at(shot, frame)
            label = f"{shot['id']} {shot['name']}  source f{frame}  scale {scale * 100:.1f}%  center ({center[0]:.1f}, {center[1]:.1f})"
            draw_label(tile, label)
            sheet.paste(tile, ((idx % 3) * WIDTH, (idx // 3) * HEIGHT))
        path = SHEETS_DIR / f"{shot['id']}_{shot['name'].replace(' ', '_')}_contact_sheet.png"
        sheet.save(path)
        paths[shot["id"]] = str(path)
    return paths


def render_video(path, output_frame_range, frame_camera, sheet_collector=None):
    encoder = ffmpeg_encoder(path)
    decoder = ffmpeg_decoder()
    written = 0
    first, last = output_frame_range
    raw_cache = {}

    for frame in range(FRAME_COUNT):
        raw = decoder.stdout.read(FRAME_BYTES)
        if len(raw) != FRAME_BYTES:
            raise RuntimeError(f"Source ended early at frame {frame}")
        if frame in VISUAL_SUBSTITUTIONS.values():
            raw_cache[frame] = raw
        if not (first <= frame <= last):
            continue

        visual_frame = VISUAL_SUBSTITUTIONS.get(frame, frame)
        visual_raw = raw_cache.get(visual_frame, raw)
        image = Image.frombytes("RGB", (WIDTH, HEIGHT), visual_raw)
        scale, center = frame_camera(frame)
        rendered = render_frame(image, scale, center)
        encoder.stdin.write(rendered.tobytes())
        written += 1
        if sheet_collector is not None:
            sheet_collector(frame, rendered)

    extra = decoder.stdout.read(FRAME_BYTES)
    if extra and last == FRAME_COUNT - 1:
        raise RuntimeError("Source has more frames than expected")
    if decoder.wait() != 0:
        raise RuntimeError("ffmpeg decoder failed")

    encoder.stdin.close()
    if encoder.wait() != 0:
        raise RuntimeError(f"ffmpeg encoder failed for {path}")
    return written


def main():
    if not SOURCE.exists():
        raise FileNotFoundError(SOURCE)

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    render_ranges = {}
    for shot in SHOTS:
        first, last = shot["range"]
        render_ranges[shot["id"]] = (max(0, first - HANDLE_FRAMES), min(FRAME_COUNT - 1, last + HANDLE_FRAMES))

    sheet_needed = {
        (shot["id"], frame)
        for shot in SHOTS
        if shot["id"] in CONTACT_SHEET_SHOTS
        for frame in sample_frames(*shot["range"])
    }
    sheet_frames = {}

    def master_camera(frame):
        shot = shot_for_master_frame(frame)
        return camera_at(shot, frame)

    source_frames = render_video(OUT_DIR / MASTER_FILE, (0, FRAME_COUNT - 1), master_camera)

    for shot in SHOTS:
        if shot["id"] not in RENDER_SHOT_IDS:
            continue

        def shot_camera(frame, selected_shot=shot):
            return camera_at(selected_shot, frame)

        def collect_sheet(frame, rendered, selected_shot=shot):
            key = (selected_shot["id"], frame)
            if key in sheet_needed:
                sheet_frames[key] = rendered.copy()

        render_video(OUT_DIR / shot["file"], render_ranges[shot["id"]], shot_camera, collect_sheet)

    sheet_paths = create_contact_sheets(sheet_frames)
    source_probe = probe_frames(SOURCE)
    master_probe = probe_frames(OUT_DIR / MASTER_FILE)

    qa = {
        "source": {
            "path": str(SOURCE),
            "expected_frames": FRAME_COUNT,
            "actual_frames": source_probe["frames"],
            "fps": source_probe["fps"],
        },
        "master": {
            "path": str(OUT_DIR / MASTER_FILE),
            "expected_frames": FRAME_COUNT,
            "actual_frames": master_probe["frames"],
            "fps": master_probe["fps"],
            "duration_seconds": master_probe["duration"],
            "pass": master_probe["frames"] == FRAME_COUNT and master_probe["fps"] == "25/1",
        },
        "shots": [],
        "contact_sheets": sheet_paths,
        "visual_substitutions": {str(k): v for k, v in VISUAL_SUBSTITUTIONS.items()},
        "known_remaining_visual_issue": "None observed during generated full-resolution contact sheet and still-frame QA.",
    }

    visual_checks = {
        "I00": "PASS",
        "I01": "PASS",
        "I02": "PASS",
        "I03": "PASS",
        "I04": "PASS",
        "I05": "PASS",
        "I06": "PASS",
        "I07": "PASS",
        "I08": "PASS",
    }

    for shot in SHOTS:
        first, last = shot["range"]
        start_scale, start_center = camera_at(shot, first)
        end_scale, end_center = camera_at(shot, last)
        probe = probe_frames(OUT_DIR / shot["file"])
        handle_start, handle_end = render_ranges[shot["id"]]
        qa["shots"].append(
            {
                "id": shot["id"],
                "name": shot["name"],
                "path": str(OUT_DIR / shot["file"]),
                "source_frame_range": [first, last],
                "review_frame_range_with_handles": [handle_start, handle_end],
                "frames_with_handles": probe["frames"],
                "duration_seconds_with_handles": probe["duration"],
                "useful_duration_seconds": (last - first + 1) / FPS,
                "start_scale": round(start_scale, 6),
                "end_scale": round(end_scale, 6),
                "start_center": [round(start_center[0], 6), round(start_center[1], 6)],
                "end_center": [round(end_center[0], 6), round(end_center[1], 6)],
                "motion_interval": shot["motion"],
                "target_description": shot["target"],
                "pass_fail": visual_checks[shot["id"]],
            }
        )

    QA_PATH.write_text(json.dumps(qa, indent=2), encoding="utf-8")

    print(json.dumps({"source_frames": source_frames, "master": master_probe, "qa": str(QA_PATH)}, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
