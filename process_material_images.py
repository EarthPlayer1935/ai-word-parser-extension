import os
from PIL import Image

TARGET_WIDTH = 640
TARGET_HEIGHT = 400
BG_COLOR = (105, 240, 174)
MATERIAL_DIR = 'material'

def process_image(img_path):
    try:
        with Image.open(img_path) as img:
            # Convert to RGB
            if img.mode != 'RGB':
                img = img.convert('RGB')
            
            # Create background
            new_img = Image.new('RGB', (TARGET_WIDTH, TARGET_HEIGHT), BG_COLOR)
            
            # Calculate resize dimensions to FIT within the target area (preserve aspect ratio)
            img.thumbnail((TARGET_WIDTH, TARGET_HEIGHT), Image.Resampling.LANCZOS)
            
            # Calculate centering position
            # img.size is now the resized size after thumbnail
            width, height = img.size
            left = (TARGET_WIDTH - width) // 2
            top = (TARGET_HEIGHT - height) // 2
            
            # Paste centered
            new_img.paste(img, (left, top))
            
            # Save
            # Determine output filename. If input is 'foo.png', output is 'foo_640x400.png'
            # If input is already 'foo_640x400.png', we might be overwriting it, which is fine.
            # However, the script looks for files NOT containing '_640x400' to avoid reprocessing processed files if run blindly.
            # But here we want to RE-process the originals based on new requirements.
            
            base_name = os.path.splitext(os.path.basename(img_path))[0]
            if base_name.endswith('_640x400'):
                 # Skip valid output files from previous runs to avoid recursion if we were iterating over them,
                 # but we should strictly look for source images.
                 # Let's assume source images don't have _640x400.
                 return

            new_filename = f"{base_name}_640x400.png"
            new_path = os.path.join(MATERIAL_DIR, new_filename)
            
            new_img.save(new_path, format='PNG')
            print(f"Processed {os.path.basename(img_path)} -> {new_filename} (Centered, Pad RGB{BG_COLOR})")
            
    except Exception as e:
        print(f"Failed to process {img_path}: {e}")

def main():
    # Only process original images, ignoring the ones we just created (ending in _640x400)
    images = [f for f in os.listdir(MATERIAL_DIR) if f.lower().endswith(('.png', '.jpg', '.jpeg')) and '_640x400' not in f]
    
    if not images:
        print("No source images found.")
        return

    print(f"Found {len(images)} source images to process...")
    for img_name in images:
        process_image(os.path.join(MATERIAL_DIR, img_name))

if __name__ == "__main__":
    main()
