import zipfile
import os
import sys

def create_zip(source_dir, output_filename):
    # Files and directories to include
    include_files = [
        'manifest.json',
        'background.js',
        'content.js',
        'config.js',
        'style.css',
        'popup.html',
        'popup.js',
        'popup.css',
        'pdf_viewer.html',
        'pdf_viewer.js',
        'pdf_viewer.css'
    ]
    
    include_dirs = [
        'images',
        'lib'
    ]

    # Check if source dir exists
    if not os.path.exists(source_dir):
        print(f"Error: Source directory '{source_dir}' does not exist.")
        return False

    try:
        with zipfile.ZipFile(output_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
            # Add individual files
            for file in include_files:
                file_path = os.path.join(source_dir, file)
                if os.path.exists(file_path):
                    print(f"Adding {file}...")
                    zipf.write(file_path, arcname=file)
                else:
                    print(f"Warning: File {file} not found, skipping.")

            # Add directories
            for directory in include_dirs:
                dir_path = os.path.join(source_dir, directory)
                if os.path.exists(dir_path):
                    for root, _, files in os.walk(dir_path):
                        for file in files:
                            abs_path = os.path.join(root, file)
                            # Calculate relative path for archive
                            rel_path = os.path.relpath(abs_path, source_dir)
                            print(f"Adding {rel_path}...")
                            zipf.write(abs_path, arcname=rel_path)
                else:
                    print(f"Warning: Directory {directory} not found, skipping.")
        
        print(f"\nSuccessfully created {output_filename}")
        return True

    except Exception as e:
        print(f"Error creating zip: {e}")
        return False

if __name__ == "__main__":
    # Get current directory
    current_dir = os.getcwd()
    # Define output file
    output_zip = os.path.join(current_dir, "extension.zip")
    
    print(f"Packaging extension from {current_dir} to {output_zip}...")
    create_zip(current_dir, output_zip)
