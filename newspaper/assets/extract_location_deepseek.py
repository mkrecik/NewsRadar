import json
from openai import OpenAI


articles = json.load(open(r'article/interia_deep.json', 'r', encoding='utf-8'))

client = OpenAI(
  base_url="https://openrouter.ai/api/v1",
  api_key="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",
)


def extract_location(article):
    """Wyciąga lokalizacje z podanego tekstu przy użyciu DeepSeek."""
    prompt = (
        "Z tekstu poniżej wyodrębnij najdokładniejszą lokalizację głównego wydarzenia "
        "(jeśli istnieje). Zwróć tylko nazwę miejsca (np. budynek, ulica, miasto, kraj). "
        "Jeśli brak konkretnej lokalizacji, napisz: 'brak'.\n\n"
        f"{article['text']}"
    )
    completion = client.chat.completions.create(
        model="deepseek/deepseek-r1:free",
        messages=[
            {"role": "user", "content": prompt}
        ]
    )
    print("DEBUG: Odpowiedź DeepSeek:", completion)
    
    locations = completion.choices[0].message.content.strip()
    article['location'] = locations
    return locations

for article in articles:
    locations = extract_location(article)
    print(f"Lokalizacje w artykule '{article['title']}': {locations}\n\n")
    
with open(r'newspaper/article/interia.json', 'w', encoding='utf-8') as f:
    json.dump(articles, f, ensure_ascii=False, indent=4)
