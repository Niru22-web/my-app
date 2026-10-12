import os
import sys
import time
from playwright.sync_api import sync_playwright

def safe_print(text):
    try:
        print(text)
    except UnicodeEncodeError:
        try:
            print(text.encode('utf-8', errors='replace').decode('cp1252', errors='replace'))
        except Exception:
            print(text.encode('ascii', errors='ignore').decode('ascii'))

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()
        
        # Capture console messages safely
        page.on("console", lambda msg: safe_print(f"CONSOLE: {msg.type}: {msg.text}"))
        page.on("pageerror", lambda err: safe_print(f"PAGE ERROR: {err}"))
        
        print("Navigating to compliance page (should redirect to login)...")
        page.goto("http://localhost:5173/compliance")
        time.sleep(2)
        print(f"URL: {page.url}")
        
        print("Filling credentials...")
        page.fill('input[type="email"]', "niranjan.mulam@asaind.co.in")
        page.fill('input[type="password"]', "password123")
        
        print("Clicking submit...")
        page.click('button[type="submit"]')
        
        # Wait up to 10 seconds for navigation or change in URL
        for i in range(10):
            time.sleep(1)
            print(f"Seconds {i+1} - URL: {page.url}")
            if "/login" not in page.url:
                break
                
        # Take a screenshot of the login page state if it didn't redirect
        if "/login" in page.url:
            print("Still on login page! Checking for error messages...")
            page.screenshot(path="login_page_error.png")
            error_element = page.query_selector('.bg-red-50')
            if error_element:
                print(f"Error Message on UI: {error_element.inner_text()}")
            else:
                print("No visible error message on UI.")
                
        browser.close()

if __name__ == "__main__":
    main()
