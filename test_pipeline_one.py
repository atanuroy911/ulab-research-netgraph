import os
import json
import subprocess
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROFILE_ID = "sajid-amit" # One profile for testing

# 1. Run extract_keywords for one profile by temporarily renaming others or modifying the script?
# Better: Just run extract_keywords.py but pass an env var
env = os.environ.copy()
env['TEST_PROFILE_ID'] = PROFILE_ID

print(f"Testing pipeline for {PROFILE_ID}...")

print("1. Scraping profile (we'll just let profile_scraper run, it's fast if cached)...")
# Actually profile_scraper scrapes everything.
# Let's write a targeted keyword extraction right here for testing.

import requests
OLLAMA_URL = "http://192.168.123.47:11434/api/generate"
OLLAMA_MODEL = "llama3"

faculty_file = os.path.join(BASE_DIR, "data", "faculty", f"{PROFILE_ID}.json")

if not os.path.exists(faculty_file):
    print(f"Error: {faculty_file} not found.")
    sys.exit(1)

with open(faculty_file, 'r', encoding='utf-8') as f:
    fac = json.load(f)

bio = fac.get('bio_raw', '')
publications = fac.get('publications', [])

if not bio and not publications:
    print("No text to analyze.")
    sys.exit(0)

print(f"Analyzing {fac['name']} with Ollama...")

prompt = f"""
You are an expert academic research classifier. Read the following bio and list of publications for a faculty member.
Extract the top 5 primary research keywords/domains that represent their expertise.
Output ONLY a JSON array of strings, e.g. ["Marketing", "Data Science", "Machine Learning"]. Do not include any other text.

Bio:
{bio}

Publications:
{chr(10).join(publications[:5])}
"""

payload = {
    "model": OLLAMA_MODEL,
    "prompt": prompt,
    "stream": False,
    "format": "json"
}

try:
    response = requests.post(OLLAMA_URL, json=payload, timeout=60)
    response.raise_for_status()
    result = response.json()
    keywords = json.loads(result['response'])
    print("Success! Keywords extracted:")
    print(keywords)
except Exception as e:
    print(f"Failed to query Ollama: {e}")
