"""Inspect XG5000's project controls on the offline Windows runner."""

import argparse
from pathlib import Path
import time

from PIL import ImageGrab
from pywinauto import Application, Desktop, mouse
from win32gui import IsWindow, ScreenToClient
from pywinauto.findwindows import ElementNotFoundError


def click_toolbar(main, x):
    bounds = main.rectangle()
    mouse.click(coords=(bounds.left + x, bounds.top + 62))


def new_project(app, main):
    main.set_focus()
    click_toolbar(main, 23)
    spec = app.window(title="New Project", class_name="#32770")
    spec.wait("visible enabled", timeout=20)
    return spec


def ladder_operand(app, main, desktop, key, address, output, name):
    main.type_keys(key)
    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        dialogs = desktop.windows(process=app.process, class_name="#32770", visible_only=True)
        if dialogs:
            dialog = dialogs[0]
            dialog.capture_as_image().save(output / f"{name}.png")
            dialog.type_keys(address + "{ENTER}", with_spaces=True)
            time.sleep(0.5)
            if IsWindow(dialog.handle) and dialog.is_visible():
                raise RuntimeError(f"Ladder dialog stayed open after entering {address}")
            return
        time.sleep(0.25)
    main.capture_as_image().save(output / f"{name}-missing.png")
    raise RuntimeError(f"Ladder dialog did not open for {key}")


def create_samples(executable, output):
    cpu_types = {"XGB-XBCU": "XBC-DxxxU", "XGB-XBMS": "XBM-DxxxS"}
    for family, selection in cpu_types.items():
        desktop = Desktop(backend="win32")
        app = Application(backend="win32").start(executable, work_dir=str(Path(executable).parent))
        try:
            spec = app.window(title="XG5000", class_name_re=r"Afx:.*")
            spec.wait("visible enabled", timeout=60)
            main = spec.wrapper_object()
            dialog = new_project(app, main)
            dialog.child_window(control_id=1496, class_name="Edit").set_edit_text(family)
            dialog.child_window(control_id=1443, class_name="Edit").set_edit_text(str(output))
            dialog.child_window(control_id=1444, class_name="Edit").set_edit_text("ScanInput")
            dialog.child_window(control_id=1440, class_name="ComboBox").select("XGB")
            cpu = dialog.child_window(control_id=1495, class_name="ComboBox")
            types = cpu.item_texts()
            (output / f"{family}-cpu-types.txt").write_text("\n".join(types), encoding="utf-8")
            if selection not in types:
                raise RuntimeError(f"{family} is missing from the CPU type list")
            cpu.select(selection)
            dialog.wrapper_object().capture_as_image().save(output / f"{family}-selected.png")
            dialog.child_window(control_id=1, class_name="Button").click()
            dialog.wait_not("visible", timeout=20)
            time.sleep(1)
            main.capture_as_image().save(output / f"{family}-editor.png")
            try:
                ladder_operand(app, main, desktop, "{F3}", "P00000", output, f"{family}-contact")
                ladder_operand(app, main, desktop, "{F9}", "M00010", output, f"{family}-coil")
                click_toolbar(main, 90)
                time.sleep(1)
                main.capture_as_image().save(output / f"{family}-saved.png")
                # The scan program folder is visible below the PLC parameters.
                bounds = main.rectangle()
                folder_y = 382 if family == "XGB-XBCU" else 364
                before_menu = {w.handle for w in desktop.windows(process=app.process, visible_only=True)}
                mouse.click(button="right", coords=(bounds.left + 104, bounds.top + folder_y))
                time.sleep(0.5)
                menu_bounds = (bounds.left, 0, bounds.right, bounds.bottom)
                ImageGrab.grab(bbox=menu_bounds).save(output / f"{family}-context-menu.png")
                menus = [w for w in desktop.windows(process=app.process, visible_only=True) if w.handle not in before_menu]
                (output / f"{family}-menu-controls.txt").write_text(
                    "\n".join(f"{w.class_name()} {w.rectangle()}" for w in menus), encoding="utf-8"
                )
                if not menus:
                    raise ElementNotFoundError("Scan Program context menu did not appear")
                menu = menus[0].rectangle()
                mouse.click(coords=(menu.left + 55, menu.top + 41))
                time.sleep(0.8)
                ImageGrab.grab(bbox=menu_bounds).save(output / f"{family}-add-item.png")
                parent_handles = before_menu | {w.handle for w in menus}
                children = [w for w in desktop.windows(process=app.process, visible_only=True) if w.handle not in parent_handles]
                if not children:
                    raise ElementNotFoundError("Add Item submenu did not appear")
                child = children[0].rectangle()
                mouse.click(coords=(child.left + 52, child.top + 13))
                program = app.window(title_re=r".*Program.*", class_name="#32770")
                try:
                    program.wait("visible enabled", timeout=6)
                except Exception:
                    ImageGrab.grab(bbox=menu_bounds).save(output / f"{family}-program-menu.png")
                    raise
                program.child_window(class_name="Edit", found_index=0).set_edit_text("ScanOutput")
                program.child_window(control_id=1, class_name="Button").click()
                program.wait_not("visible", timeout=12)
                time.sleep(0.6)
                main.capture_as_image().save(output / f"{family}-second-editor.png")
                ladder_operand(app, main, desktop, "{F3}", "M00010", output, f"{family}-output-contact")
                ladder_operand(app, main, desktop, "{F9}", "P00020", output, f"{family}-output-coil")
                click_toolbar(main, 90)
                time.sleep(1)
                main.capture_as_image().save(output / f"{family}-two-programs.png")
            finally:
                if not list(output.rglob(f"{family}.xgwx")):
                    raise RuntimeError(f"XG5000 did not create {family}.xgwx")
        finally:
            app.kill(soft=False)


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
    parser.add_argument("--create-samples", action="store_true")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    operation = create_samples if args.create_samples else inspect
    operation(args.executable, args.output)
