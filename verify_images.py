from PIL import Image
import os

images = {
    'asynchronous_640x400.png': (640, 400),
    'detecting_640x400.png':    (640, 400),
    'discussion_640x400.png':   (640, 400)
}

BG_COLOR = (105, 240, 174)
MATERIAL_DIR = 'material'

print("Verifying images...")
all_pass = True

for img_name, target_size in images.items():
    path = os.path.join(MATERIAL_DIR, img_name)
    try:
        with Image.open(path) as img:
            print(f"Checking {img_name}...")
            
            # Check size
            if img.size != target_size:
                print(f"  [FAIL] Size mismatch: {img.size} != {target_size}")
                all_pass = False
            else:
                print(f"  [PASS] Size: {img.size}")

            # Check corner pixel for background color
            # Since all images are narrower than 640 (based on aspect ratio calculation),
            # the top-left corner (0,0) should be background.
            # actually, all these images have ratio < 1.6 (640/400).
            # 329/218 = 1.50, 323/279 = 1.15, 327/282 = 1.16. All < 1.6.
            # So when scaled to height 400, width will be < 640.
            # So there will be padding on Left and Right.
            # (0, 0) might be background if centered correctly.
            # Let's check (0, 200) - mid left edge, and (639, 200) - mid right edge.
            
            pixel_left = img.getpixel((0, 200))
            pixel_right = img.getpixel((639, 200))
            
            # Allow small tolerance or exact match? Should be exact for generated image.
            if pixel_left == BG_COLOR:
                 print(f"  [PASS] Left-mid pixel is background color {BG_COLOR}")
            else:
                 print(f"  [FAIL] Left-mid pixel is {pixel_left}, expected {BG_COLOR}")
                 all_pass = False

            if pixel_right == BG_COLOR:
                 print(f"  [PASS] Right-mid pixel is background color {BG_COLOR}")
            else:
                 print(f"  [FAIL] Right-mid pixel is {pixel_right}, expected {BG_COLOR}")
                 all_pass = False

    except Exception as e:
        print(f"  [ERROR] Could not read {img_name}: {e}")
        all_pass = False

if all_pass:
    print("\nAll verifications passed!")
else:
    print("\nSome verifications failed.")
