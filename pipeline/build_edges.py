import os
import json
import numpy as np

try:
    from sentence_transformers import SentenceTransformer
    MODEL = SentenceTransformer('all-MiniLM-L6-v2')
except ImportError:
    print("Warning: sentence_transformers not installed. Using mock embeddings.")
    MODEL = None

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data", "faculty")
EDGES_FILE = os.path.join(BASE_DIR, "data", "edges.json")

def cosine_similarity(a, b):
    if np.linalg.norm(a) == 0 or np.linalg.norm(b) == 0:
        return 0.0
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

def get_canonical(k):
    if isinstance(k, dict):
        # `or`, not `.get(key, fallback)` — canonical can be present but explicitly ''.
        return k.get('canonical') or k.get('term') or k.get('keyword') or str(k)
    return str(k)

def build_edges():
    # BUG 5 FIX: Guard against crash when the data directory doesn't exist yet
    if not os.path.exists(DATA_DIR):
        print(f"Warning: Faculty data directory not found at {DATA_DIR}. No edges generated.")
        return

    faculty = []
    filenames = []
    
    for filename in os.listdir(DATA_DIR):
        if not filename.endswith(".json"): continue
        with open(os.path.join(DATA_DIR, filename), 'r', encoding='utf-8') as f:
            fac = json.load(f)
            faculty.append(fac)
            filenames.append(filename)  # track filename alongside faculty
            
    embeddings = []
    for i, fac in enumerate(faculty):
        if MODEL is None:
            # mock embedding
            emb = np.random.rand(384)
        else:
            if fac.get('embedding'):
                emb = np.array(fac['embedding'])
            else:
                bio = fac.get('bio_raw', '')
                canonical = [get_canonical(k) for k in fac.get('extracted_keywords', [])]
                text = bio + " " + " ".join(canonical)
                emb = MODEL.encode(text) if text.strip() else np.zeros(384)
                
                # BUG 6 FIX: Save embedding back using the original filename, not fac['id']
                # fac['id'] could differ from the filename if manually edited
                fac['embedding'] = emb.tolist()
                with open(os.path.join(DATA_DIR, filenames[i]), 'w', encoding='utf-8') as f:
                    json.dump(fac, f, indent=2, ensure_ascii=False)
                    
        embeddings.append(emb)

    edges = []
    n = len(faculty)
    for i in range(n):
        for j in range(i + 1, n):
            fac1 = faculty[i]
            fac2 = faculty[j]
            
            kws1 = set([get_canonical(k) for k in fac1.get('extracted_keywords', [])])
            kws2 = set([get_canonical(k) for k in fac2.get('extracted_keywords', [])])
            shared = kws1.intersection(kws2)
            
            sim = cosine_similarity(embeddings[i], embeddings[j])
            
            # Combine semantic similarity and shared keyword count
            # e.g., sim * 0.7 + (len(shared) / 5) * 0.3
            weight = sim * 0.7 + min(len(shared) / 5, 1.0) * 0.3
            
            # threshold to keep graph sparse
            if weight > 0.4 or len(shared) >= 2:
                edges.append({
                    "source": fac1['id'],
                    "target": fac2['id'],
                    "shared_keywords": list(shared),
                    "weight": float(weight)
                })
                
    with open(EDGES_FILE, 'w', encoding='utf-8') as f:
        json.dump(edges, f, indent=2, ensure_ascii=False)
        
    print(f"Generated {len(edges)} edges among {n} faculty members.")

if __name__ == "__main__":
    build_edges()
