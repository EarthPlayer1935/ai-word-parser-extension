from PIL import Image

def rgb_to_hex(rgb):
    return '#{:02x}{:02x}{:02x}'.format(rgb[0], rgb[1], rgb[2])

def find_yellow(image_path):
    try:
        img = Image.open(image_path)
        img = img.convert('RGBA')
        
        yellows = []
        for x in range(img.width):
            for y in range(img.height):
                r, g, b, a = img.getpixel((x, y))
                if a < 50: continue
                # Yellow criteria: High R, High G, Low B
                if r > 150 and g > 150 and b < 100:
                    yellows.append((r, g, b))
        
        if yellows:
            # Average
            avg_r = sum(c[0] for c in yellows) // len(yellows)
            avg_g = sum(c[1] for c in yellows) // len(yellows)
            avg_b = sum(c[2] for c in yellows) // len(yellows)
            print(f"Found {len(yellows)} yellow pixels. Average: {rgb_to_hex((avg_r, avg_g, avg_b))}")
        else:
            print("No yellow pixels found.")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    find_yellow('d:\\word-root-parser\\images\\icon128.png')
