import os
import sys
import time
from playwright.sync_api import sync_playwright
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN

def capture_screenshots(output_dir):
    print("Initializing Playwright...")
    os.makedirs(output_dir, exist_ok=True)
    
    screenshots = {}
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Create a browser context with a large screen size
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()
        
        # 1. Login Page
        print("Navigating to login page...")
        page.goto("http://localhost:5173/compliance")
        time.sleep(2)  # Wait for redirect to login page
        
        # Capture login page screenshot
        login_path = os.path.join(output_dir, "01_login_page.png")
        page.screenshot(path=login_path)
        screenshots["login"] = login_path
        print(f"Captured login page: {login_path}")
        
        # Fill credentials
        print("Logging in...")
        page.fill('input[type="email"]', "niranjan.mulam@asaind.co.in")
        page.fill('input[type="password"]', "password123")
        page.click('button[type="submit"]')
        
        # Wait for navigation / dashboard load
        print("Waiting for page load after login...")
        time.sleep(5)  # Wait for dashboard data to load
        
        # Go to compliance page if not redirected
        if "/compliance" not in page.url:
            print("Navigating to compliance page...")
            page.goto("http://localhost:5173/compliance")
            time.sleep(5)  # Wait for compliance dashboard load
            
        print(f"Current URL: {page.url}")
        
        # Set viewport for section screenshots
        page.set_viewport_size({"width": 1440, "height": 1080})
        time.sleep(2)
        
        # 2. Capture Top Section (Header + KPIs)
        print("Capturing Top Section (Header & KPIs)...")
        top_path = os.path.join(output_dir, "02_dashboard_top.png")
        page.screenshot(path=top_path, clip={"x": 0, "y": 0, "width": 1440, "height": 450})
        screenshots["top"] = top_path
        
        # 3. Capture Employee Compliance Table
        print("Capturing Employee Table...")
        page.evaluate("window.scrollTo(0, 350)")
        time.sleep(1)
        table_path = os.path.join(output_dir, "03_employee_table.png")
        page.screenshot(path=table_path, clip={"x": 20, "y": 350, "width": 1040, "height": 600})
        screenshots["table"] = table_path
        
        # 4. Capture Sidebar (Department Analytics + Risk Distribution + Live Activity)
        print("Capturing Sidebar Widgets...")
        sidebar_path = os.path.join(output_dir, "04_sidebar_widgets.png")
        page.screenshot(path=sidebar_path, clip={"x": 1080, "y": 350, "width": 340, "height": 600})
        screenshots["sidebar"] = sidebar_path
        
        # 5. Capture Charts Section
        print("Capturing Charts...")
        page.evaluate("window.scrollTo(0, 950)")
        time.sleep(1)
        charts_path = os.path.join(output_dir, "05_charts_section.png")
        page.screenshot(path=charts_path, clip={"x": 20, "y": 950, "width": 1400, "height": 550})
        screenshots["charts"] = charts_path
        
        # 6. Capture Exception Modal
        print("Triggering Exception Modal...")
        page.evaluate("window.scrollTo(0, 350)")
        time.sleep(1)
        try:
            print("Waiting for Add Exception button to appear...")
            page.wait_for_selector('button[title="Add Exception"]', timeout=5000)
            add_exception_btn = page.query_selector('button[title="Add Exception"]')
            if add_exception_btn:
                print("Clicking Add Exception button...")
                add_exception_btn.click()
                time.sleep(1.5)  # Wait for modal animation
                
                modal_path = os.path.join(output_dir, "06_exception_modal.png")
                page.screenshot(path=modal_path)
                screenshots["exception_modal"] = modal_path
                print(f"Captured Exception Modal: {modal_path}")
                
                # Dismiss the modal
                page.click('button:has-text("Cancel")')
                time.sleep(1)
            else:
                print("No 'Add Exception' button found after waiting. Skipping exception modal capture.")
        except Exception as ex:
            print(f"Error capturing exception modal: {ex}")
            
        # 7. Full Page Screenshot
        print("Capturing full page...")
        page.set_viewport_size({"width": 1440, "height": 1600})
        time.sleep(2)
        full_path = os.path.join(output_dir, "07_full_page.png")
        page.screenshot(path=full_path, full_page=True)
        screenshots["full"] = full_path
        print(f"Captured full page: {full_path}")
        
        browser.close()
        
    return screenshots

def set_slide_background(slide, color):
    background = slide.background
    fill = background.fill
    fill.solid()
    fill.fore_color.rgb = color

def add_title(slide, text, color=RGBColor(255, 255, 255), size=Pt(36)):
    title_box = slide.shapes.add_textbox(Inches(0.5), Inches(0.4), Inches(12.33), Inches(0.8))
    tf = title_box.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = text
    p.font.name = 'Segoe UI'
    p.font.size = size
    p.font.bold = True
    p.font.color.rgb = color
    return title_box

def create_presentation(screenshots, output_path):
    print("Creating Presentation...")
    prs = Presentation()
    
    # Set 16:9 widescreen slides
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    
    blank_layout = prs.slide_layouts[6]
    
    # Theme colors
    bg_color = RGBColor(14, 22, 38)      # #0E1626 (dark theme bg)
    text_color = RGBColor(248, 250, 252) # #F8FAFC (white/slate)
    muted_color = RGBColor(148, 163, 184) # #94A3B8 (muted slate)
    accent_purple = RGBColor(167, 139, 250) # #A78BFA
    accent_blue = RGBColor(96, 165, 250)    # #60A5FA
    accent_green = RGBColor(16, 185, 129)   # #10B981
    accent_red = RGBColor(239, 68, 68)      # #EF4444
    accent_orange = RGBColor(245, 158, 11)   # #F59E0B
    
    # ── SLIDE 1: Title Slide ───────────────────────────────────────────────────
    slide = prs.slides.add_slide(blank_layout)
    set_slide_background(slide, bg_color)
    
    # Title & Subtitle in a single box to avoid overlapping
    title_box = slide.shapes.add_textbox(Inches(1.0), Inches(2.2), Inches(11.33), Inches(3.0))
    tf = title_box.text_frame
    tf.word_wrap = True
    
    p = tf.paragraphs[0]
    p.text = "Timesheet Compliance Dashboard"
    p.font.name = 'Segoe UI'
    p.font.size = Pt(46)
    p.font.bold = True
    p.font.color.rgb = accent_blue
    
    p2 = tf.add_paragraph()
    p2.text = "Interactive Functional Walkthrough & Administration Guide"
    p2.font.name = 'Segoe UI'
    p2.font.size = Pt(22)
    p2.font.color.rgb = accent_purple
    p2.space_before = Pt(14)
    
    p3 = tf.add_paragraph()
    p3.text = f"Generated for Niranjan Mulam | Date: {time.strftime('%B %d, %Y')}"
    p3.font.name = 'Segoe UI'
    p3.font.size = Pt(14)
    p3.font.color.rgb = muted_color
    p3.space_before = Pt(36)
    
    # ── SLIDE 2: Dashboard Overview ─────────────────────────────────────────────
    slide = prs.slides.add_slide(blank_layout)
    set_slide_background(slide, bg_color)
    add_title(slide, "1. Compliance Dashboard Overview")
    
    # Content left, image right
    content_box = slide.shapes.add_textbox(Inches(0.5), Inches(1.3), Inches(5.5), Inches(5.5))
    tf = content_box.text_frame
    tf.word_wrap = True
    
    p = tf.paragraphs[0]
    p.text = "The Timesheet Compliance Dashboard is a centralized platform designed to track, monitor, and enforce weekly timesheet submission guidelines across the organization. It enables administrators and managers to maintain operational discipline and high utilization rates."
    p.font.name = 'Segoe UI'
    p.font.size = Pt(14)
    p.font.color.rgb = text_color
    p.space_after = Pt(12)
    
    bullet_points = [
        "**Real-time Tracking**: Live status of weekly compliance rates, missing days, and total hours.",
        "**Live Auto-Refresh**: Data automatically updates every 60 seconds (with play/pause toggle).",
        "**Role-based Actions**: Managers and Admins get targeted reminders, escalations, and exception management tools.",
        "**Export Capability**: Instant CSV export of active compliance records for offline reporting."
    ]
    for bp in bullet_points:
        p = tf.add_paragraph()
        p.font.name = 'Segoe UI'
        p.font.size = Pt(12.5)
        p.font.color.rgb = text_color
        p.space_after = Pt(8)
        
        # Crude bold text formatting using python-pptx runs
        parts = bp.split("**")
        if len(parts) >= 3:
            run_bold = p.add_run()
            run_bold.text = parts[1]
            run_bold.font.bold = True
            run_bold.font.color.rgb = accent_purple
            
            run_normal = p.add_run()
            run_normal.text = parts[2]
            run_normal.font.color.rgb = text_color
        else:
            p.text = bp
            
    # Add screenshot
    if "full" in screenshots:
        slide.shapes.add_picture(screenshots["full"], Inches(6.3), Inches(1.3), width=Inches(6.5))
        
    # ── SLIDE 3: KPI Metrics & Core Statistics ─────────────────────────────────
    slide = prs.slides.add_slide(blank_layout)
    set_slide_background(slide, bg_color)
    add_title(slide, "2. Key Performance Indicators (KPIs)")
    
    content_box = slide.shapes.add_textbox(Inches(0.5), Inches(1.3), Inches(5.5), Inches(5.5))
    tf = content_box.text_frame
    tf.word_wrap = True
    
    p = tf.paragraphs[0]
    p.text = "At the top of the dashboard, six core cards summarize the current week's state. These dynamic metrics automatically recalculate as filters are applied."
    p.font.name = 'Segoe UI'
    p.font.size = Pt(14)
    p.font.color.rgb = text_color
    p.space_after = Pt(12)
    
    kpi_details = [
        "**Weekly Compliance**: Percentage of total employees who have fully completed timesheets.",
        "**Missing Yesterday**: Count of users who failed to log hours on the previous business day.",
        "**Below 40 Hours**: Count of users active this week but currently under 40 hours.",
        "**Critical Risk**: Employees categorized as high-risk compliance offenders.",
        "**Escalations**: Serious cases where a level 3+ warning has been programmatically triggered.",
        "**Team Utilization**: Ratio of billable hours over total hours logged."
    ]
    for kd in kpi_details:
        p = tf.add_paragraph()
        p.font.name = 'Segoe UI'
        p.font.size = Pt(12)
        p.font.color.rgb = text_color
        p.space_after = Pt(6)
        parts = kd.split("**")
        if len(parts) >= 3:
            run_bold = p.add_run()
            run_bold.text = parts[1]
            run_bold.font.bold = True
            run_bold.font.color.rgb = accent_blue
            
            run_normal = p.add_run()
            run_normal.text = parts[2]
            run_normal.font.color.rgb = text_color
        else:
            p.text = kd
            
    if "top" in screenshots:
        slide.shapes.add_picture(screenshots["top"], Inches(6.3), Inches(2.2), width=Inches(6.5))
        
    # ── SLIDE 4: Employee Compliance Table & Filters ───────────────────────────
    slide = prs.slides.add_slide(blank_layout)
    set_slide_background(slide, bg_color)
    add_title(slide, "3. Employee Compliance Table & Filtering")
    
    content_box = slide.shapes.add_textbox(Inches(0.5), Inches(1.3), Inches(5.5), Inches(5.5))
    tf = content_box.text_frame
    tf.word_wrap = True
    
    p = tf.paragraphs[0]
    p.text = "The compliance table lists all individual employee records. It provides detailed column metadata, interactive sorting, and granular multi-select filters."
    p.font.name = 'Segoe UI'
    p.font.size = Pt(14)
    p.font.color.rgb = text_color
    p.space_after = Pt(12)
    
    table_features = [
        "**Interactive Search**: Instantly find employees by name, department, or role.",
        "**Multi-Select Filters**: Filter by Department, Risk Level (Critical, Warning, Healthy), and Compliance Status (Compliant, Under 40h, Missing daily, Unsubmitted, Pending).",
        "**Visual Hours Progress Bar**: Displays weekly hours logged against target 40h.",
        "**Sorting**: Click any column header (Employee, Dept, Hours, Risk, etc.) to sort ascending or descending."
    ]
    for tf_item in table_features:
        p = tf.add_paragraph()
        p.font.name = 'Segoe UI'
        p.font.size = Pt(12)
        p.font.color.rgb = text_color
        p.space_after = Pt(6)
        parts = tf_item.split("**")
        if len(parts) >= 3:
            run_bold = p.add_run()
            run_bold.text = parts[1]
            run_bold.font.bold = True
            run_bold.font.color.rgb = accent_purple
            
            run_normal = p.add_run()
            run_normal.text = parts[2]
            run_normal.font.color.rgb = text_color
        else:
            p.text = tf_item
            
    if "table" in screenshots:
        slide.shapes.add_picture(screenshots["table"], Inches(6.3), Inches(1.8), width=Inches(6.5))
        
    # ── SLIDE 5: Administrative Actions & Workflows ───────────────────────────
    slide = prs.slides.add_slide(blank_layout)
    set_slide_background(slide, bg_color)
    add_title(slide, "4. Administrative Actions & Workflows")
    
    content_box = slide.shapes.add_textbox(Inches(0.5), Inches(1.3), Inches(5.5), Inches(5.5))
    tf = content_box.text_frame
    tf.word_wrap = True
    
    p = tf.paragraphs[0]
    p.text = "Authorized users (Admins, Managers, and Partners) can take direct actions from the compliance table to enforce or handle timesheet submission policies."
    p.font.name = 'Segoe UI'
    p.font.size = Pt(14)
    p.font.color.rgb = text_color
    p.space_after = Pt(12)
    
    actions = [
        "**Send Reminder (Mail Icon)**: Triggers an email or notification directly to the selected employee to prompt submission.",
        "**Escalate (Red Arrow Up)**: Programmatically escalates compliance issues for repeated offenders, notifying their managers or leadership.",
        "**Add Exception (Green Check)**: Opens the Exception Modal to excuse an employee from compliance requirements for specific reasons."
    ]
    for act in actions:
        p = tf.add_paragraph()
        p.font.name = 'Segoe UI'
        p.font.size = Pt(12)
        p.font.color.rgb = text_color
        p.space_after = Pt(8)
        parts = act.split("**")
        if len(parts) >= 3:
            run_bold = p.add_run()
            run_bold.text = parts[1]
            run_bold.font.bold = True
            if "Reminder" in parts[1]:
                run_bold.font.color.rgb = accent_blue
            elif "Escalate" in parts[1]:
                run_bold.font.color.rgb = accent_red
            else:
                run_bold.font.color.rgb = accent_green
            
            run_normal = p.add_run()
            run_normal.text = parts[2]
            run_normal.font.color.rgb = text_color
        else:
            p.text = act
            
    if "exception_modal" in screenshots:
        slide.shapes.add_picture(screenshots["exception_modal"], Inches(6.3), Inches(1.5), width=Inches(6.5))
    elif "table" in screenshots:
        slide.shapes.add_picture(screenshots["table"], Inches(6.3), Inches(1.8), width=Inches(6.5))
        
    # ── SLIDE 6: Sidebar Analytics & Live Feed ─────────────────────────────────
    slide = prs.slides.add_slide(blank_layout)
    set_slide_background(slide, bg_color)
    add_title(slide, "5. Sidebar Analytics & Live Feed")
    
    content_box = slide.shapes.add_textbox(Inches(0.5), Inches(1.3), Inches(5.5), Inches(5.5))
    tf = content_box.text_frame
    tf.word_wrap = True
    
    p = tf.paragraphs[0]
    p.text = "The right sidebar provides auxiliary charts, high-level summaries, and a real-time event log for compliance monitoring."
    p.font.name = 'Segoe UI'
    p.font.size = Pt(14)
    p.font.color.rgb = text_color
    p.space_after = Pt(12)
    
    sidebar_items = [
        "**Department Analytics**: Lists compliance percentage progress bars, average hours, and headcount for each active department.",
        "**Risk Distribution**: Simple visual meter summarizing employees grouped into Healthy, Warning, and Critical risk categories.",
        "**Live Activity Feed**: A rolling list of timeline events (e.g. reminders sent, exceptions added, escalations triggered) with live timestamps."
    ]
    for item in sidebar_items:
        p = tf.add_paragraph()
        p.font.name = 'Segoe UI'
        p.font.size = Pt(12)
        p.font.color.rgb = text_color
        p.space_after = Pt(8)
        parts = item.split("**")
        if len(parts) >= 3:
            run_bold = p.add_run()
            run_bold.text = parts[1]
            run_bold.font.bold = True
            run_bold.font.color.rgb = accent_orange
            
            run_normal = p.add_run()
            run_normal.text = parts[2]
            run_normal.font.color.rgb = text_color
        else:
            p.text = item
            
    if "sidebar" in screenshots:
        slide.shapes.add_picture(screenshots["sidebar"], Inches(7.5), Inches(1.3), height=Inches(5.5))
        
    # ── SLIDE 7: Recharts Charts & Trends ──────────────────────────────────────
    slide = prs.slides.add_slide(blank_layout)
    set_slide_background(slide, bg_color)
    add_title(slide, "6. Compliance Trends & Charts")
    
    content_box = slide.shapes.add_textbox(Inches(0.5), Inches(1.3), Inches(5.5), Inches(5.5))
    tf = content_box.text_frame
    tf.word_wrap = True
    
    p = tf.paragraphs[0]
    p.text = "Interactive charts at the bottom of the page display historical trends and compare performance benchmarks across departments."
    p.font.name = 'Segoe UI'
    p.font.size = Pt(14)
    p.font.color.rgb = text_color
    p.space_after = Pt(12)
    
    charts_details = [
        "**Weekly Compliance Trend**: An area chart displaying the historical trajectory of timesheet compliance percentage across preceding weeks.",
        "**Department Hours vs Target**: A comparative bar chart illustrating average hours logged vs compliance rates per department.",
        "**Average Hours Trend**: Line chart tracking average hours worked alongside the number of missing timesheets week-over-week.",
        "**Missing Entries by Department**: Breakdown of low hour counts and critical risk cases across different business units."
    ]
    for chart in charts_details:
        p = tf.add_paragraph()
        p.font.name = 'Segoe UI'
        p.font.size = Pt(11.5)
        p.font.color.rgb = text_color
        p.space_after = Pt(6)
        parts = chart.split("**")
        if len(parts) >= 3:
            run_bold = p.add_run()
            run_bold.text = parts[1]
            run_bold.font.bold = True
            run_bold.font.color.rgb = accent_blue
            
            run_normal = p.add_run()
            run_normal.text = parts[2]
            run_normal.font.color.rgb = text_color
        else:
            p.text = chart
            
    if "charts" in screenshots:
        slide.shapes.add_picture(screenshots["charts"], Inches(6.3), Inches(2.0), width=Inches(6.5))
        
    # Save Presentation
    prs.save(output_path)
    print(f"Presentation saved successfully to: {output_path}")

def main():
    # Directories
    base_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = os.path.join(base_dir, "compliance_screenshots")
    output_ppt = os.path.abspath(os.path.join(base_dir, "..", "Timesheet_Compliance_Dashboard.pptx"))
    
    print(f"Output PPT path will be: {output_ppt}")
    
    # 1. Take screenshots
    screenshots = capture_screenshots(output_dir)
    
    # 2. Build presentation
    create_presentation(screenshots, output_ppt)
    
    print("All tasks completed successfully!")

if __name__ == "__main__":
    main()
