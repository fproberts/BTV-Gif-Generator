import os
import glob
import shutil

def collect_gifs(output_folder="collected_gifs"):
    # Path to uploads
    uploads_dir = os.path.join(os.getcwd(), 'public', 'uploads')
    target_dir = os.path.join(os.getcwd(), output_folder)
    
    # Create target directory if it doesn't exist
    if not os.path.exists(target_dir):
        os.makedirs(target_dir)
        print(f"Created directory: {target_dir}")
    else:
        print(f"Using existing directory: {target_dir}")

    # Find all matching GIFs
    gif_pattern = os.path.join(uploads_dir, '*_1px_scroll.gif')
    gif_files = glob.glob(gif_pattern)
    
    if not gif_files:
        print(f"No '_1px_scroll.gif' files found in {uploads_dir}")
        return

    print(f"Found {len(gif_files)} GIFs. Copying to '{output_folder}'...")

    count = 0
    for gif_path in gif_files:
        filename = os.path.basename(gif_path)
        dest_path = os.path.join(target_dir, filename)
        
        try:
            shutil.copy2(gif_path, dest_path)
            count += 1
            # print(f"Copied: {filename}") # Optional: uncomment if verbose needed
        except Exception as e:
            print(f"Error copying {filename}: {e}")

    print(f"\n✅ Success! Copied {count} GIFs to: {target_dir}")
    print(f"You can now transfer the '{output_folder}' folder to your phone.")

if __name__ == "__main__":
    collect_gifs()
