from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pymongo import MongoClient
from bson.json_util import dumps
from bson import ObjectId
import json
import os

# from .api import MONGO_URI
MONGO_URI = os.environ["MONGO_URI"]

# to run server: uvicorn newspaper.get_articles_from_mongo:app --reload
# then run frontend

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = MongoClient(MONGO_URI)
db = client["newspaper"]
collection_articles = db["articles"]
collection_polygons = db["polygons"]

@app.get("/articles")
def get_articles():
    results = collection_articles.find({
        "geocode_result.geometry": {"$exists": True}
    })
    return json.loads(dumps(results)) 

@app.get("/polygons")
def get_polygons(limit: int = 10, offset: int = 0, level: str = None):
    query = {
        "geometry.type": { "$in": ["Polygon", "MultiPolygon"] }
    }

    if level == "country":
        query["address.country"] = { "$exists": True }
        query["address.state"] = { "$exists": False }
        query["address.region"] = { "$exists": False }
    elif level == "region":
        query["$or"] = [
            { "address.state": { "$exists": True } },
            { "address.region": { "$exists": True } },
            { "address.province": { "$exists": True } }
        ]
    elif level == "county":
        query["$or"] = [
            { "address.county": { "$exists": True } },
            { "address.administrative": { "$exists": True } },
            { "address.district": { "$exists": True } },  # DODANE
            { "address.city": { "$exists": True } },
            { "address.town": { "$exists": True } },
        ]


    results = collection_polygons.find(query).skip(offset).limit(limit)

    return json.loads(dumps(results))
