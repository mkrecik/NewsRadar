from newspaper import build
import json

sites_list = [
    'https://wiadomosci.onet.pl/',
    'https://www.onet.pl/', 
    'https://www.interia.pl/', 
    'https://www.tvn24.pl/', 
    'https://www.rmf24.pl/', 
    'https://www.polsatnews.pl/', 
    'https://www.wp.pl/'    
]

for site in sites_list:
    try:
        print(f"Building site: {site}")
        news_site = build(site, memoize_articles=False)
        categories = list(news_site.category_urls())
        
        # Bez protokołu i końcowego slasha dla nazw plików
        domain = site.replace("https://", "").replace("http://", "").strip("/").replace(".", "_")
        filename = f"categories/{domain}_categories.json"

        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(categories, f, ensure_ascii=False, indent=4)

        print(f"Saved {len(categories)} categories to {filename}")
    except Exception as e:
        print(f"Error processing {site}: {e}")
