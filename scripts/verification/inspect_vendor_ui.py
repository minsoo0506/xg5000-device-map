"""Inspect XG5000's native project dialog on an ephemeral Windows runner.

This only opens the vendor tool and its New Project dialog; no PLC is contacted.
The resulting control tree guides actual project generation in a follow-up run.
"""
import argparse
from pathlib import Path
import time
from pywinauto import Application, Desktop

parser = argparse.ArgumentParser()
parser.add_argument('--executable', required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args()
output = Path(args.output)
output.mkdir(parents=True, exist_ok=True)
app = Application(backend='win32').start(args.executable, work_dir=str(Path(args.executable).parent))
try:
    app.wait_cpu_usage_lower(threshold=5, timeout=60)
    windows = Desktop(backend='win32').windows(process=app.process)
    (output/'windows.txt').write_text('\n'.join(f'{w.handle}: {w.window_text()} [{w.class_name()}]' for w in windows), encoding='utf-8')
    main = app.top_window()
    main.wait('visible', timeout=30)
    main.print_control_identifiers(filename=str(output/'main-controls.txt'))
    main.capture_as_image().save(output/'main.png')
    main.set_focus()
    main.type_keys('^n')
    time.sleep(2)
    dialog = app.top_window()
    dialog.print_control_identifiers(filename=str(output/'new-project-controls.txt'))
    dialog.capture_as_image().save(output/'new-project.png')
finally:
    app.kill(soft=False)
