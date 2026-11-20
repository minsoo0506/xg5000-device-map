"""Run the published installer and open two native projects in its WebView2."""

import argparse
import os
from pathlib import Path
import socket
import subprocess
import time
from urllib.error import URLError
from urllib.request import urlopen
import winreg

from playwright.sync_api import expect, sync_playwright

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


def wait_for_webview(endpoint, app):
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        if app.poll() is not None:
            raise RuntimeError(f"Application exited before WebView2 started: {app.returncode}")
        try:
            with urlopen(endpoint + "/json/version", timeout=1):
                return
        except URLError:
            time.sleep(0.25)
    raise TimeoutError("Release WebView2 did not respond on loopback")


def verify_project(page, projects, family, slots):
    page.locator("input[type=file]").set_input_files(projects / (family + ".xgwx"))
    expect(page.locator("aside h2")).to_have_text(family)
    page.locator(".list button").filter(has_text="M00010").click()
    graph = page.locator(".react-flow")
    expect(graph.get_by_text("ScanInput", exact=True)).to_be_visible()
    expect(graph.get_by_text("ScanOutput", exact=True)).to_be_visible()
    expect(graph.locator(".react-flow__edge")).to_have_count(4)
    expect(graph.locator('[data-id="d:P00000"]')).to_be_visible()
    expect(graph.locator('[data-id="d:P00020"]')).to_be_visible()
    expect(page.get_by_role("alert")).to_have_count(0)
    page.get_by_text("I/O 파라미터", exact=True).click()
    expect(page.locator(".cpu-unit")).to_have_text("CPU" + family)
    expect(page.locator(".base-unit")).to_contain_text(f"슬롯 × {slots}")
    page.screenshot(path=projects / (family + "-installed-app.png"))
    print(f"Verified {family} in published Windows installation", flush=True)


def verify(installer, projects):
    subprocess.run([str(installer), "/S"], check=True, timeout=120)
    verify_publisher()
    app_path = Path(os.environ["LOCALAPPDATA"]) / PRODUCT / "xg5000-device-map.exe"
    with socket.socket() as connection:
        connection.bind(("127.0.0.1", 0))
        port = connection.getsockname()[1]
    env = dict(os.environ, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=f"--remote-debugging-port={port}")
    endpoint = f"http://127.0.0.1:{port}"
    with subprocess.Popen([str(app_path)], env=env) as app:
        try:
            wait_for_webview(endpoint, app)
            with sync_playwright() as playwright:
                browser = playwright.chromium.connect_over_cdp(endpoint, timeout=20000)
                page = browser.contexts[0].pages[0]
                page.locator("input[type=file]").wait_for()
                verify_project(page, projects, "XGB-XBCU", 12)
                verify_project(page, projects, "XGB-XBMS", 8)
        finally:
            app.terminate()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--installer", required=True, type=Path)
    parser.add_argument("--projects", required=True, type=Path)
    args = parser.parse_args()
    verify(args.installer, args.projects)
