import subprocess
import os
import sys
import json
import argparse

def run_scrapes(skip_scrape=False, force=False):
    base_dir = os.path.dirname(os.path.abspath(__file__))
    
    if not skip_scrape:
        print("Running list scraper...")
        subprocess.run([sys.executable, os.path.join(base_dir, "list_scraper.py")], check=True)
        
        print("Running profile scraper...")
        subprocess.run([sys.executable, os.path.join(base_dir, "profile_scraper.py")], check=True)
    else:
        print("Skipping web scraping... Jumping directly to Ollama extraction.")
    
    print("Extracting keywords...")
    cmd_extract = [sys.executable, os.path.join(base_dir, "..", "pipeline", "extract_keywords.py")]
    if force:
        cmd_extract.append("--force")
    subprocess.run(cmd_extract, check=True)
    
    print("Building taxonomy...")
    subprocess.run([sys.executable, os.path.join(base_dir, "..", "pipeline", "build_taxonomy.py")], check=True)
    
    print("Building edges...")
    subprocess.run([sys.executable, os.path.join(base_dir, "..", "pipeline", "build_edges.py")], check=True)
    
    print("Re-generating index.json...")
    data_dir = os.path.join(base_dir, "..", "data", "faculty")
    index_file = os.path.join(base_dir, "..", "data", "index.json")
    
    # Sync images to Next.js public directory
    images_source = os.path.join(base_dir, "..", "data", "images")
    next_images_dir = os.path.join(base_dir, "..", "web", "public", "images")
    import shutil
    if os.path.exists(images_source):
        os.makedirs(next_images_dir, exist_ok=True)
        # copy contents
        for f in os.listdir(images_source):
            src_file = os.path.join(images_source, f)
            if os.path.isfile(src_file):
                shutil.copy2(src_file, os.path.join(next_images_dir, f))

    
    # BUG 4 FIX: Guard against wiping index.json if the data directory doesn't exist yet
    if not os.path.exists(data_dir):
        print(f"Warning: Faculty data directory not found at {data_dir}. Skipping index generation.")
        print("All done!")
        return
    
    index_data = []
    for filename in os.listdir(data_dir):
        if filename.endswith(".json"):
            with open(os.path.join(data_dir, filename), 'r', encoding='utf-8') as f:
                fac = json.load(f)
                raw_keywords = fac.get('extracted_keywords', [])
                valid_kws = []
                for k in raw_keywords:
                    if isinstance(k, dict):
                        valid_kws.append(k)
                    else:
                        valid_kws.append({'canonical': str(k), 'weight': 0.5})
                        
                # Coerce weight to float — LLMs sometimes return "0.9" (string) instead of 0.9 (number).
                # Python 3 cannot compare float < str, so sort crashes without this guard.
                keywords = sorted(valid_kws, key=lambda k: float(k.get('weight', 0) or 0), reverse=True)
                # `.get('canonical', fallback)` only falls back when the key is absent — several
                # faculty have canonical explicitly stored as '' (empty string), which is falsy but
                # present, so that pattern silently returned '' instead of falling back to term.
                top_keywords = [(k.get('canonical') or k.get('term', '')) for k in keywords[:3]] if keywords else []
                
                index_data.append({
                    "id": fac.get("id"),
                    "name": fac.get("name"),
                    "department": fac.get("department"),
                    "school": fac.get("school", ""),
                    "title": fac.get("title"),
                    "top_keywords": top_keywords,
                    "photo_url": fac.get("photo_url"),
                    "local_image_path": fac.get("local_image_path")
                })
    
    with open(index_file, 'w', encoding='utf-8') as f:
        json.dump(index_data, f, indent=2, ensure_ascii=False)
        
    print(f"Generated index.json with {len(index_data)} entries.")
    print("All done!")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--skip-scrape', action='store_true', help='Skip list and profile scraping')
    parser.add_argument('--force', action='store_true', help='Force Ollama re-extraction for all profiles')
    args = parser.parse_args()
    run_scrapes(args.skip_scrape, args.force)
