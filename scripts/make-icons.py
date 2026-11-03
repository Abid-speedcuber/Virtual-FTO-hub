"""Make browser and app icon sizes from the Three.js logo render (requires Pillow)."""
from pathlib import Path
from PIL import Image

public = Path(__file__).resolve().parent.parent / 'public'
logo = Image.open(public / 'logo.png').convert('RGBA')
for size, name in [(16, 'favicon-16.png'), (32, 'favicon-32.png'),
                   (180, 'apple-touch-icon.png'), (192, 'icon-192.png'),
                   (512, 'icon-512.png')]:
    logo.resize((size, size), Image.Resampling.LANCZOS).save(public / name)
logo.save(public / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
