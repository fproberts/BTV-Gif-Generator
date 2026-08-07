#!/usr/bin/env python3
"""
Image to 96x16 Scrolling GIF Generator
======================================
Resizes an input image to 96px wide and creates a 16px vertical sliding window GIF.
Supports customizable scroll speed (duration in ms per frame) and step size.
"""

import argparse
import sys
from PIL import Image

def resize_and_slide_image_to_gif(
    image_path: str,
    output_path: str = None,
    frame_height: int = 16,
    target_width: int = 96,
    step_size: int = 1,
    duration_ms: int = 100,
    loop_count: int = 0
) -> str:
    try:
        img = Image.open(image_path)
    except FileNotFoundError:
        print(f"Error: Image file not found at '{image_path}'")
        return None
    except Exception as e:
        print(f"Error opening image: {e}")
        return None

    original_width, original_height = img.size
    print(f"Original Image: {original_width}x{original_height} pixels.")

    # Calculate new height maintaining aspect ratio
    aspect_ratio = original_height / original_width
    new_height = int(target_width * aspect_ratio)

    if new_height < frame_height:
        print(f"Warning: Image height ({new_height}px) is shorter than target frame height ({frame_height}px). Padding with black.")
        canvas = Image.new("RGB", (target_width, frame_height), (0, 0, 0))
        resized_img = img.resize((target_width, new_height), Image.Resampling.LANCZOS)
        offset_y = (frame_height - new_height) // 2
        canvas.paste(resized_img, (0, offset_y))
        resized_img = canvas
        new_height = frame_height

    else:
        resized_img = img.resize((target_width, new_height), Image.Resampling.LANCZOS)

    current_width, current_height = resized_img.size
    print(f"Resized Image: {current_width}x{current_height} pixels.")
    print(f"Target GIF Frame: {target_width}x{frame_height} pixels.")
    print(f"Scrolling by {step_size}px per frame at {duration_ms}ms per frame.")

    frames = []
    upper = 0
    max_upper = max(0, current_height - frame_height)

    if max_upper == 0:
        # Static image case
        frames.append(resized_img.crop((0, 0, target_width, frame_height)))
    else:
        while upper <= max_upper:
            frame_img = resized_img.crop((0, upper, target_width, upper + frame_height))
            frames.append(frame_img)
            upper += step_size

        # Add pause on final frame if scrolling
        if len(frames) > 1:
            for _ in range(5): # Hold final frame for half a second
                frames.append(frames[-1])

    if not output_path:
        output_path = image_path.rsplit('.', 1)[0] + '_1px_scroll.gif'

    if frames:
        # Save as optimized palette GIF
        frames[0].save(
            output_path,
            save_all=True,
            append_images=frames[1:],
            duration=duration_ms,
            loop=loop_count,
            optimize=True,
            disposal=2
        )
        print(f"✅ Saved GIF to: {output_path} ({len(frames)} frames)")
        return output_path
    else:
        print("❌ Error: No frames were created.")
        return None


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Generate 96x16 scrolling GIF")
    parser.add_argument("image_path", help="Path to input image")
    parser.add_argument("--output", "-o", help="Output GIF path")
    parser.add_argument("--step", "-s", type=int, default=2, help="Pixel step size per frame (default: 2)")
    parser.add_argument("--delay", "-d", type=int, default=100, help="Frame delay in ms (default: 100ms)")

    args = parser.parse_args()
    resize_and_slide_image_to_gif(
        args.image_path,
        output_path=args.output,
        step_size=args.step,
        duration_ms=args.delay
    )
