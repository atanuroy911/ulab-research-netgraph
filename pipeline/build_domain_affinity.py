"""
Generates a domain-affinity table: pairs of canonical research-domain labels that
represent good *interdisciplinary* collaboration opportunities (a method/technology
from one field applied to a problem in another), e.g. Machine Learning <-> Linguistics
(computational linguistics/NLP), IoT <-> Flood Control (environmental sensing).

This is deliberately NOT derived from embedding similarity — semantically close text
means "same field", the opposite of what we want here. It's a one-time LLM pass over
the canonical taxonomy (data/taxonomy.json), reviewable/editable afterward as its own
file (data/domain_affinity.json), used by build-cross-domain-edges.mjs to build the
"Cross-Disciplinary" graph.

Usage: python pipeline/build_domain_affinity.py [--target-pairs 50]
"""
import os
import re
import json
import argparse
import requests

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://192.168.123.47:11434/api/generate")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3:8b")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TAXONOMY_FILE = os.path.join(BASE_DIR, "data", "taxonomy.json")
OUTPUT_FILE = os.path.join(BASE_DIR, "data", "domain_affinity.json")


def build_prompt(terms, target_pairs):
    term_list = "\n".join(f"- {t}" for t in terms)
    return f"""You are helping a university identify interdisciplinary research collaboration
opportunities. Below is a list of research-domain labels used across ALL faculty
(all departments/schools combined).

Identify pairs of labels from this list where a METHOD/TECHNOLOGY from one field could be
productively applied to a PROBLEM/DOMAIN in a genuinely different field. Good examples of
the pattern (not necessarily in this list): "Machine Learning" + "Linguistics" (computational
linguistics/NLP), "IoT" + "Flood Control" (environmental sensing), "Data Science" +
"Public Health" (epidemiology), "Robotics" + "Agriculture" (precision farming).

Rules:
- Only pair labels that are genuinely DIFFERENT disciplines/fields — never near-synonyms or
  the same field worded differently (that's a similarity problem, not a collaboration one).
- Both "a" and "b" MUST be copied EXACTLY (verbatim, same spelling/case) from the list below.
  Do not invent, paraphrase, or abbreviate labels.
- Propose about {target_pairs} pairs, covering as many distinct fields as possible.
- "rationale" must be one short concrete sentence about what the combination could produce.

Return ONLY a JSON array, no other text:
[
  {{"a": "exact label from list", "b": "exact label from list", "rationale": "one sentence"}}
]

Labels:
{term_list}
"""


def call_ollama(prompt):
    response = requests.post(OLLAMA_URL, json={
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "keep_alive": -1,
    }, timeout=300)
    response.raise_for_status()
    content = response.json().get("response", "")

    fence_match = re.search(r'```(?:json)?\s*([\s\S]*?)```', content)
    if fence_match:
        content = fence_match.group(1).strip()
    else:
        array_match = re.search(r'\[[\s\S]*\]', content)
        content = array_match.group(0).strip() if array_match else content.strip()

    if not content:
        return []
    try:
        data = json.loads(content)
    except json.JSONDecodeError as e:
        print(f"Failed to parse LLM response as JSON: {e}")
        print(f"Raw (first 500 chars): {content[:500]}")
        return []
    return data if isinstance(data, list) else []


def main(target_pairs=50, chunk_size=250):
    if not os.path.exists(TAXONOMY_FILE):
        print(f"Taxonomy file not found at {TAXONOMY_FILE}. Run canonicalize-keywords first.")
        return

    taxonomy = json.load(open(TAXONOMY_FILE, encoding='utf-8'))
    terms = sorted(taxonomy.keys())
    term_lookup = {t.strip().lower(): t for t in terms}  # normalized -> canonical casing
    print(f"Loaded {len(terms)} canonical terms.")

    # Large taxonomies risk truncated/unreliable output in one shot — chunk if needed,
    # asking for proportionally fewer pairs per chunk.
    chunks = [terms[i:i + chunk_size] for i in range(0, len(terms), chunk_size)]
    pairs_per_chunk = max(10, target_pairs // max(len(chunks), 1))

    seen = set()
    affinities = []  # [{a, b, rationale}]
    rejected = 0

    for i, chunk in enumerate(chunks):
        print(f"Requesting pairs for chunk {i + 1}/{len(chunks)} ({len(chunk)} terms)...")
        prompt = build_prompt(chunk, pairs_per_chunk)
        raw_pairs = call_ollama(prompt)
        print(f"  Model proposed {len(raw_pairs)} candidate pairs.")

        for p in raw_pairs:
            if not isinstance(p, dict):
                rejected += 1
                continue
            a_raw = str(p.get('a', '')).strip()
            b_raw = str(p.get('b', '')).strip()
            rationale = str(p.get('rationale', '')).strip()

            a = term_lookup.get(a_raw.lower())
            b = term_lookup.get(b_raw.lower())

            # Both sides must be real, distinct taxonomy entries — reject anything invented.
            if not a or not b or a == b or not rationale:
                rejected += 1
                continue

            key = tuple(sorted((a, b)))
            if key in seen:
                continue
            seen.add(key)
            affinities.append({"a": key[0], "b": key[1], "rationale": rationale})

    print(f"Accepted {len(affinities)} affinity pairs, rejected {rejected} invalid candidates.")

    json.dump(affinities, open(OUTPUT_FILE, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    print(f"Wrote {OUTPUT_FILE}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--target-pairs', type=int, default=50, help='Approximate total number of affinity pairs to generate')
    parser.add_argument('--chunk-size', type=int, default=250, help='Max taxonomy terms per LLM call')
    args = parser.parse_args()
    main(args.target_pairs, args.chunk_size)
