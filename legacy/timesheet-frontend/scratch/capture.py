import os
import sys
import time
from playwright.sync_api import sync_playwright

def main():
    print("Starting capture script...")
    with sync_playwright() as p:
        try:
            print("Launching browser...")
            browser = p.chromium.launch(headless=True)
            print("Browser launched successfully.")
            browser.close()
        except Exception as e:
            print(f"Error launching browser: {e}")
            sys.exit(1)

if __name__ == "__main__":
    main()
