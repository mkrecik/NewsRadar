import json
from openai import OpenAI


articles = json.load(open(r'newspaper/article/interia.json', 'r', encoding='utf-8'))

client = OpenAI(
  base_url="https://openrouter.ai/api/v1",
  api_key="<API_KEY>",
)


def extract_location(article):
    """Wyciąga lokalizacje z podanego tekstu przy użyciu DeepSeek."""
    prompt = f"Przeczytaj dany artykuł:\n\n{article['text']}. Zdecyduj czy wydarzenie opisane w artykule jest czymś co wydarzyło się w jakiejś lokalizacji, czy bardziej czymś ogólnym co nie można odnieść przestrzennie na mapie w postaci punktu. Jeśli nie można przypisać wydarzeniu konkretnej lokalizacji, którą można zgeokodować, to zwróć informację 'brak lokalizacji w tekście', a jeśli da się to wyciągnij informacje o jak najdokładniejszej lokalizacji wydarzenia z tego artykułu. Ogranicz się do jak namniejszej liczby informacji o lokalizacji, wystarczy sama lokalizacja geograficzna (miasto, kraj, ulica, konkretny budynek), nie podawaj żadnych uzasadnień i opisów. Jeśli znajdziesz więcej niż jedną lokalizację to zdecyduj która jest najważniejsza i najdokładniejsza i w której rzeczywiście coś się wydarzyło i czy dotyczy głównego tematu artykułu. \n\n"

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
