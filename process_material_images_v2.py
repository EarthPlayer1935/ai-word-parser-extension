import os
from PIL import Image, ImageEnhance

TARGET_WIDTH = 640
TARGET_HEIGHT = 400
MATERIAL_DIR = 'material'
BACKGROUND_FILE = 'background.png'

def get_background_base():
    bg_path = os.path.join(MATERIAL_DIR, BACKGROUND_FILE)
    if not os.path.exists(bg_path):
        print(f"Error: Background file {BACKGROUND_FILE} not found.")
        return None

    try:
        with Image.open(bg_path) as img:
            if img.mode != 'RGB':
                img = img.convert('RGB')
            
            # Resize and Crop Background to FILL 640x400
            src_width, src_height = img.size
            src_ratio = src_width / src_height
            target_ratio = TARGET_WIDTH / TARGET_HEIGHT
            
            if src_ratio > target_ratio:
                # Background is wider: Scale by height
                new_height = TARGET_HEIGHT
                new_width = int(new_height * src_ratio)
            else:
                # Background is taller: Scale by width
                new_width = TARGET_WIDTH
                new_height = int(new_width / src_ratio)
            
            img_resized = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
            
            # Center ensure exact crop
            left = (new_width - TARGET_WIDTH) // 2
            top = (new_height - TARGET_HEIGHT) // 2
            right = left + TARGET_WIDTH
            bottom = top + TARGET_HEIGHT
            
            bg_cropped = img_resized.crop((left, top, right, bottom))
            return bg_cropped
            
    except Exception as e:
        print(f"Error processing background: {e}")
        return None

def process_image(img_path, background_base):
    try:
        with Image.open(img_path) as img:
            # We need RGBA for opacity
            if img.mode != 'RGBA':
                img = img.convert('RGBA')
            
            # Resize foreground to FIT INSIDE 640x400 (contain)
            img.thumbnail((TARGET_WIDTH, TARGET_HEIGHT), Image.Resampling.LANCZOS)
            
            # Apply Opacity 80%
            # Split alpha, multiply by 0.8
            r, g, b, alpha = img.split()
            alpha = alpha.point(lambda p: int(p * 0.95))
            img.putalpha(alpha)
            
            # Create a copy of background to paste onto
            final_img = background_base.copy()
            
            # Calculate centering position
            fw, fh = img.size
            left = (TARGET_WIDTH - fw) // 2
            top = (TARGET_HEIGHT - fh) // 2
            
            # Composite (paste with alpha mask)
            final_img.paste(img, (left, top), img)
            
            # Save (Convert to RGB to drop alpha channel as requested "no alpha")
            # The background is already RGB, but paste might have promoted it or we just want to be sure.
            final_img = final_img.convert('RGB')
            
            base_name = os.path.splitext(os.path.basename(img_path))[0]
            # Avoid processing generated files or background itself if it matches extension
            
            new_filename = f"{base_name}_640x400.png"
            new_path = os.path.join(MATERIAL_DIR, new_filename)
            
            final_img.save(new_path, format='PNG')
            print(f"Processed {os.path.basename(img_path)} -> {new_filename} (Overlaid on BG, 80% opacity)")
            
    except Exception as e:
        print(f"Failed to process {img_path}: {e}")

def main():
    background_base = get_background_base()
    if not background_base:
        return

    # Filter for source images:
    # 1. Must be image
    # 2. Must NOT be the background file itself
    # 3. Must NOT be the _640x400 generated files (we are regenerating them from originals)
    
    images = []
    for f in os.listdir(MATERIAL_DIR):
        if not f.lower().endswith(('.png', '.jpg', '.jpeg')):
            continue
        if f == BACKGROUND_FILE:
            continue
        if '_640x400' in f:
            continue
        images.append(f)
    
    if not images:
        print("No source images found.")
        return

    print(f"Found {len(images)} source images to process...")
    for img_name in images:
        process_image(os.path.join(MATERIAL_DIR, img_name), background_base)

if __name__ == "__main__":
    main()
