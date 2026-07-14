import requests
from bs4 import BeautifulSoup
import json
import os
import time

BASE_URL = "https://ulab.edu.bd"
START_URL = f"{BASE_URL}/academics/faculty-list"
CACHE_DIR = os.path.join(os.path.dirname(__file__), 'cache')
OUTPUT_FILE = os.path.join(CACHE_DIR, 'faculty_links.json')

def scrape_list():
    page = 0
    all_faculty = []
    
    if not os.path.exists(CACHE_DIR):
        os.makedirs(CACHE_DIR)

    while True:
        url = START_URL if page == 0 else f"{START_URL}?page={page}"
        print(f"Fetching {url} ...")
        
        try:
            response = requests.get(url, timeout=10)
            response.raise_for_status()
        except Exception as e:
            print(f"Failed to fetch {url}: {e}")
            break
            
        soup = BeautifulSoup(response.text, 'html.parser')
        rows = soup.find_all('div', class_=lambda c: c and 'views-row' in c)
        
        if not rows:
            print("No more rows found. Finished pagination.")
            break
            
        for row in rows:
            # Name
            title_div = row.find('div', class_='views-field-title')
            name = title_div.get_text(strip=True) if title_div else ""
            
            # Department
            dept_div = row.find('div', class_='views-field-field-dept')
            department = dept_div.get_text(strip=True) if dept_div else ""
            
            # Title (Designation)
            designation_div = row.find('div', class_='views-field-field-designation')
            title = designation_div.get_text(strip=True) if designation_div else ""
            
            # Profile URL
            link_div = row.find('div', class_='views-field-view-node')
            profile_url = ""
            if link_div:
                a_tag = link_div.find('a')
                if a_tag and 'href' in a_tag.attrs:
                    profile_url = BASE_URL + a_tag['href']
                    
            if name and profile_url:
                all_faculty.append({
                    "name": name,
                    "department": department,
                    "title": title,
                    "profile_url": profile_url
                })
                
        page += 1
        time.sleep(1) # politeness delay

    print(f"Scraped {len(all_faculty)} faculty links.")
    
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(all_faculty, f, indent=2, ensure_ascii=False)
        
    print(f"Saved to {OUTPUT_FILE}")

if __name__ == "__main__":
    scrape_list()
