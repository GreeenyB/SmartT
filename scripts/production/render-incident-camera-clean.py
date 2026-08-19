import json
import subprocess
import sys
from pathlib import Path

from PIL import Image


WIDTH = 1920
HEIGHT = 1080
FPS = 25
FRAME_COUNT = 752
FRAME_BYTES = WIDTH * HEIGHT * 3
VISUAL_SUBSTITUTIONS = {87: 86, 88: 86}

SHOTS = [
    {"id": "I00", "name": "Normal", "range": [0, 73], "motion": None, "start": {"scale": 1.0, "center": [960, 540]}, "end": {"scale": 1.0, "center": [960, 540]}},
    {"id": "I01", "name": "Detect", "range": [74, 141], "motion": [74, 89], "start": {"scale": 1.0, "center": [960, 540]}, "end": {"scale": 1.6, "center": [1140, 338]}},
    {"id": "I02", "name": "Notify", "range": [142, 195], "motion": [142, 157], "start": {"scale": 1.6, "center": [1140, 338]}, "end": {"scale": 1.65, "center": [1338, 328]}},
    {"id": "I03", "name": "Alerts Context", "range": [196, 269], "motion": None, "start": {"scale": 1.0, "center": [960, 540]}, "end": {"scale": 1.0, "center": [960, 540]}},
    {"id": "I04", "name": "Evidence", "range": [270, 389], "motion": [270, 287], "start": {"scale": 1.0, "center": [960, 540]}, "end": {"scale": 1.9, "center": [1410, 540]}},
    {"id": "I05", "name": "Location Trend", "range": [390, 542], "motion": None, "start": {"scale": 1.9, "center": [1410, 540]}, "end": {"scale": 1.9, "center": [1410, 540]}},
    {"id": "I06", "name": "Verify", "range": [543, 619], "motion": [543, 552], "start": {"scale": 1.9, "center": [1410, 540]}, "end": {"scale": 2.3, "center": [1503, 405]}},
    {"id": "I07", "name": "Release", "range": [620, 674], "motion": [625, 670], "start": {"scale": 2.3, "center": [1503, 405]}, "end": {"scale": 1.0, "center": [960, 540]}},
    {"id": "I08", "name": "Resolved", "range": [675, 751], "motion": None, "start": {"scale": 1.0, "center": [960, 540]}, "end": {"scale": 1.0, "center": [960, 540]}},
]


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


def shot_for_frame(frame):
    for shot in SHOTS:
        first, last = shot["range"]
        if first <= frame <= last:
            return shot
    raise ValueError(f"No shot covers source frame {frame}")


def camera_at(shot, frame):
    if shot["motion"] is None:
        return shot["end"]["scale"], tuple(shot["end"]["center"])
    motion_start, motion_end = shot["motion"]
    scale = ease(frame, motion_start, motion_end, shot["start"]["scale"], shot["end"]["scale"])
    cx = ease(frame, motion_start, motion_end, shot["start"]["center"][0], shot["end"]["center"][0])
    cy = ease(frame, motion_start, motion_end, shot["start"]["center"][1], shot["end"]["center"][1])
    return scale, (cx, cy)


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


def run(args):
    subprocess.run(args, check=True)


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


def main():
    if len(sys.argv) != 4:
        raise SystemExit("Usage: render-incident-camera-clean.py <source.webm> <output.mp4> <qa.json>")
    source = Path(sys.argv[1]).resolve()
    output = Path(sys.argv[2]).resolve()
    qa_path = Path(sys.argv[3]).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    qa_path.parent.mkdir(parents=True, exist_ok=True)
    if not source.exists():
        raise FileNotFoundError(source)

    decoder = subprocess.Popen(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(source),
            "-map",
            "0:v:0",
            # CRITICAL: stop the decoder after the exact locked Incident frame
            # count. Without this, the parent reads 752 frames and then waits
            # while ffmpeg is still blocked trying to write extra frames into
            # the unread stdout pipe.
            "-frames:v",
            str(FRAME_COUNT),
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
    encoder = subprocess.Popen(
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
            str(output),
        ],
        stdin=subprocess.PIPE,
    )

    raw_cache = {}
    last_raw = None
    padded_tail_frames = []
    written = 0
    for frame in range(FRAME_COUNT):
        raw = decoder.stdout.read(FRAME_BYTES)
        if len(raw) != FRAME_BYTES:
            if last_raw is None or frame < 740:
                raise RuntimeError(f"Source ended early at frame {frame}")
            raw = last_raw
            padded_tail_frames.append(frame)
        else:
            last_raw = raw
        if frame in VISUAL_SUBSTITUTIONS.values():
            raw_cache[frame] = raw
        visual_frame = VISUAL_SUBSTITUTIONS.get(frame, frame)
        image = Image.frombytes("RGB", (WIDTH, HEIGHT), raw_cache.get(visual_frame, raw))
        shot = shot_for_frame(frame)
        scale, center = camera_at(shot, frame)
        encoder.stdin.write(render_frame(image, scale, center).tobytes())
        written += 1

    if decoder.wait() != 0:
        raise RuntimeError("ffmpeg decoder failed")
    encoder.stdin.close()
    if encoder.wait() != 0:
        raise RuntimeError("ffmpeg encoder failed")

    qa = {
        "source": str(source),
        "output": str(output),
        "expected_frames": FRAME_COUNT,
        "written_frames": written,
        "probe": probe_frames(output),
        "shots": SHOTS,
        "camera_source": "Incident Camera v2.1 values from apps/dashboard/output/demo/render_incident_camera_v2.py",
        "native_cursor_source": "Clean recapture with demo cursor hidden and ripple disabled.",
        "padded_tail_frames": padded_tail_frames,
        "pass": written == FRAME_COUNT,
    }
    qa_path.write_text(json.dumps(qa, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output), "qa": str(qa_path), "frames": written}, indent=2))


if __name__ == "__main__":
    main()
