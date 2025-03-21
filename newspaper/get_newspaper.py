from newspaper import Article, build
import spacy
import json
import time

nlp = spacy.load("pl_core_news_lg")

sites_list = [
    # 'https://wiadomosci.onet.pl/',
    # 'https://www.onet.pl/', 
    'https://www.interia.pl/', 
    # 'https://www.tvn24.pl/', 
    # 'https://www.rmf24.pl/', 
    # 'https://www.polsatnews.pl/', 
    # 'https://www.wp.pl/'    
]


onet_whitelist = [
    'https://wiadomosci.onet.pl/', 
    # 'https://kultura.onet.pl/',
    # 'https://podroze.onet.pl/',
    # 'https://przegladsportowy.onet.pl/',
    # 'https://pogoda.onet.pl/'
]

interia_whitelist = [
    'https://wydarzenia.interia.pl/',
    # 'https://sport.interia.pl/',
    # 'https://biznes.interia.pl/',
    # 'https://geekweek.interia.pl/',
    # 'https://motoryzacja.interia.pl/',
]

wp_whitelist = [
    'https://wiadomosci.wp.pl/',
    # 'https://sport.wp.pl/',
    # 'https://finanse.wp.pl/',
    # 'https://kobieta.wp.pl/',
    # 'https://fitness.wp.pl/',
]

whitelist = onet_whitelist + wp_whitelist + interia_whitelist

article_urls = []
categories = []

for site in sites_list:
    news_site = build(site, memoize_articles=False)
    categor = news_site.category_urls()
    categories.extend(categor)
    site_urls = [article.url for article in news_site.articles]
    article_urls.extend(site_urls)

# print('Number of categories:', len(categories))
# print('categories:', categories)

article_urls = list(set(article_urls))
cleaned_article_urls = [url for url in article_urls if any (site in url for site in whitelist)]
article_urls = cleaned_article_urls

print('Number of articles:', len(article_urls))

articles_data = []
for i, article_url in enumerate(article_urls[:20]):
    try:
        print(f"[{i+1}/{len(article_urls)}] Processing: {article_url}")

        a = Article(article_url, language="pl")
        a.download()
        a.parse()

        if not a.text:
            continue
            
        time.sleep(1)

        doc = nlp(a.text)
        loc = [ent.text for ent in doc.ents if ent.label_ in ["LOC", "GPE", "ORG", "placeName", "orgName"]]

        summary = a.summary
        if not summary or summary == "":
            summary = a.text[:200] + "..."

        article_data = {
            "title": a.title,
            "url": a.url,
            "date": a.publish_date,
            "source": a.source_url,
            "text": a.text,
            "summary": summary,
            "authors": a.authors,
            "location": loc,
        }
        articles_data.append(article_data)

    except Exception as e:
        print(f"Error processing {article_url}: {e}")

with open('articles.json', 'w', encoding='utf-8') as f:
    json.dump(articles_data, f, ensure_ascii=False, indent=4)
