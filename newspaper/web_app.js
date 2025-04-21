var map = L.map('map').setView([52.237049, 21.017532], 13);
L.tileLayer('https://api.maptiler.com/maps/winter-v2/{z}/{x}/{y}.png?key=h7HjjXDoOt4QndexKLba', {
    attribution: '<a href="https://www.maptiler.com/copyright/" target="_blank">&copy; MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap contributors</a>'

}).addTo(map);

const categoryIcons = {
    "Wydarzenia": L.icon({ iconUrl: 'images/wydarzenia_icon.png', iconSize: [16, 16], iconAnchor: [8, 8], popupAnchor: [0, -16] }),
    "Polityka": L.icon({ iconUrl: 'images/polityka_icon.png', iconSize: [16, 16], iconAnchor: [8, 8], popupAnchor: [0,-16] }),
    "Sport": L.icon({ iconUrl: 'images/sport_icon.png', iconSize: [16, 16], iconAnchor: [8, 8], popupAnchor: [0, -16] }),
    "Kultura": L.icon({ iconUrl: 'images/kultura_icon.png', iconSize: [16, 16], iconAnchor: [8, 8], popupAnchor: [0, -16] }),
    "Pogoda": L.icon({ iconUrl: 'images/pogoda_icon.png', iconSize: [16, 16], iconAnchor: [8, 8], popupAnchor: [0, -16] }),
    "Gospodarka": L.icon({ iconUrl: 'images/gospodarka_icon.png', iconSize: [16, 16], iconAnchor: [8, 8], popupAnchor: [0, -16] }),
    "Inne": L.icon({ iconUrl: 'images/inne_icon.png', iconSize: [16, 16], iconAnchor: [8, 8], popupAnchor: [0, -16] })
  };

const categoryColors = {
    "Wydarzenia": "#660001",
    "Polityka": "#990001",
    "Sport": "#0D5F8C",
    "Kultura": "#4E8CB0",
    "Pogoda": "#00314C",
    "Gospodarka": "#CC0002",
  };

const categoryLayers = {
    "Wydarzenia": L.layerGroup(),
    "Polityka": L.layerGroup(),
    "Gospodarka": L.layerGroup(),
    "Sport": L.layerGroup(),
    "Kultura": L.layerGroup(),
    "Pogoda": L.layerGroup(),
    "Inne": L.layerGroup()
};

const markerLayer = L.layerGroup().addTo(map);
const polygonLayer = L.layerGroup().addTo(map);

// pobranie danych z backendu
fetch('http://127.0.0.1:8000/articles')
  .then(response => response.json())
  .then(data => {
    data.forEach(article => {
      const geometry = article.geocode_result?.geometry;
      const category = article.category;
      let articleDate = "";
      if (article.date) {
        articleDate = new Date(article.date).toLocaleDateString('pl-PL', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
      } 
      
      process_geometry(geometry, category, article, articleDate);
    });
  })
  .catch(error => console.error('Błąd podczas ładowania artykułów:', error));


function process_geometry(geometry, category, article, date) {
    if (!geometry) return;

    const icon = getIconForCategory(category); 

    if (geometry.type === "Point") {
        const [lon, lat] = geometry.coordinates;
        const marker = L.marker([lat, lon], { icon: icon }).addTo(markerLayer);
        categoryLayers[category]?.addLayer(marker);
        marker.bindPopup(style_popup(category, date, article));
    }

    if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") {
        const color = categoryColors[category] || "#000000";
        const polygon = L.polygon(
            geometry.coordinates.map(ring =>
                ring.map(coord => [coord[1], coord[0]])
            ),
            {
                color: color,
                fillColor: color,
                fillOpacity: 0.1,
                weight: 2
            }
        ).addTo(polygonLayer);
        polygon.bindPopup(style_popup(category, date, article));
        categoryLayers[category]?.addLayer(polygon);
    }
    
}

function getIconForCategory(category) {
    return categoryIcons[category] || L.icon({ iconUrl: 'path/to/default_icon.png', iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -32] });
}

function style_popup(category, date, article) {
    const color = categoryColors[category] || "#000000";
    return `
        <div class="popup-article">
            <a href="${article.url}" target="_blank"><h3 class="popup-article-title">${article.title}</h3></a>
            <div class="popup-article-info">
                <p class="popup-article-category" style="background-color: ${color};">${category}</p>
                <p>${date}</p>
            </div>
            <p>${article.summary}</p>
        </div>
    `;
}

Object.values(categoryLayers).forEach(layer => layer.addTo(map));
const CategoryToggleControl = L.Control.extend({
    onAdd: function(map) {
        const div = L.DomUtil.create('div', 'category-toggle-control');

        Object.keys(categoryIcons).forEach(category => {
            const btn = L.DomUtil.create('div', 'category-toggle-btn', div);
            btn.innerHTML = `<img src="${categoryIcons[category].options.iconUrl}" title="${category}" alt="${category}"><span>${category}</span>`;
            btn.dataset.category = category;
            btn.classList.add('active');

            btn.onclick = function() {
                const cat = this.dataset.category;
                const isActive = this.classList.contains('active');

                if (isActive) {
                    map.removeLayer(categoryLayers[cat]);
                    this.classList.remove('active');
                } else {
                    map.addLayer(categoryLayers[cat]);
                    this.classList.add('active');
                }
            };
        });

        return div;
    },
});

map.addControl(new CategoryToggleControl({ position: 'bottomright' }));

var baseLayers = {
    "MapTiler": L.tileLayer('https://api.maptiler.com/maps/winter-v2/{z}/{x}/{y}.png?key=h7HjjXDoOt4QndexKLba', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.maptiler.com/copyright/" target="_blank">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>'
    }).addTo(map),
    "OpenStreetMap": L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    })
};

var overlays = {
    "Punkty": markerLayer,
    "Poligony": polygonLayer
};

L.control.layers(baseLayers, overlays).addTo(map);