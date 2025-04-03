from pymongo import MongoClient
import json

# URI z danymi logowania i hostem (np. MongoDB Atlas)
MONGO_URI = "URI"

client = MongoClient(MONGO_URI)
db = client["newspaper"]
collection = db["articles"]

articles_path = r"article/interia.json"
with open(articles_path, "r", encoding="utf-8") as file:
    articles_data = json.load(file)

if articles_data:
    collection.insert_many(articles_data)
    print(f"Wstawiono {len(articles_data)} artykułów do MongoDB.")
