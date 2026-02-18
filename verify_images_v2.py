from PIL import Image
import os

BACKGROUND_FILE = 'background.png'
MATERIAL_DIR = 'material'

print("Verifying images...")

# We expect these files to be updated
target_files = ['asynchronous_640x400.png', 'detecting_640x400.png', 'discussion_640x400.png']

for img_name in target_files:
    path = os.path.join(MATERIAL_DIR, img_name)
    if not os.path.exists(path):
        print(f"[FAIL] {img_name} does not exist.")
        continue

    try:
        with Image.open(path) as img:
            print(f"Checking {img_name}...")
            
            # Check size
            if img.size != (640, 400):
                print(f"  [FAIL] Size mismatch: {img.size} != (640, 400)")
            else:
                print(f"  [PASS] Size: {img.size}")
            
            # Check Mode
            if img.mode != 'RGB':
                 print(f"  [FAIL] Mode is {img.mode}, expected RGB")
            else:
                 print(f"  [PASS] Mode: RGB")

    except Exception as e:
        print(f"  [ERROR] Could not read {img_name}: {e}")

print("\nVerification script done. Please visually confirm background and opacity.")
