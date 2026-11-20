"""Run the published installer and open two native projects in its WebView2."""

import argparse
import os
from pathlib import Path
import subprocess
import time
import winreg

from PIL import ImageGrab
from pywinauto import Application, Desktop, keyboard, mouse
from win32gui import ClientToScreen, GetClientRect

PRODUCT = "XG5000 Device Map"
PUBLISHER = "xorear_eax"


def verify_publisher():
    uninstall = r"Software\Microsoft\Windows\CurrentVersion\Uninstall"
    for view in (winreg.KEY_WOW64_64KEY, winreg.KEY_WOW64_32KEY):
        try:
            parent = winreg.OpenKey(winreg.HKEY_CURRENT_USER, uninstall, access=winreg.KEY_READ | view)
        except FileNotFoundError:
            continue
        with parent:
            count, _, _ = winreg.QueryInfoKey(parent)
            for index in range(count):
                with winreg.OpenKey(parent, winreg.EnumKey(parent, index)) as entry:
                    try:
                        name, _ = winreg.QueryValueEx(entry, "DisplayName")
                    except FileNotFoundError:
                        continue
                    if name == PRODUCT:
                        publisher, _ = winreg.QueryValueEx(entry, "Publisher")
                        if publisher != PUBLISHER:
                            raise AssertionError(f"Installed publisher: {publisher!r}")
                        print(f"Verified installed publisher: {publisher}", flush=True)
                        return
    raise AssertionError("Installed program was missing from Windows uninstall metadata")


def capture_window(window, output):
    bounds = window.rectangle()
    screen = ImageGrab.grab()
    screen.crop((max(0, bounds.left), max(0, bounds.top), bounds.right, bounds.bottom)).save(output)


def record_controls(accessible, output):
    controls = [
        f"{item.element_info.control_type}: {item.window_text()}"
        for item in accessible.wrapper_object().descendants()
        if item.window_text()
    ]
    output.write_text("\n".join(controls), encoding="utf-8")


def verify_project(window, projects, family):
    path = (projects / f"{family}.xgwx").resolve(strict=True)
    origin_x, origin_y = ClientToScreen(window.handle, (0, 0))
    _, _, width, _ = GetClientRect(window.handle)
    accessible = Desktop(backend="uia").window(handle=window.handle)
    try:
        open_button = accessible.child_window(title_re=r".*(XGWX 파일 열기|Open XGWX file|Choose File).*", control_type="Button", found_index=0)
        open_button.wait("visible enabled", timeout=12)
        open_button.click_input()
    except Exception:
        mouse.click(coords=(origin_x + width - 120, origin_y + 29))

    dialog = Desktop(backend="win32").window(title="Open", class_name="#32770")
    try:
        dialog.wait("visible enabled", timeout=10)
    except Exception:
        capture_window(window, projects / f"{family}-open-failure.png")
        record_controls(accessible, projects / f"{family}-open-controls.txt")
        raise
    dialog.set_focus()
    keyboard.send_keys("%n")
    keyboard.send_keys("^a" + str(path) + "{ENTER}", with_spaces=True)
    dialog.wait_not("visible", timeout=10)

    accessible = Desktop(backend="uia").window(handle=window.handle)
    try:
        relay = accessible.child_window(title_re=r"^M00010\s*$", control_type="Button")
        relay.wait("visible enabled", timeout=15)
        relay.click_input()
        for label in ("ScanInput", "ScanOutput", "P00000", "P00020"):
            accessible.child_window(title=label, found_index=0).wait("exists", timeout=8)
    finally:
        window.capture_as_image().save(projects / f"{family}-installed-app.png")
        controls = [
            f"{item.element_info.control_type}: {item.window_text()}"
            for item in accessible.wrapper_object().descendants()
            if item.window_text()
        ]
        (projects / f"{family}-installed-controls.txt").write_text("\n".join(controls), encoding="utf-8")
    print(f"Verified {family} in published Windows installation", flush=True)


def verify(installer, projects):
    subprocess.run([str(installer), "/S"], check=True, timeout=120)
    verify_publisher()
    app_path = Path(os.environ["LOCALAPPDATA"]) / PRODUCT / "xg5000-device-map.exe"
    app = Application(backend="win32").start(str(app_path))
    try:
        spec = app.window(title=PRODUCT)
        spec.wait("visible enabled", timeout=25)
        window = spec.wrapper_object()
        window.maximize()
        window.set_focus()
        time.sleep(3)
        capture_window(window, projects / "installed-app.png")
        record_controls(Desktop(backend="uia").window(handle=window.handle), projects / "installed-controls.txt")
        for family in ("XGB-XBCU", "XGB-XBMS"):
            verify_project(window, projects, family)
    finally:
        app.kill(soft=False)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--installer", required=True, type=Path)
    parser.add_argument("--projects", required=True, type=Path)
    args = parser.parse_args()
    verify(args.installer, args.projects)
