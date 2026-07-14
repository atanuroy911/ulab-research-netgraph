import os
import json
from collections import defaultdict

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data", "faculty")
TAXONOMY_FILE = os.path.join(BASE_DIR, "data", "taxonomy.json")

def build_taxonomy():
    taxonomy = defaultdict(set)
    
    if os.path.exists(TAXONOMY_FILE):
        with open(TAXONOMY_FILE, 'r', encoding='utf-8') as f:
            existing = json.load(f)
            for canonical, terms in existing.items():
                taxonomy[canonical].update(terms)
                
    for filename in os.listdir(DATA_DIR):
        if not filename.endswith(".json"): continue
        with open(os.path.join(DATA_DIR, filename), 'r', encoding='utf-8') as f:
            fac = json.load(f)
            
        for kw in fac.get('extracted_keywords', []):
            if isinstance(kw, dict):
                # `or`, not `.get(key, fallback)` — canonical can be present but explicitly ''.
                canonical = kw.get('canonical') or kw.get('term') or kw.get('keyword') or str(kw)
                term = kw.get('term') or canonical
            else:
                canonical = str(kw)
                term = str(kw)
                
            if canonical and term:
                taxonomy[canonical].add(term)
                
    # Convert sets to list for JSON serialization
    output_taxonomy = {k: sorted(list(v)) for k, v in taxonomy.items()}
    
    with open(TAXONOMY_FILE, 'w', encoding='utf-8') as f:
        json.dump(output_taxonomy, f, indent=2, ensure_ascii=False)
        
    print(f"Taxonomy built with {len(output_taxonomy)} canonical terms.")

if __name__ == "__main__":
    build_taxonomy()
