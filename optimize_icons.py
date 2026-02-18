from PIL import Image, ImageOps
import os

def optimize_icons():
    source_path = "images/logo.png"
    if not os.path.exists(source_path):
        print(f"Error: {source_path} not found.")
        return

    try:
        # Load the source image
        original_img = Image.open(source_path).convert("RGBA")
        print(f"Loaded {source_path} ({original_img.size})")

        # Get the alpha channel to find the bounding box of non-transparent content
        # If the image has a white background but is not transparent, we might need to handle that.
        # Based on previous analysis, logo.png might be 640x640.
        # Let's assume we want to crop unnecessary whitespace/transparency.
        
        # 1. Bbox based on alpha
        bbox = original_img.getbbox()
        
        # 2. If bbox is full image, maybe it has a white background? 
        # Let's try to trim white background as well.
        
        # Create a mask where non-white pixels are opaque
        # (considering "white" as > 240 in all channels)
        datas = original_img.getdata()
        new_data = []
        for item in datas:
            # item is (r, g, b, a)
            if item[0] > 240 and item[1] > 240 and item[2] > 240:
                new_data.append((255, 255, 255, 0)) # Make white transparent for cropping purposes
            else:
                new_data.append(item)
        
        temp_img = Image.new("RGBA", original_img.size)
        temp_img.putdata(new_data)
        content_bbox = temp_img.getbbox()
        
        if content_bbox:
            print(f"Found content bbox: {content_bbox}")
            cropped_content = original_img.crop(content_bbox)
        else:
            print("Could not detect content (image might be blank or fully white), using original.")
            cropped_content = original_img

        # Now we have the cropped content.
        # We need to generate 16, 48, 128 sizes.
        
        sizes = [16, 48, 128]
        
        for size in sizes:
            # Create a new blank white image
            new_icon = Image.new("RGBA", (size, size), (255, 255, 255, 255))
            
            # Calculate resize dimensions for the content
            # We want it to be large, say 95% of the size
            padding = int(size * 0.05) 
            # Ensure at least 1px padding if size is small, but for 16px, 5% is < 1. 
            # For 16px, maybe no padding or 1px.
            if size == 16:
                 target_content_size = 16 # Full bleed for 16px to maximize visibility
            else:
                 target_content_size = size - (padding * 2)

            # Resize cropped content maintaining aspect ratio
            img_ratio = cropped_content.width / cropped_content.height
            
            if img_ratio > 1:
                # Width is the limiting factor
                new_w = target_content_size
                new_h = int(target_content_size / img_ratio)
            else:
                # Height is the limiting factor
                new_h = target_content_size
                new_w = int(target_content_size * img_ratio)
                
            resized_content = cropped_content.resize((new_w, new_h), Image.Resampling.LANCZOS)
            
            # Paste centered
            x_offset = (size - new_w) // 2
            y_offset = (size - new_h) // 2
            
            # Paste using alpha channel as mask if content has transparency
            new_icon.paste(resized_content, (x_offset, y_offset), resized_content)
            
            # Save
            output_path = f"images/icon{size}.png"
            new_icon.save(output_path)
            print(f"Saved {output_path}")

    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    optimize_icons()
