from PIL import Image
import sys
import os

def analyze_image(path):
    try:
        img = Image.open(path)
        img = img.convert('RGBA')
        width, height = img.size
        print(f"Image: {path}, Size: {width}x{height}")
        
        # Get data
        pixels = list(img.getdata())
        
        # Analyze corners
        corners = [
            pixels[0],
            pixels[width-1],
            pixels[(height-1)*width],
            pixels[height*width-1]
        ]
        print(f"Corner pixels (RGBA): {corners}")
        
        # Find bounding box of non-transparent pixels
        bbox = img.getbbox()
        if bbox:
            print(f"Non-transparent bbox: {bbox}")
            cw = bbox[2] - bbox[0]
            ch = bbox[3] - bbox[1]
            print(f"Content width: {cw}, Content height: {ch}")
            print(f"Padding: Left={bbox[0]}, Top={bbox[1]}, Right={width-bbox[2]}, Bottom={height-bbox[3]}")
        else:
            print("Image is fully transparent")

        # Find bounding box of non-white pixels (assuming white is > 240, 240, 240)
        left, top, right, bottom = width, height, 0, 0
        found_non_white = False
        
        for y in range(height):
            for x in range(width):
                r, g, b, a = pixels[y*width + x]
                # Check if visible and not white
                if a > 0:
                    if r < 250 or g < 250 or b < 250:
                        if x < left: left = x
                        if y < top: top = y
                        if x > right: right = x
                        if y > bottom: bottom = y
                        found_non_white = True
        
        if found_non_white:
             # right and bottom are indices, so width is right - left + 1
            content_w = right - left + 1
            content_h = bottom - top + 1
            print(f"Non-white content bbox: ({left}, {top}, {right+1}, {bottom+1})")
            print(f"Non-white Content size: {content_w}x{content_h}")
        else:
            print("No non-white pixels found")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    analyze_image("images/icon128.png")
