"""
Switch which archived LLM extraction is "active" (i.e. what extracted_keywords /
index.json / the embeddings+edges pipeline actually use) without re-calling the LLM.

Each faculty file can accumulate keyword_extractions from multiple models
(see extract_keywords.py). This just points extracted_keywords at one of them.
"""
import os
import json
import argparse

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data", "faculty")


def main(model, target_slug=None):
    if not os.path.exists(DATA_DIR):
        print(f"Data directory {DATA_DIR} not found.")
        return

    switched = skipped_locked = skipped_missing = already_active = 0

    for filename in sorted(os.listdir(DATA_DIR)):
        if not filename.endswith(".json") or filename == "example.json":
            continue

        slug = filename.replace(".json", "")
        if target_slug and slug != target_slug:
            continue

        filepath = os.path.join(DATA_DIR, filename)
        with open(filepath, 'r', encoding='utf-8') as f:
            fac = json.load(f)

        if 'extracted_keywords' in fac.get('locked_fields', []):
            print(f"Skip (locked/verified): {slug}")
            skipped_locked += 1
            continue

        history = fac.get('keyword_extractions', {})
        entry = history.get(model)
        if not entry:
            print(f"Skip (no '{model}' extraction on file): {slug}")
            skipped_missing += 1
            continue

        if fac.get('active_extraction_model') == model:
            already_active += 1
            continue

        fac['extracted_keywords'] = entry['keywords']
        fac['active_extraction_model'] = model

        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(fac, f, indent=2, ensure_ascii=False)
        switched += 1
        print(f"Switched {slug} -> {model}")

    print(
        f"Done. Switched: {switched}, already active: {already_active}, "
        f"skipped (locked): {skipped_locked}, skipped (no data for model): {skipped_missing}."
    )
    print("Re-run the taxonomy/embeddings/edges/index steps to reflect this in the graph and search.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', type=str, required=True, help='Model name whose stored extraction should become active')
    parser.add_argument('--target', type=str, default=None, help='Limit to a single faculty slug')
    args = parser.parse_args()
    main(args.model, args.target)
