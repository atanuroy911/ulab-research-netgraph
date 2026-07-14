import os
import json
import requests
import argparse
from datetime import datetime, timezone

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://192.168.123.47:11434/api/generate")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3:8b")  # default to tagged name; bare 'llama3' does not exist
KEYWORD_COUNT = int(os.environ.get("KEYWORD_COUNT", "15"))

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data", "faculty")

import re

def extract_keywords_from_text(text, count=None):
    n = count if count is not None else KEYWORD_COUNT
    prompt = f"""
    Extract exactly {n} research-domain phrases from the following academic profile
    (fewer only if the profile genuinely does not support that many distinct phrases).
    Return ONLY a JSON array, like this:
    [
      {{"term": "cognitive radio networks", "canonical": "Wireless Networks", "weight": 0.9, "source": "bio+pubs", "verified": false}}
    ]
    "canonical" must be a short, real label for this specific phrase (2-4 words), never
    a placeholder or the literal example above — every keyword needs its own distinct
    canonical value.
    Weight should be 0.1 to 1.0 based on prominence. Return ONLY the JSON. No other text.
    
    Profile Text:
    {text}
    """
    
    try:
        response = requests.post(OLLAMA_URL, json={
            "model": OLLAMA_MODEL,
            "prompt": prompt,
            "stream": False,
            "keep_alive": -1  # Must be integer, NOT string "-1" — Ollama rejects the string with 400
        }, timeout=120)
        response.raise_for_status()
        content = response.json().get("response", "")
        
        # LLMs often wrap JSON in markdown fences or precede it with prose ("Here is the array:").
        # Strategy: try code fence first, then extract raw JSON array/object from anywhere in the response.
        fence_match = re.search(r'```(?:json)?\s*([\s\S]*?)```', content)
        if fence_match:
            content = fence_match.group(1).strip()
        else:
            # Look for a JSON array [...] — grab from first [ to last ] (greedy, handles nested arrays)
            array_match = re.search(r'\[[\s\S]*\]', content)
            if array_match:
                content = array_match.group(0).strip()
            else:
                # Fallback: look for a JSON object {...}
                obj_match = re.search(r'\{[\s\S]*\}', content)
                content = obj_match.group(0).strip() if obj_match else content.strip()
        
        # Guard: empty response means the model generated nothing (empty prompt or context overflow)
        if not content:
            print(f"Empty response from Ollama — model generated no output.")
            return []

        data = json.loads(content)
        # Handle cases where it returns a dict with a key instead of a raw array
        if isinstance(data, dict):
            for key in ["keywords", "phrases", "research_domains"]:
                if key in data:
                    return data[key]
            # fallback: return the first list it finds
            for val in data.values():
                if isinstance(val, list):
                    return val
            return []
            
        return data if isinstance(data, list) else []
    except requests.HTTPError as e:
        # Print the actual Ollama error body so failures are diagnosable
        print(f"Ollama HTTP error {e.response.status_code}: {e.response.text[:300]}")
        return []
    except Exception as e:
        print(f"Error parsing Ollama response: {e}")
        return []

MAX_CANONICAL_WORDS = 6

def _split_comma_list(text):
    """
    If `text` is a comma-separated list of short items (e.g. weaker models sometimes
    dump "Deep Learning, Computer Vision, IoT, Robotics" into one canonical instead of
    four separate keywords), split it. Returns None if it doesn't look like a clean list
    (e.g. "Environmental, Social, and Governance" is one concept — has an "and" before
    the last item and each fragment alone isn't a real keyword — so it's left alone).
    """
    if ' and ' in text.lower():
        return None
    parts = [p.strip() for p in text.split(',') if p.strip()]
    if len(parts) >= 2 and all(0 < len(p.split()) <= 4 for p in parts):
        return parts
    return None

# Any exact canonical the prompt itself has ever used as a placeholder/example — models
# sometimes echo the example verbatim instead of substituting a real value for it.
KNOWN_PLACEHOLDER_CANONICALS = {"short canonical form"}

def sanitize_keywords(keywords):
    """
    Guards against weaker models (e.g. gemma) not following the "short canonical form"
    instruction and instead dumping a full sentence/clause into canonical — which then
    shows up verbatim as "a keyword" in the directory, graph, and search. Every keyword
    that reaches storage must have a short, atomic canonical label.
    """
    clean = []
    for kw in keywords:
        if not isinstance(kw, dict):
            continue
        term = str(kw.get('term', '')).strip()
        canonical = str(kw.get('canonical') or term).strip()
        if not canonical:
            continue

        try:
            weight = max(0.1, min(1.0, float(kw.get('weight', 0.5))))
        except (TypeError, ValueError):
            weight = 0.5
        source = kw.get('source', '')
        verified = bool(kw.get('verified', False))

        if canonical.strip().lower() in KNOWN_PLACEHOLDER_CANONICALS:
            canonical = term or canonical

        # Always check for a comma-joined list first, regardless of total word count
        # (e.g. "Deep Learning, Computer Vision, IoT, Robotics" is only 6 words but is
        # clearly 4 separate keywords, not one).
        split = _split_comma_list(canonical)
        if split:
            for part in split:
                clean.append({'term': part, 'canonical': part, 'weight': weight, 'source': source, 'verified': verified})
            continue

        if len(canonical.split()) > MAX_CANONICAL_WORDS:
            # One long descriptive clause with no clean split (the gemma-style bug) —
            # never store the raw sentence as a "keyword"; trim it to a short label and
            # keep the original wording in `term` for context. Plain ASCII "..." — avoid
            # non-ASCII punctuation here, it's prone to mangling across editors/encodings.
            canonical = ' '.join(canonical.split()[:MAX_CANONICAL_WORDS]) + '...'

        clean.append({'term': term or canonical, 'canonical': canonical, 'weight': weight, 'source': source, 'verified': verified})

    # Example-agnostic defense: whichever literal string the prompt happens to use, a
    # model that fails to individuate keywords collapses most/all of them onto one
    # identical canonical. That's the actual signature of this bug class (we've now hit
    # it twice with two different literal strings) — not any specific blocked word.
    if len(clean) >= 3:
        from collections import Counter
        counts = Counter(k['canonical'] for k in clean)
        most_common_value, most_common_count = counts.most_common(1)[0]
        if most_common_count / len(clean) >= 0.5:
            for k in clean:
                if k['canonical'] == most_common_value and k['term'] and k['term'] != most_common_value:
                    k['canonical'] = k['term']

    return clean

def main(target_slug=None, force=False, count=None):
    if not os.path.exists(DATA_DIR):
        print(f"Data directory {DATA_DIR} not found.")
        return

    for filename in os.listdir(DATA_DIR):
        if not filename.endswith(".json"): continue
        
        slug = filename.replace(".json", "")
        if target_slug and slug != target_slug:
            continue
            
        filepath = os.path.join(DATA_DIR, filename)
        with open(filepath, 'r', encoding='utf-8') as f:
            fac = json.load(f)
            
        locked_fields = fac.get('locked_fields', [])
        extracted = fac.get('extracted_keywords', [])
        
        if 'extracted_keywords' in locked_fields or (len(extracted) > 0 and not force):
            if not target_slug:
                print(f"Skipping {filename} - already extracted or locked.")
            continue
            
        print(f"Extracting keywords for {filename}...")
        
        bio = fac.get('bio_raw', '')[:5000]  # Truncate massive bios
        interests = " ".join(fac.get('stated_interests', []))
        pubs = " ".join(fac.get('publications_raw', [])[:5])  # limit to first 5 for context size

        # Measure actual content, not the template — full_text always starts with ~38 chars
        # of template text ("Bio: \nInterests: \nPublications: ") even when all fields are empty.
        actual_content = (bio + interests + pubs).strip()
        if len(actual_content) < 20:
            print(f"Not enough text for {filename} — skipping.")
            continue

        full_text = f"Bio: {bio}\nInterests: {interests}\nPublications: {pubs}"
        full_text = full_text[:8000]  # Hard truncate to stay within context window
            
        keywords = sanitize_keywords(extract_keywords_from_text(full_text, count=count))
        if keywords:
            # Archive per-model extraction history so different LLMs' outputs can be
            # compared/switched between later without re-running the (slow, costly) LLM call.
            history = fac.setdefault('keyword_extractions', {})

            # First time this file is touched under the versioned schema: the existing
            # extracted_keywords predates per-model tracking, so preserve it under whichever
            # model previously produced it (best-effort attribution) rather than losing it.
            if not history and extracted:
                prior_model = fac.get('active_extraction_model') or 'legacy'
                history[prior_model] = {
                    'keywords': extracted,
                    'extracted_at': fac.get('updated_at') or None,
                }

            history[OLLAMA_MODEL] = {
                'keywords': keywords,
                'extracted_at': datetime.now(timezone.utc).isoformat(),
            }

            fac['extracted_keywords'] = keywords
            fac['active_extraction_model'] = OLLAMA_MODEL

            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(fac, f, indent=2, ensure_ascii=False)
            print(f"Success: extracted {len(keywords)} keywords with {OLLAMA_MODEL}.")
        else:
            print(f"Failed to extract keywords for {filename}.")
            
    print("Keyword extraction complete.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--target', type=str, help='Target slug to scrape', default=None)
    parser.add_argument('--force', action='store_true', help='Force extraction even if already exists')
    parser.add_argument('--count', type=int, default=None, help='Number of keywords to extract per faculty (overrides KEYWORD_COUNT env var)')
    args = parser.parse_args()
    main(args.target, args.force, args.count)
