"""Inspect XG5000's project controls on the offline Windows runner."""

import argparse
from pathlib import Path
import time

from pywinauto import Application, Desktop, mouse
from win32gui import ScreenToClient
from pywinauto.findwindows import ElementNotFoundError


def inspect(executable, output):
    desktop = Desktop(backend="win32")
    app = Application(backend="win32").start(executable, work_dir=str(Path(executable).parent))
    try:
        main_spec = app.window(title="XG5000", class_name_re=r"Afx:.*")
        main_spec.wait("visible enabled", timeout=60)
        main = main_spec.wrapper_object()
        main.capture_as_image().save(output / "main.png")
        main.set_focus()

        # The toolbar's first button opens New Project. Ctrl+N did not open a dialog.
        bounds = main.rectangle()
        toolbar_button = (bounds.left + 23, bounds.top + 62)
        mouse.click(coords=toolbar_button)
        for _ in range(30):
            dialogs = desktop.windows(process=app.process, class_name="#32770", visible_only=True)
            if dialogs:
                break
            time.sleep(0.5)
        else:
            main.click(coords=ScreenToClient(main.handle, toolbar_button))
            time.sleep(2)
            dialogs = desktop.windows(process=app.process, class_name="#32770", visible_only=True)

        windows = desktop.windows(process=app.process, visible_only=True)
        (output / "windows.txt").write_text(
            "\n".join(f"{win.handle}: {win.window_text()} [{win.class_name()}]" for win in windows),
            encoding="utf-8",
        )
        if not dialogs:
            main.capture_as_image().save(output / "after-toolbar-click.png")
            raise ElementNotFoundError("XG5000 did not show a project dialog")

        for index, dialog in enumerate(dialogs):
            dialog.capture_as_image().save(output / f"dialog-{index}.png")
            records = []
            for control in dialog.descendants():
                details = f"{control.control_id()}: {control.class_name()} {control.window_text()}"
                if control.class_name() == "ComboBox":
                    details += f"  {control.item_texts()}"
                records.append(details)
            (output / f"dialog-{index}.txt").write_text(
                dialog.window_text() + "\n" + "\n".join(records), encoding="utf-8"
            )
    finally:
        app.kill(soft=False)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--executable", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    inspect(args.executable, args.output)
