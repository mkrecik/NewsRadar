from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pymongo import MongoClient
from bson.json_util import dumps
from bson import ObjectId
import json

# to run server: uvicorn get_articles_from_mongo:app --reload
# then run frontend

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = MongoClient("<url>")
db = client["newspaper"]
collection = db["articles"]

@app.get("/articles")
def get_articles():
    results = collection.find({
        "geocode_result.geometry.coordinates": {"$exists": True}
    })

    return json.loads(dumps(results)) 
