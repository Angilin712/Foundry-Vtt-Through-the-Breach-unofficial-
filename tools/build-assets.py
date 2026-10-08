from pathlib import Path
import runpy

# Keep the original build entry point; artwork is generated deterministically.
runpy.run_path(str(Path(__file__).with_name('fate-art.py')), run_name='__main__')
