from newspaper import Article, build
import json
import time
import requests
from bs4 import BeautifulSoup
from dateutil.parser import parse as date_parse 
from pymongo import MongoClient
import numpy as np
from openai import OpenAI
from datetime import datetime, timezone

from api import MONGO_URI, OPENROUTER_API_KEY

### baza danych
db_client = MongoClient(MONGO_URI)
db = db_client["newspaper"]
collection = db["articles"]
polygon_collection = db["polygons"]


### geoextracting model
ai_client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=OPENROUTER_API_KEY,
)

model_mistral = "mistralai/mistral-small-3.1-24b-instruct"
model_mistral_free = "mistralai/mistral-small-3.1-24b-instruct:free"
model_gemini = "google/gemini-2.0-flash-001"

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
    "https://pogoda.interia.pl/polska/prognoza",
    "https://gry.interia.pl/"
]

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

def extract_summary(soup):
    summary_tag = soup.find("p", class_="ids-paragraph--lead")
    if not summary_tag:
        summary_tag = soup.find("p", class_="sc-dkqQuH hKkjLe")
        if not summary_tag:
            summary_tag = soup.find("p", class_="article-lead")

    if summary_tag:
        return summary_tag.get_text(strip=True)

    return None

# Kategorie
kategorie = [
    "Wydarzenia",
    "Polityka",
    "Gospodarka i Społeczeństwo",
    "Kultura",
    "Sport",
    "Pogoda i Natura",
    "Inne"
]

def extract_category(url, text, model = model_gemini):
    if "pogoda" in url:
        return "Pogoda i Natura"
    elif "sport" in url:
        return "Sport"
    try:
        completion = ai_client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        f"Przeczytaj dany artykuł."
                        f"Na podstawie treści artykułu przypisz mu najbardziej pasującą kategorię spośród: "
                        f"{', '.join(kategorie[:-1])}. Gospodarka i Społeczeństwo to jedna kategoria, Pogoda i Natura to również jedna kategoria,  nie rozdzielaj ich. Jeśli coś pasuje do gospodarki, to ma kategorie Gospodarka i Społeczeństwo, jeśli coś pasuje do społeczeństwa to również ma kategorie Gospodarka i Społeczeństwo. Kategoria Pogoda i Natura działa na tej samej zasadzie. Odzielna kategoria o nazwie Społeczeństwo nie istnieje. Odzielna kategoria o nazwie Gospodarka nie istnieje. Odzielna kategoria o nazwie Pogoda nie istnieje. Odzielna kategoria o nazwie Natura nie istnieje. Jeśli żadna z nich naprawdę nie pasuje, przypisz kategorię 'Inne'. "
                        f"Zwróć tylko nazwę kategorii, bez dodatkowych komentarzy.\n\n"
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
        if completion and completion.choices:
            category = completion.choices[0].message.content.strip()
        else:
            print("Brak odpowiedzi od modelu. Ustawiam kategorię 'Inne'")
            category = "Inne"
        
        return category

    except Exception as e:
        print("Błąd w extract_category:", e)
        return "brak"

def extract_location(text, model = model_gemini):
    try:
        completion = ai_client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": (
                    "Z tekstu wyodrębnij najdokładniejszą lokalizację - miejsce wydarzenia artykułu."
                    "(np. budynek lub obiekt, pełny adres lub jeżeli nie ma dokładnego miejsca -  miejscowość, stan lub kraj) w oryginalnej nazwie. "
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

    news_site = build(site, memorize_articles=False)
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
    geometry_type = None
    address = result.get('address', {})

    # USTALAMY type:
    if geojson and geojson.get('type') in ["Polygon", "MultiPolygon"]:
        geometry_type = geojson['type']
        result = {
            'geometry': {
                'type': geometry_type
            },
            'center': {'lat': lat, 'lon': lon},
            'address': address
        }
    else:
        # fallback → Point
        result = {
            'geometry': {
                'type': 'Point'
            },
            'center': {'lat': lat, 'lon': lon},
            'address': address
        }

    return result

def remove_polygon_geometries(collection):
    result = collection.update_many(
        { "geocode_result.geometry.type": { "$in": ["Polygon", "MultiPolygon"] } },
        { "$unset": { "geocode_result.geometry.coordinates": "" } }
    )
    print(f"Removed coordinates from {result.modified_count} articles.")


def remove_polska(collection):
    for article in collection.find({
        "geocode_result.geometry.type": {"$in": ["Polygon", "MultiPolygon"]},
        "location": {"$in": ["Polska", "Polsce"]}
    }):
        collection.update_one(
            {"_id": article["_id"]},
            {"$unset": {"geocode_result.geometry.coordinates": ""}}
        )
        print(f"Removed poligon geometry (Polska): {article['title']}")

def save_poligons(geocode_result, polygon_collection, location, article_url):
    center = geocode_result["center"]
    address = geocode_result.get("address", {})

    existing = polygon_collection.find_one({
        "center.lat": center["lat"],
        "center.lon": center["lon"]
    })

    # alternatywnie można dodać warunek na address, np. porównać województwo, kraj, miasto:
    # is_duplicate = polygon_collection.find_one({
    #     "address.city": address.get("city"),
    #     "address.state": address.get("state")
    # })

    if existing:
        # unikamy duplikatów URL
        if "articles" not in existing or article_url not in existing["articles"]:
            polygon_collection.update_one(
                {"_id": existing["_id"]},
                {"$addToSet": {"articles": article_url}}
            )
    else:
        polygon_doc = {
            "location": location,
            "geometry": geocode_result["geometry"],
            "center": center,
            "address": address,
            "articles": [article_url]
        }
        polygon_collection.insert_one(polygon_doc)

def print_articles(site, whitelist):
    article_urls = get_aricles_urls(site, whitelist)

    existing_urls = collection.distinct("url")
    article_urls = [url for url in article_urls if url not in existing_urls]

    for i, article_url in enumerate(article_urls[:20]):
        try:
            print(f"[{i+1}/{len(article_urls)}] Article: {article_url}")

            response = requests.get(article_url, timeout=10)
            soup = BeautifulSoup(response.content, "html.parser")

            a = Article(article_url, language="pl")
            a.download()
            a.parse()

            if not a.text:
                continue

            pub_date = a.publish_date
            if not pub_date:
                pub_date = extract_pub_date(soup)

            summary = a.summary
            if not summary or summary == "":
                summary = extract_summary(soup)
                if not summary or summary == "":
                    summary = a.text[:200]


            print("Title: ", a.title)
            print("Date: ", pub_date)
            print("Summary: ", summary)
            print("Text: ", a.text[:200])
            print("Source: ", a.source_url.replace("https://", ""))
            print("\n")

        except Exception as e:
            print(f"Error processing {article_url}: {e}")


def process_articles(site, whitelist, collection):
    article_urls = get_aricles_urls(site, whitelist)

    existing_urls = collection.distinct("url")
    article_urls = [url for url in article_urls if url not in existing_urls]

    articles_data = []
    for i, article_url in enumerate(article_urls[:50]):
        try:
            print(f"[{i+1}/{len(article_urls)}] Processing: {article_url}")

            response = requests.get(article_url, timeout=10)
            soup = BeautifulSoup(response.content, "html.parser")

            a = Article(article_url, language="pl")
            a.download()
            a.parse()

            if not a.text:
                continue

            pub_date = a.publish_date
            if not pub_date:
                pub_date = extract_pub_date(soup)

            summary = a.summary
            if not summary or summary == "":
                summary = extract_summary(soup)
                if not summary or summary == "":
                    summary = f"{a.text[:250]}..."

            location = extract_location(a.text) 
            if location.strip().lower().rstrip('.') == "brak":
                continue

            geocode_result = geocode(location)
            if geocode_result is None:
                continue
            
            category = extract_category(a.source_url, a.text)

            # zapisz poligony do osobnej kolekcji
            if (
                geocode_result.get("geometry", {}).get("type") in ["Polygon", "MultiPolygon"]
                and "geometry" in geocode_result
            ):
                save_poligons(geocode_result, polygon_collection, location, article_url)
                geocode_result["geometry"] = {
                    "type": geocode_result["geometry"]["type"]
                }


            article_data = {
                "title": a.title,
                "url": a.url,
                "date": a.publish_date.isoformat() if a.publish_date else pub_date.isoformat() if pub_date else None,
                "category": category,
                "source": a.source_url,
                "location": location,
                "summary": summary,
                "geocode_result": geocode_result
            }
            articles_data.append(article_data)

        except Exception as e:
            print(f"Error processing {article_url}: {e}")

    return articles_data

def update_date(collection):
    for article in collection.find():
        if "date" not in article or article["date"] is None:
            date = extract_pub_date(article["url"])
            collection.update_one(
                {"_id": article["_id"]},
                {"$set": {"date": date.isoformat()}}
            )
            print(f"Zaktualizowano datę dla: {article['title']}")

def update_geocode(collection, polygon_collection):
    for article in collection.find():
        if "geocode_result" not in article or article["geocode_result"] is None or article["geocode_result"].get("geometry") is None:
            location = article.get("location")
            if location:
                geocode_result = geocode(location)
                if geocode_result is None:
                    print(f"Brak geocode dla: {article['title']}")
                    continue

                geometry_type = geocode_result.get("geometry", {}).get("type")

                if geometry_type in ["Polygon", "MultiPolygon"]:
                    save_poligons(geocode_result, polygon_collection, location, article["url"])

                    geocode_result["geometry"] = {
                        "type": geometry_type
                    }

                collection.update_one(
                    {"_id": article["_id"]},
                    {"$set": {"geocode_result": geocode_result}}
                )
                print(f"Zaktualizowano geokodowanie dla: {article['title']} ({geometry_type})")

def update_summary(collection):
    for article in collection.find():
        url = article.get("url")
        if not url:
            continue

        try:
            response = requests.get(url, timeout=10)
            soup = BeautifulSoup(response.content, "html.parser")
            summary = extract_summary(soup)

            # Jeśli dalej nie ma podsumowania, fallback na fragment tekstu
            if not summary:
                a = Article(url, language="pl")
                a.download()
                a.parse()
                summary = f"{a.text[:250]}..." if a.text else ""

            if summary:
                collection.update_one(
                    {"_id": article["_id"]},
                    {"$set": {"summary": summary}}
                )
                print(f"Zaktualizowano podsumowanie dla: {article['title']}")
            else:
                print(f"Brak treści dla: {url}")

        except Exception as e:
            print(f"Błąd podczas aktualizacji podsumowania dla: {url}\n{e}")


def update_category(collection):
    for article in collection.find():
        url = article.get("url")
        if not url:
            continue

        try:
            a = Article(url, language="pl")
            a.download()
            a.parse()
            text = a.text.strip()

            category = extract_category(url, text)
            if category:
                collection.update_one(
                    {"_id": article["_id"]},
                    {"$set": {"category": category}}
                )
                print(f"Zaktualizowano: {article.get('title', url)}, kategoria: {category}")
        except Exception as e:
            print(f"Błąd podczas pobierania lub aktualizacji kategorii dla: {url}\n{e}")


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

def fix_category_order(collection):
    result = collection.update_many(
        {"category": "Społeczeństwo i Gospodarka"},
        {"$set": {"category": "Gospodarka i Społeczeństwo"}}
    )
    print(f"Zaktualizowano {result.modified_count} artykułów.")

def rebuild_polygons_from_articles(article_collection, polygon_collection):
    # Pobieranie tylko artykułów z geometrią typu Polygon/MultiPolygon
    articles = article_collection.find({
        "geocode_result.geometry_type": { "$in": ["Polygon", "MultiPolygon"] }
    })

    count = 0
    for article in articles:
        location = article.get("location")
        url = article.get("url")

        if not location or not url:
            continue

        geocode_result = geocode(location)
        if not geocode_result:
            continue

        # tylko jeśli faktycznie znowu Polygon lub MultiPolygon
        if (
            geocode_result.get("geometry.type") in ["Polygon", "MultiPolygon"]
            and "geometry" in geocode_result
        ):
            center = geocode_result["center"]
            address = geocode_result.get("address", {})

            existing = polygon_collection.find_one({
                "center.lat": center["lat"],
                "center.lon": center["lon"]
            })

            if existing:
                polygon_collection.update_one(
                    {"_id": existing["_id"]},
                    {
                        "$addToSet": {"articles": url},
                        "$set": {
                            "location": location,
                            "address": address,
                            "geometry": geocode_result["geometry"]
                        }
                    }
                )
            else:
                polygon_doc = {
                    "location": location,
                    "geometry": geocode_result["geometry"],
                    "center": center,
                    "address": address,
                    "articles": [url]
                }
                polygon_collection.insert_one(polygon_doc)

            count += 1

    print(f"Updated or saved {count} poligons.")

def delete_articles_without_geocode(collection):
    result = collection.delete_many({"geocode_result": None})
    print(f"Deleted {result.deleted_count} with no geocode result.")

def fix_geometry(collection):
    for article in collection.find():
        geocode = article.get("geocode_result", {})
        if not geocode:
            continue
        geometry = geocode.get("geometry")
        geometry_type = geocode.get("geometrytype")

        # Jeśli geometry istnieje i geometry_type istnieje
        if geometry and geometry_type:
            geometry['type'] = geometry_type
            update_fields = {"geocode_result.geometry": geometry}
        
        # Jeśli nie ma geometry
        elif not geometry and geometry_type:
            geometry = {
                "type": geometry_type
            }
            update_fields = {"geocode_result.geometry": geometry}
        
        else:
            continue
        
        collection.update_one(
            {"_id": article["_id"]},
            {"$set": update_fields, "$unset": {"geocode_result.geometry_type": ""}}
        )
        print(f"Zaktualizowano geometry.type dla: {article['title']}")

def restore_geometry_type_from_polygons(article_collection, polygon_collection):
    polygons = polygon_collection.find()

    count = 0
    for poly in polygons:
        geometry_type = poly.get("geometry", {}).get("type")
        article_urls = poly.get("articles", [])

        for url in article_urls:
            article = article_collection.find_one({ "url": url })
            if not article:
                continue

            geocode_result = article.get("geocode_result", {})
            geometry = geocode_result.get("geometry")

            # Jeśli NIE MA geometry — dodajemy cały
            if geometry is None:
                geocode_result["geometry"] = { "type": geometry_type }
                article_collection.update_one(
                    { "_id": article["_id"] },
                    { "$set": { "geocode_result": geocode_result } }
                )
                count += 1
                continue

            # Jeśli jest geometry, ale brak type — uzupełniamy
            if "type" not in geometry:
                geometry["type"] = geometry_type
                article_collection.update_one(
                    { "_id": article["_id"] },
                    { "$set": { "geocode_result.geometry": geometry } }
                )
                count += 1

    print(f"Restored geometry.type for {count} articles.")

def remove_duplicate_title_date(collection):
    pipeline = [
        {"$group": {
            "_id": {"title": "$title", "date": "$date"},
            "ids": {"$addToSet": "$_id"},
            "count": {"$sum": 1}
        }},
        {"$match": {"count": {"$gt": 1}}}
    ]
    
    duplicates = list(collection.aggregate(pipeline))
    removed_count = 0
    
    for dup in duplicates:
        ids = dup["ids"]
        ids_to_remove = ids[1:]
        
        result = collection.delete_many({"_id": {"$in": ids_to_remove}})
        removed_count += result.deleted_count
        
        print(f"[DUPLICATE TITLE+DATE] title='{dup['_id']['title']}' date='{dup['_id']['date']}' → removed {result.deleted_count} duplicates")
    
    print(f"\n=== DUPLICATE TITLE+DATE CLEANUP COMPLETE ===")
    print(f"Total duplicates removed: {removed_count}")
    print("============================================\n")

if __name__ == "__main__":
    articles_data = process_articles(site, whitelist, collection)
    # print_articles(site, whitelist)

    # Save to MongoDB
    if articles_data:
        collection.insert_many(articles_data)
        print(f"Saved {len(articles_data)} articles to MongoDB.")

    # remove_duplicate_title_date(collection)
    # update_geocode(collection, polygon_collection)
    # fix_all(collection)

    # remove_polygon_geometries(collection)
    # restore_geometry_type_from_polygons(collection, polygon_collection)

    # remove_polska(collection)
    # update_geocode_json(r"article_json/interia_gemini2304.json")
    # update_geocode(collection)
    # delete_articles_without_geocode(collection)
    # update_category(collection)
    # rebuild_polygons_from_articles(collection, polygon_collection)
    # fix_category_order(collection)
    # fix_geometry_type(collection)
    # update_summary(collection)



