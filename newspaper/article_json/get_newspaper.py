from newspaper import Article, build
import spacy
import json
import time
import requests
from bs4 import BeautifulSoup
from dateutil.parser import parse as date_parse 
from pymongo import MongoClient
import json
from transformers import AutoTokenizer, AutoModelForTokenClassification, pipeline
import torch
import numpy as np

# pip install transformers torch json time requests beautifulsoup4 pymongo python-dateutil spacy newspaper3k lxml[html_clean] protobuf tiktoken
# python -m spacy download pl_core_news_lg

### baza danych
MONGO_URI = "mongodb+srv://user:RngCYztXFqOPhoQZ@articles.cndzn.mongodb.net/"

client = MongoClient(MONGO_URI)
db = client["newspaper"]
collection = db["articles"]

### geoexctacting model
ner_pipeline = pipeline('ner', model='clarin-pl/FastPDN', aggregation_strategy='simple')


sites_list = [
    # 'https://wiadomosci.onet.pl/',
    # 'https://www.onet.pl/', 
    'https://www.interia.pl/', 
    # 'https://www.tvn24.pl/', 
    # 'https://www.rmf24.pl/', 
    # 'https://www.polsatnews.pl/', 
    # 'https://www.wp.pl/'    
]

## pobieranie z WP jst niezgodne z ich regulaminem jbc
wp_whitelist = [
    'https://wiadomosci.wp.pl/',
    'https://sport.wp.pl/',
    'https://finanse.wp.pl/',
    'https://www.wp.pl/',
    "https://pogoda.wp.pl"
    "https://tech.wp.pl",
    "https://turystyka.wp.pl",
]

## z onetu nie możliwe przez newspaper
onet_whitelist = [
    "https://kultura.onet.pl",
    "https://www.onet.pl",
    "https://wiadomosci.onet.pl",
    "https://podroze.onet.pl",
    "https://przegladsportowy.onet.pl",
    "https://pogoda.onet.pl",
    "https://wiadomosci.onet.pl/kielce",
    "https://wiadomosci.onet.pl/krakow",
    "https://sport.onet.pl",
    "https://wiadomosci.onet.pl/poznan",
    "https://wiadomosci.onet.pl/nauka",
    "https://wiadomosci.onet.pl/trojmiasto",
    "https://wiadomosci.onet.pl/lublin",
    "https://wiadomosci.onet.pl/bialystok",
    "https://wiadomosci.onet.pl/wroclaw",
    "https://wiadomosci.onet.pl/szczecin",
    "https://wiadomosci.onet.pl/warszawa",
    "https://wiadomosci.onet.pl/opole",
    "https://wiadomosci.onet.pl/lodz",
    "https://wiadomosci.onet.pl/wbi",
    "https://podroze.onet.pl",
    "https://wiadomosci.onet.pl/slask",
    "https://wiadomosci.onet.pl/olsztyn",
    "https://wiadomosci.onet.pl",
    "https://technologie.onet.pl",
    "https://wiadomosci.onet.pl/kraj",
    "https://kultura.onet.pl",
    "https://wiadomosci.onet.pl/swiat",
    "https://pogoda.onet.pl",
    "https://wiadomosci.onet.pl/rzeszow",
    "https://wiadomosci.onet.pl/religia",
    "https://wiadomosci.onet.pl/lubuskie"
]

interia_whitelist = [
    "https://www.interia.pl/",
    "https://muzyka.interia.pl",
    "https://wydarzenia.interia.pl",
    "https://pogoda.interia.pl",
    "https://tygodnik.interia.pl",
    "https://biznes.interia.pl",
    "https://extra.interia.pl",
    "https://www.interia.pl",
    "https://zielona.interia.pl",
    "https://sport.interia.pl",
    "https://e.sport.interia.pl",
]

categories_dict = { 
    'Wydarzenia':   ["https://wydarzenia.interia.pl"],
    'Polityka':     ["https://www.interia.pl/"],
    'Sport':        ["https://sport.interia.pl",
                    "https://e.sport.interia.pl"],
    'Kultura':      ["https://muzyka.interia.pl"],
    'Pogoda':       ["https://pogoda.interia.pl",
                    "https://zielona.interia.pl"],
    'Gospodarka':   ["https://biznes.interia.pl"],
    'Inne':         ["https://extra.interia.pl",
                    "https://tygodnik.interia.pl"]
}

def get_category(url):
    for category, keywords in categories_dict.items():
        if any(keyword in url for keyword in keywords):
            return category
    return "Inne"

def extract_location(text):
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": localhost,
        "X-Title": YOUR_SITE_NAME,
    }

    prompt = (
        "Z tego tekstu wyodrębnij możliwie najdokładniejszą lokalizację zdarzenia — "
        "np. instytucję, ulicę, dzielnicę, miasto i kraj — w jednej linii, od najbardziej lokalnej "
        "do najbardziej ogólnej. Zwróć tylko samą lokalizację, bez żadnych komentarzy, bez cytowania tekstu.\n\n"
        f"{text.strip()}"
    )

    data = {
        "model": "mistralai/mistral-small-3.1-24b-instruct:free",
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 50,
        "temperature": 0.3
    }

    response = requests.post("https://openrouter.ai/api/v1/chat/completions",
                             headers=headers, data=json.dumps(data))
    response.raise_for_status()
    result = response.json()

    return result["choices"][0]["message"]["content"].strip()


whitelist = interia_whitelist

article_urls = []

for site in sites_list:
    news_site = build(site, memoize_articles=False)
    site_urls = [article.url for article in news_site.articles]
    article_urls.extend(site_urls)

article_urls = list(set(article_urls))
cleaned_article_urls = [url for url in article_urls if any (site in url for site in whitelist)]
article_urls = cleaned_article_urls

print('Number of articles:', len(article_urls))

articles_data = []
for i, article_url in enumerate(article_urls[:20]):
    try:
        print(f"[{i+1}/{len(article_urls)}] Processing: {article_url}")

        response = requests.get(article_url, timeout=10)
        soup = BeautifulSoup(response.content, "html.parser")

        time_tag = soup.find("time", attrs={"data-testid": "publish-date"})
        pub_date = None
        if time_tag and time_tag.has_attr("datetime"):
            pub_date = date_parse(time_tag["datetime"])

        a = Article(article_url, language="pl")
        a.download()
        a.parse()

        if not a.text:
            continue

        location = extract_location(a.text[:500]) 

        summary = a.summary
        if not summary or summary == "":
            summary = a.text[:200] + "..."

        article_data = {
            "title": a.title,
            "url": a.url,
            "date": a.publish_date.isoformat() if a.publish_date else pub_date.isoformat() if pub_date else None,
            "category": get_category(article_url),
            "source": a.source_url,
            "location": location,
            "summary": summary
        }
        articles_data.append(article_data)

    except Exception as e:
        print(f"Error processing {article_url}: {e}")

# Save articles to json
with open(r"article/interia_loc.json", "w", encoding="utf-8") as f:
    json.dump(articles_data, f, ensure_ascii=False, indent=4)


# if articles_data:
#     collection.insert_many(articles_data)
#     print(f"Wstawiono {len(articles_data)} artykułów do MongoDB.")
