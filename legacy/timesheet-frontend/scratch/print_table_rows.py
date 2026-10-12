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
        
        # Elevate to admin
        print("Elevating to admin...")
        page.evaluate("""
            const userStr = localStorage.getItem('user');
            if (userStr) {
                const user = JSON.parse(userStr);
                user.role = 'admin';
                localStorage.setItem('user', JSON.stringify(user));
                console.log("Successfully elevated user role to: " + user.role);
            } else {
                console.log("Failed: user not found in localStorage");
            }
        """)
        
        print("Reloading...")
        page.reload()
        time.sleep(5)
        
        # Check localStorage again after reload
        user_after_reload = page.evaluate("localStorage.getItem('user')")
        print(f"User in localStorage after reload: {user_after_reload}")
        
        # Check rows
        rows = page.query_selector_all('tr')
        print(f"Total table rows: {len(rows)}")
        
        for i, row in enumerate(rows[:5]):
            print(f"Row {i} text: {row.inner_text().replace(chr(10), ' | ').strip()}")
            buttons = row.query_selector_all('button')
            print(f"Row {i} has {len(buttons)} buttons.")
            for j, btn in enumerate(buttons):
                title = btn.get_attribute("title")
                print(f"  Button {j}: title='{title}'")
                
        browser.close()

if __name__ == "__main__":
    main()
