import { categoryColors } from './constants.js';

export function handleSearch(searchInput, map) {
    const query = searchInput.value;
    if (!query) return;
  
    fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`)
      .then(res => res.json())
      .then(data => {
        if (data && data[0]) {
          const lat = parseFloat(data[0].lat);
          const lon = parseFloat(data[0].lon);
          map.setView([lat, lon], 13);
        } else {
          alert("Nie znaleziono lokalizacji");
        }
      });
  }
  
export function style_popup(category, source, location, date, article) {
    const articleId = article._id?.$oid;
    const imageUrl = `static/${articleId}.png`;

    const imageTag = `
        <img src="${imageUrl}" alt="" 
            style="max-width:100%; height:auto; margin-top:5px; border-radius: 10px; display:none;"
            onerror="this.style.display='none';"
            onload="this.style.display='block';">
    `;

    return `
    <div class="popup-article">
      <a href="${article.url}" target="_blank"><h3 class="popup-article-title">${article.title}</h3></a>
      <div class="popup-article-info">
        <div class="popup-tags">
          <p class="popup-article-category" style="background-color: ${categoryColors[category] || "#000"};">${category}</p>
          <p class="popup-article-location">${location}</p>
          <p class="popup-article-source">${source}</p>
        </div>
        <p class="popup-article-date">${date}</p>
      </div>
      <p class="popup-article-summary">${article.premium_summary ? article.premium_summary : article.summary}</p>
      ${imageTag}
    </div>`;
}



export function locateUser(map) {
  map.locate({ setView: false, watch: false });

    map.once('locationfound', function (e) {
      map.setView(e.latlng, 13);
  });
  
    map.once('locationerror', (e) => {
        alert("Nie udało się pobrać lokalizacji: " + e.message);
    });
  }