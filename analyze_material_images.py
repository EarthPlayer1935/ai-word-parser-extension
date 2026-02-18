import os
from PIL import Image

material_dir = 'material'
images = [f for f in os.listdir(material_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]

print(f"Found {len(images)} images in '{material_dir}':")

for img_name in images:
    img_path = os.path.join(material_dir, img_name)
    try:
        with Image.open(img_path) as img:
            print(f"Image: {img_name}")
            print(f"  Format: {img.format}")
            print(f"  Size: {img.size}")
            print(f"  Mode: {img.mode}")
    except Exception as e:
        print(f"Error processing {img_name}: {e}")
