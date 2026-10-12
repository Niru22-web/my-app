import os
import sys
import time
from playwright.sync_api import sync_playwright

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()
        
        page.goto("http://localhost:5173/compliance")
        time.sleep(2)
        
        page.fill('input[type="email"]', "niranjan.mulam@asaind.co.in")
        page.fill('input[type="password"]', "admin123")
        page.click('button[type="submit"]')
        time.sleep(5)
        
        # Elevate to admin
        page.evaluate("""
            const userStr = localStorage.getItem('user');
            if (userStr) {
                const user = JSON.parse(userStr);
                user.role = 'admin';
                localStorage.setItem('user', JSON.stringify(user));
            }
        """)
        page.reload()
        time.sleep(5)
        
        # Print button titles
        buttons = page.query_selector_all('button')
        print(f"Total buttons found: {len(buttons)}")
        for i, btn in enumerate(buttons):
            title = btn.get_attribute("title")
            text = btn.inner_text()
            print(f"Button {i}: title='{title}', text='{text.strip()}'")
            
        browser.close()

if __name__ == "__main__":
    main()
