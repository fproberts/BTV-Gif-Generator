import os
import glob
from PIL import Image

def stitch_gifs(output_filename="mega_mix.gif"):
    # Path to uploads
    # Assumes script is run from project root
    uploads_dir = os.path.join(os.getcwd(), 'public', 'uploads')
    
    # Find all matching GIFs
    gif_pattern = os.path.join(uploads_dir, '*_1px_scroll.gif')
    # Sort files to have a consistent order (by filename)
    gif_files = sorted(glob.glob(gif_pattern))
    
    if not gif_files:
        print(f"No '_1px_scroll.gif' files found in {uploads_dir}")
        return

    print(f"Found {len(gif_files)} GIFs to stitch.")

    all_frames = []
    default_duration = 50 

    for gif_path in gif_files:
        filename = os.path.basename(gif_path)
        print(f"Processing: {filename}...")
        try:
            with Image.open(gif_path) as img:
                # Use duration from the image if available, else default
                duration = img.info.get('duration', default_duration)
                
                # Extract all frames
                frames_in_this_gif = []
                for i in range(getattr(img, 'n_frames', 1)):
                    img.seek(i)
                    frames_in_this_gif.append(img.copy().convert('RGBA'))
                
                # Append the sequence TWICE (to scroll through twice)
                all_frames.extend(frames_in_this_gif)
                all_frames.extend(frames_in_this_gif)
                
        except Exception as e:
            print(f"Error processing {filename}: {e}")

    if not all_frames:
        print("No frames collected.")
        return

    print(f"Total frames collected: {len(all_frames)}")
    print(f"Saving to {output_filename}...")

    # Save the consolidated GIF
    # Convert first frame to palette mode to ensure GIF compatibility if they were RGBA
    # But for GIFs, typically 'P' mode is used. 
    # The previous generator saved them. Let's try saving directly.
    # Note: Mixing palettes can be tricky. converting to valid P mode with global palette or per-frame.
    # 'save_all=True' with 'append_images' handles this usually by generating local palettes if needed.
    
    all_frames[0].save(
        output_filename,
        save_all=True,
        append_images=all_frames[1:],
        duration=default_duration, 
        loop=0,
        disposal=2, # Restore to background color (helps with transparency artifacts)
        optimize=False
    )
    print(f"✅ Success! Saved as {output_filename}")

if __name__ == "__main__":
    stitch_gifs()
