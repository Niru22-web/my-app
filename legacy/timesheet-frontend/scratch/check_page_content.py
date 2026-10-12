import os
import sys
import time
from playwright.sync_api import sync_playwright

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()
        
        print("Navigating...")
        page.goto("http://localhost:5173/compliance")
        time.sleep(2)
        
        print("Logging in...")
        page.fill('input[type="email"]', "niranjan.mulam@asaind.co.in")
        page.fill('input[type="password"]', "admin123")
        page.click('button[type="submit"]')
        time.sleep(5)
        
        print("Going to compliance page...")
        page.goto("http://localhost:5173/compliance")
        time.sleep(5)
        
        text = page.inner_text("body")
        print("----- PAGE BODY TEXT -----")
        print(text[:2000])
        print("--------------------------")
        
        browser.close()

if __name__ == "__main__":
    main()
