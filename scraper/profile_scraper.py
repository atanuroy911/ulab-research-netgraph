import requests
from bs4 import BeautifulSoup
import json
import os
import time
import re
import argparse

BASE_URL = "https://ulab.edu.bd"
CACHE_DIR = os.path.join(os.path.dirname(__file__), 'cache')
HTML_CACHE_DIR = os.path.join(CACHE_DIR, 'html')
LINKS_FILE = os.path.join(CACHE_DIR, 'faculty_links.json')
DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'faculty')
IMAGES_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'images')

def get_slug(url):
    return url.rstrip('/').split('/')[-1]

def download_image(url, slug):
    """Download profile photo to data/images/{slug}.ext. Skip if already cached."""
    if not url:
        return None
    # Make relative URLs absolute
    if url.startswith('/'):
        url = BASE_URL + url
    os.makedirs(IMAGES_DIR, exist_ok=True)
    # Return immediately if already downloaded in any known extension
    for ext in ('.jpg', '.jpeg', '.png', '.webp'):
        cached = os.path.join(IMAGES_DIR, f"{slug}{ext}")
        if os.path.exists(cached):
            return cached
    try:
        resp = requests.get(url, timeout=15)
        resp.raise_for_status()
        ct = resp.headers.get('content-type', '')
        ext = '.png' if 'png' in ct else '.webp' if 'webp' in ct else '.jpg'
        dest = os.path.join(IMAGES_DIR, f"{slug}{ext}")
        with open(dest, 'wb') as f:
            f.write(resp.content)
        return dest
    except Exception as e:
        print(f"[WARN] Could not download image for {slug}: {e}")
        return None

def scrape_profiles(target_slug=None):
    if not os.path.exists(HTML_CACHE_DIR):
        os.makedirs(HTML_CACHE_DIR)
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)

    with open(LINKS_FILE, 'r', encoding='utf-8') as f:
        faculty_links = json.load(f)

    for fac in faculty_links:
        url = fac['profile_url']
        slug = get_slug(url)
        
        if target_slug and slug != target_slug:
            continue
            
        html_path = os.path.join(HTML_CACHE_DIR, f"{slug}.html")
        json_path = os.path.join(DATA_DIR, f"{slug}.json")

        # Load existing json to respect locked_fields
        existing_data = {}
        locked_fields = []
        if os.path.exists(json_path):
            with open(json_path, 'r', encoding='utf-8') as f:
                existing_data = json.load(f)
                locked_fields = existing_data.get('locked_fields', [])

        # Check HTML cache unless targeted
        html = ""
        if os.path.exists(html_path) and not target_slug:
            with open(html_path, 'r', encoding='utf-8') as f:
                html = f.read()
        else:
            print(f"Fetching {url}...")
            try:
                res = requests.get(url, timeout=10)
                res.raise_for_status()
                html = res.text
                with open(html_path, 'w', encoding='utf-8') as f:
                    f.write(html)
                time.sleep(1) # politeness
            except Exception as e:
                print(f"Error fetching {url}: {e}")
                continue

        soup = BeautifulSoup(html, 'html.parser')

        # Bio
        bio = ""
        bio_sec = soup.find('section', id='profile')
        if bio_sec:
            bio = bio_sec.get_text(separator='\n', strip=True)

        # Stated interests
        interests = []
        int_sec = soup.find('section', id='field_areas_of_interest')
        if int_sec:
            interests_text = int_sec.get_text(separator='\n', strip=True)
            # just save raw lines as stated_interests
            interests = [line for line in interests_text.split('\n') if line and line.lower() != 'areas of interest']

        # Education
        education = []
        edu_sec = soup.find('section', id='field_education')
        if edu_sec:
            edu_items = edu_sec.find_all('li')
            for item in edu_items:
                education.append({"raw": item.get_text(strip=True)})
            if not edu_items:
                education.append({"raw": edu_sec.get_text(separator='\n', strip=True)})

        # Publications (find all sections starting with fc- or containing publications)
        pubs = []
        # Magellan menu helps find sections
        magellan = soup.find('div', class_='magellan-wrap')
        if magellan:
            links = magellan.find_all('a')
            for link in links:
                href = link.get('href', '')
                if href.startswith('#fc-') or 'article' in link.get_text(strip=True).lower() or 'book' in link.get_text(strip=True).lower():
                    sec_id = href.lstrip('#')
                    sec = soup.find('section', id=sec_id)
                    if sec:
                        pubs.append(sec.get_text(separator='\n', strip=True))

        publications_raw = [p for p in pubs if p]

        # Photo
        photo_url = ""
        photo_div = soup.find('div', class_='faculty-pic')
        if photo_div:
            img = photo_div.find('img')
            if img and 'src' in img.attrs:
                photo_url = img['src']

        # Construct data
        data = existing_data.copy()
        
        # update fields unless locked
        if 'id' not in locked_fields: data['id'] = slug
        if 'name' not in locked_fields: data['name'] = fac['name']
        if 'title' not in locked_fields: data['title'] = fac['title']
        if 'department' not in locked_fields: data['department'] = fac['department']
        # Extract school from somewhere or default to empty string as we don't have it explicitly
        if 'school' not in locked_fields: data['school'] = existing_data.get('school', '')
        if 'profile_url' not in locked_fields: data['profile_url'] = url
        if 'photo_url' not in locked_fields: data['photo_url'] = photo_url

        # Download profile image locally if not already cached
        if photo_url and 'local_image_path' not in locked_fields:
            local_img = download_image(photo_url, slug)
            data['local_image_path'] = local_img
        elif 'local_image_path' not in data:
            data['local_image_path'] = None
        if 'bio_raw' not in locked_fields: data['bio_raw'] = bio
        if 'stated_interests' not in locked_fields: data['stated_interests'] = interests
        if 'education' not in locked_fields: data['education'] = education
        if 'publications_raw' not in locked_fields: data['publications_raw'] = publications_raw

        # ensure structure
        if 'extracted_keywords' not in data: data['extracted_keywords'] = []
        if 'embedding' not in data: data['embedding'] = None
        if 'locked_fields' not in data: data['locked_fields'] = []

        # Detect and warn about empty profiles (no bio, no interests, no publications)
        # These will fail keyword extraction later — print the URL for debugging.
        if not bio and not interests and not publications_raw:
            print(f"[WARN] Empty profile — no content scraped: {url}")
            print(f"       Check selectors or whether this profile page has content.")

        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    print("Profile scraping completed.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--target', type=str, help='Target slug to scrape', default=None)
    args = parser.parse_args()
    scrape_profiles(args.target)
