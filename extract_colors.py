from PIL import Image
from collections import Counter

def rgb_to_hex(rgb):
    return '#{:02x}{:02x}{:02x}'.format(rgb[0], rgb[1], rgb[2])

def get_dominant_colors(image_path, num_colors=20):
    try:
        img = Image.open(image_path)
        img = img.convert('RGBA')
        
        # Less aggressive resize
        img = img.resize((128, 128))
        
        colors = []
        for x in range(img.width):
            for y in range(img.height):
                r, g, b, a = img.getpixel((x, y))
                if a < 50: continue # Skip transparency
                # Filter out pure white/black
                if r > 250 and g > 250 and b > 250: continue
                if r < 10 and g < 10 and b < 10: continue
                colors.append((r, g, b))
        
        counts = Counter(colors)
        common = counts.most_common(num_colors)
        
        print(f"Top {num_colors} colors from {image_path}:")
        for color, count in common:
            hex_code = rgb_to_hex(color)
            print(f"{hex_code} (RGB: {color}) - Count: {count}")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    get_dominant_colors('d:\\word-root-parser\\images\\icon128.png')
