from newspaper import Article, build
import json
import time
import requests
from bs4 import BeautifulSoup
from dateutil.parser import parse as date_parse 
from pymongo import MongoClient
from transformers import AutoTokenizer, AutoModelForTokenClassification, pipeline
import torch
import numpy as np
from openai import OpenAI
from datetime import datetime

from api import MONGO_URI, OPENROUTER_API_KEY

# pip install transformers torch json time requests beautifulsoup4 pymongo python-dateutil spacy newspaper3k lxml[html_clean] protobuf tiktoken
# python -m spacy download pl_core_news_lg

### baza danych

db_client = MongoClient(MONGO_URI)
db = db_client["newspaper"]
collection = db["articles"]

### geoextracting model
ai_client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=OPENROUTER_API_KEY,
)

model_mistral = "mistralai/mistral-small-3.1-24b-instruct"
model_mistral_free = "mistralai/mistral-small-3.1-24b-instruct:free"
model_gemini = "google/gemini-2.0-flash-001"
model_gpt = "openai/gpt-4.1"

site = 'https://www.interia.pl/'

whitelist = [
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
blacklist = [
    "https://pogoda.interia.pl/polska/prognoza"
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


def extract_location(text, model = model_gemini):
    try:
        completion = ai_client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": (
                    "Z tekstu wyodrębnij najdokładniejszą lokalizację - miejsce wydarzenia artykułu."
                    "(np. budynek lub obiekt, pełny adres lub jeżeli nie ma dodkładnego miejsca -  miejscowość, stan lub kraj) w oryginalnej nazwie. "
                    "Zwróć TYLKO lokalizację, bez cytowania lub komentarzy. "
                    "Jeśli znajdziesz więcej niż jedną lokalizację to zdecyduj która jest najważniejsza i najdokładniejsza "
                    "i w której rzeczywiście coś się wydarzyło i czy dotyczy głównego tematu artykułu."
                    "Jeśli nie da się przypisać lokalizacji, napisz tylko 'brak'. \n\n"
                    )
                },
                {
                    "role": "user",
                    "content": text.strip()
                }
            ],
            extra_headers={
                "HTTP-Referer": "http://localhost",
                "X-Title": "NewsRadar"
            }
        )
        return completion.choices[0].message.content.strip()

    except Exception as e:
        print("Błąd w extract_location:", e)
        return "brak"

def get_aricles_urls(site, whitelist):
    article_urls = []

    news_site = build(site, memoize_articles=False)
    site_urls = [article.url for article in news_site.articles]
    article_urls.extend(site_urls)

    article_urls = list(set(article_urls))
    cleaned_article_urls = [url for url in article_urls if any (site in url for site in whitelist)]
    article_urls = cleaned_article_urls

    filtered_urls = [
        url for url in cleaned_article_urls
        if not any(bad in url for bad in blacklist)
    ]

    print('Number of articles:', len(filtered_urls))

    return filtered_urls

def extract_pub_date(soup):
    time_tag = soup.find("time", attrs={"data-testid": "publish-date"})
    if time_tag and time_tag.has_attr("datetime"):
        try:
            return date_parse(time_tag["datetime"])
        except Exception as e:
            print("Błąd parsowania daty z <time>:", e)

    meta_tag = soup.find("meta", attrs={"itemprop": "datePublished"})
    if meta_tag and meta_tag.has_attr("content"):
        try:
            return date_parse(meta_tag["content"])
        except Exception as e:
            print("Błąd parsowania daty z <meta>:", e)

    return datetime.now()

def geocode_points(query):
    url = "https://nominatim.openstreetmap.org/search"
    params = {
        'q': query,
        'format': 'json',
        'limit': 1,
        'polygon_geojson': 1,
        'addressdetails': 1,
        'accept-language': 'pl',
    }
    headers = {
        'User-Agent': 'WiadoMo-NewsRadar/1.0 (newsradar.wiadomo@gmail.com)'
    }

    response = requests.get(url, params=params, headers=headers)
    data = response.json()

    if not data:
        return None

    result = data[0]
    lat = float(result['lat'])
    lon = float(result['lon'])
    address = result.get('address', {})

    return {
        'geometry': {
            'type': 'Point',
            'coordinates': [lon, lat]
        },
        'center': {'lat': lat, 'lon': lon},
        'address': address
    }


def geocode(query):
    url = "https://nominatim.openstreetmap.org/search"
    params = {
        'q': query,
        'format': 'json',
        'limit': 1,
        'polygon_geojson': 1,
        'addressdetails': 1,
        'accept-language': 'pl',
    }
    headers = {
        'User-Agent': 'WiadoMo-NewsRadar/1.0 (newsradar.wiadomo@gmail.com)'
    }

    response = requests.get(url, params=params, headers=headers)
    data = response.json()

    if not data:
        return None

    result = data[0]
    lat = float(result['lat'])
    lon = float(result['lon'])
    geojson = result.get('geojson')
    object_class = result.get('class')
    object_type = result.get('type')
    address = result.get('address', {})

    # Zwróć poligon tylko dla jednostek administracyjnych
    if object_class == 'boundary' and object_type == 'administrative' and geojson:
        geometry_type = geojson['type']
        result =  {
            'geometry_type': geometry_type,
            'geometry': geojson,
            'center': {'lat': lat, 'lon': lon},
            'address': address
        }
    else:
        result = {
            'geometry_type': 'Point',
            'geometry': {'type': 'Point', 'coordinates': [lon, lat]},
            'center': {'lat': lat, 'lon': lon},
            'address': address
        }

    return result

def remove_polygon_geometries(collection):
    for article in collection.find({
        "geocode_result.geometry.type": {"$in": ["Polygon", "MultiPolygon"]}
    }):
        collection.update_one(
            {"_id": article["_id"]},
            {"$unset": {"geocode_result.geometry": ""}}
        )
        print(f"Removed poligon: {article['title']}")

def remove_polska(collection):
    for article in collection.find({
        "geocode_result.geometry.type": {"$in": ["Polygon", "MultiPolygon"]},
        "location": {"$in": ["Polska", "Polsce"]}
    }):
        collection.update_one(
            {"_id": article["_id"]},
            {"$unset": {"geocode_result.geometry": ""}}
        )
        print(f"Removed poligon geometry (Polska): {article['title']}")


def process_articles(site, whitelist, collection):
    article_urls = get_aricles_urls(site, whitelist)

    existing_urls = collection.distinct("url")
    article_urls = [url for url in article_urls if url not in existing_urls]

    articles_data = []
    for i, article_url in enumerate(article_urls):
        try:
            print(f"[{i+1}/{len(article_urls)}] Processing: {article_url}")

            response = requests.get(article_url, timeout=10)
            soup = BeautifulSoup(response.content, "html.parser")

            pub_date = extract_pub_date(soup)

            a = Article(article_url, language="pl")
            a.download()
            a.parse()

            if not a.text:
                continue

            location = extract_location(a.text) 

            if location.strip().lower().rstrip('.') == "brak":
                continue

            summary = a.summary
            if not summary or summary == "":
                summary = a.text[:200] + "..."

            geocode_result = geocode_points(location)

            if geocode_result is None:
                continue

            article_data = {
                "title": a.title,
                "url": a.url,
                "date": a.publish_date.isoformat() if a.publish_date else pub_date.isoformat() if pub_date else None,
                "category": get_category(article_url),
                "source": a.source_url,
                "location": location,
                "summary": summary,
                "geocode_result": geocode_result
            }
            articles_data.append(article_data)

        except Exception as e:
            print(f"Error processing {article_url}: {e}")

    return articles_data

def update_geocode(collection):
    for article in collection.find():
        if "geocode_result" not in article or article["geocode_result"] is None:
            location = article.get("location")
            if location:
                geocode_result = geocode(location)
                collection.update_one(
                    {"_id": article["_id"]},
                    {"$set": {"geocode_result": geocode_result}}
                )
                print(f"Updated geocode for article: {article['title']}")

def update_date(collection):
    for article in collection.find():
        if "date" not in article or article["date"] is None:
            date = extract_pub_date(article["url"])
            collection.update_one(
                {"_id": article["_id"]},
                {"$set": {"date": date.isoformat()}}
            )
            print(f"Updated date for article: {article['title']}")

def update_geocode_json(path):
    articles_data = json.load(open(path, "r", encoding="utf-8"))

    for article in articles_data:
        geocode_result = article.get("geocode_result")
        if geocode_result is None:
            location = article.get("location")
            if location:
                geocode_result = geocode(location)
                article["geocode_result"] = geocode_result
                print(f"Updated geocode result for article: {article['title']}")
    
    json.dump(articles_data, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=4)

def delete_articles_without_geocode(collection):
    result = collection.delete_many({"geocode_result": None})
    print(f"Deleted {result.deleted_count} with no geocode result.")

if __name__ == "__main__":
    articles_data = process_articles(site, whitelist, collection)

    # Save articles to json
    # with open(r"article_json/interia_gemini2304_3.json", "w", encoding="utf-8") as f:
    #     json.dump(articles_data, f, ensure_ascii=False, indent=4)
    # print(f"Saved to json.")

    # Save to MongoDB
    if articles_data:
        collection.insert_many(articles_data)
        print(f"Saved {len(articles_data)} articles to MongoDB.")

    # remove_polygon_geometries(collection)
    # remove_polska(collection)
    # update_geocode_json(r"article_json/interia_gemini2304.json")
    # update_geocode(collection)
    # delete_articles_without_geocode(collection)



