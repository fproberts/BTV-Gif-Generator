import sys
from PIL import Image

def resize_and_slide_image_to_gif(image_path):
    """
    Resizes the original image to 96 pixels wide (maintaining aspect ratio), 
    then slices it using a 16px tall sliding window that moves 1px per frame.

    Args:
        image_path (str): The file path to the input image (e.g., 'my_photo.jpg').
    """
    # --- 1. Configuration (Finalized for LED Screen) ---
    FRAME_HEIGHT = 16        # The height of the LED screen (16px)
    STEP_SIZE = 1            # **CHANGE: 1 pixel slide down per frame for maximum smoothness**
    TARGET_WIDTH = 96        # The width of the LED screen (96px)
    GIF_DURATION_MS = 50     # Time delay between frames in milliseconds (Adjust for speed)
    # --- End Configuration ---
    
    try:
        img = Image.open(image_path)
    except FileNotFoundError:
        print(f"Error: Image file not found at '{image_path}'")
        return
    except Exception as e:
        print(f"Error opening image: {e}")
        return

    original_width, original_height = img.size
    print(f"Original Image: {original_width}x{original_height} pixels.")
    
    # 2. Resize the image to the target width (96px) while maintaining aspect ratio
    
    # Calculate the new height based on the aspect ratio
    aspect_ratio = original_height / original_width
    new_height = int(TARGET_WIDTH * aspect_ratio)
    
    if new_height < FRAME_HEIGHT:
        print(f"Error: The image is too short! After resizing to {TARGET_WIDTH}px wide, the height is only {new_height}px, which is shorter than the frame height ({FRAME_HEIGHT}px).")
        return

    # Use LANCZOS for high-quality downsampling/resizing
    resized_img = img.resize((TARGET_WIDTH, new_height), Image.Resampling.LANCZOS)
    
    current_width, current_height = resized_img.size
    print(f"Resized Image: **{current_width}x{current_height}** pixels.")
    print(f"Target GIF Frame: **{TARGET_WIDTH}x{FRAME_HEIGHT}** pixels.")
    print(f"Scrolling by **{STEP_SIZE}px** per frame.")

    frames = []
    
    # 3. Loop and crop using a sliding window on the resized image
    upper = 0
    frame_count = 0
    max_upper = current_height - FRAME_HEIGHT
    
    while upper <= max_upper:
        # The cropping box is now (0, upper, TARGET_WIDTH, lower)
        left = 0
        right = TARGET_WIDTH
        lower = upper + FRAME_HEIGHT
        
        frame_img = resized_img.crop((left, upper, right, lower))
        frames.append(frame_img)
        
        frame_count += 1
        upper += STEP_SIZE
        
        if frame_count % 1000 == 0: # Increased print frequency due to high frame count
            print(f" - Created {frame_count} frames so far...")

    # 4. Explicitly add the final frame anchored to the bottom
    # Ensures the absolute last pixels are always captured.
    if upper > max_upper or frame_count == 0:
        final_upper = max(0, current_height - FRAME_HEIGHT)
        final_frame_img = resized_img.crop((0, final_upper, TARGET_WIDTH, current_height))
        
        if not frames or frames[-1].getbbox()[1] != final_upper:
             frames.append(final_frame_img)
             frame_count += 1
             print(f" - Added final frame anchored at Y={final_upper}")

    print(f"\nCreated a total of **{frame_count}** frames.")

    # 5. Save the frames as an animated GIF
    output_path = image_path.rsplit('.', 1)[0] + '_1px_scroll.gif'
    
    if frames:
        frames[0].save(
            output_path,
            save_all=True,
            append_images=frames[1:],
            duration=GIF_DURATION_MS,
            loop=0,
            optimize=True 
        )
        print(f"\n✅ Success! 1px scrolling GIF saved to: **{output_path}**")
    else:
        print("\n❌ Error: No frames were created.")


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python your_script_name.py <path_to_image_file>")
        sys.exit(1)
    
    image_file = sys.argv[1]
    resize_and_slide_image_to_gif(image_file)
