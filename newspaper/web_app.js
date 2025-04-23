var map = L.map('map').setView([52.237049, 21.017532], 7);
L.tileLayer('https://api.maptiler.com/maps/winter-v2/{z}/{x}/{y}.png?key=h7HjjXDoOt4QndexKLba', {
    attribution: '<a href="https://www.maptiler.com/copyright/" target="_blank">&copy; MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap contributors</a>'
}).addTo(map);

const categoryIcons = {
    "Wydarzenia": L.icon({ iconUrl: 'icons/wydarzenia.svg'}),
    "Polityka": L.icon({ iconUrl: 'icons/polityka.svg'}),
    "Gospodarka": L.icon({ iconUrl: 'icons/gospodarka.svg'}),
    "Kultura": L.icon({ iconUrl: 'icons/kultura.svg'}),
    "Sport": L.icon({ iconUrl: 'icons/sport.svg'}),
    "Pogoda": L.icon({ iconUrl: 'icons/pogoda.svg'}),
    "Inne": L.icon({ iconUrl: 'icons/inne.svg'})
  };

const categoryColors = {
    "Wydarzenia": "#660001",
    "Polityka": "#990001",
    "Gospodarka": "#CC0002",
    "Sport": "#0D5F8C",
    "Kultura": "#4E8CB0",
    "Pogoda": "#00314C",
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
const centroidLayer = L.layerGroup().addTo(map);

// pobranie danych z backendu
fetch('http://127.0.0.1:8000/articles')
  .then(response => response.json())
  .then(data => {
    data.forEach(article => {
      const geometry = article.geocode_result?.geometry;
      const category = article.category;
      const src = article.source;
      const source = src.replace(/^https?:\/\//, "");
      const address = article.geocode_result.address;
      const location =
        address.city ||
        address.town ||
        address.village ||
        address.administrative ||
        address.state ||
        address.country ||
        address.continent;
      
      let articleDate = "";
      if (article.date) {
        articleDate = new Date(article.date).toLocaleDateString('pl-PL', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
      } 
      
      process_geometry(geometry, category, source, location, article, articleDate);
    });
  })
  .catch(error => console.error('Błąd podczas ładowania artykułów:', error));


function process_geometry(geometry, category, source, location, article, date) {
    if (!geometry) return;

    if (geometry.type === "Point") {
        const [lon, lat] = geometry.coordinates;
        const color = categoryColors[category] || "#000";
        const marker = L.circleMarker([lat, lon], {
        radius: 5,
        color: color,
        fillColor: color,
        fillOpacity: 0.8,
        weight: 1
        }).addTo(markerLayer);
        categoryLayers[category]?.addLayer(marker);
        marker.bindPopup(style_popup(category, source, location, date, article));
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
        polygon.bindPopup(style_popup(category, source, location, date, article));
        categoryLayers[category]?.addLayer(polygon);
    }

    // polygon centroids
    if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") {
        const center = article.geocode_result?.center;
        if (center) {
            const color = categoryColors[category] || "#000000";
            const marker = L.circleMarker([center.lat, center.lon], {
                radius: 5,
                color: color,
                fillColor: color,
                fillOpacity: 0.8,
                weight: 1
            }).addTo(centroidLayer);
            categoryLayers[category]?.addLayer(marker);
            marker.bindPopup(style_popup(category, source, location, date, article));
        }
    }    
}

function style_popup(category, source, location, date, article) {
    const color = categoryColors[category] || "#000000";
    return `
        <div class="popup-article">
            <a href="${article.url}" target="_blank"><h3 class="popup-article-title">${article.title}</h3></a>
            <div class="popup-article-info">
                <p class="popup-article-category" style="background-color: ${color};">${category}</p>
                <p class="popup-article-location">${location}</p>
                <p class="popup-article-source">${source}</p>
                <p class="popup-article-date">${date}</p>
            </div>
            <p class = "popup-article-summary">${article.summary}</p>
        </div>
    `;
}

// control category layers
Object.values(categoryLayers).forEach(layer => layer.addTo(map));
const CategoryToggleControl = L.Control.extend({
    onAdd: function(map) {
        const div = L.DomUtil.create('div', 'category-toggle-control');

        Object.keys(categoryIcons).forEach(category => {
            const btn = L.DomUtil.create('div', 'category-toggle-btn', div);
            const color = categoryColors[category] || "#000";
            btn.innerHTML = `<span>${category}</span><img src="${categoryIcons[category].options.iconUrl}" title="${category}" alt="${category}">`;
            btn.style.backgroundColor = color;
            
            btn.dataset.category = category;
            btn.classList.add('active');

            btn.onclick = function() {
                const cat = this.dataset.category;
                const isActive = this.classList.contains('active');

                if (isActive) {
                    map.removeLayer(categoryLayers[cat]);
                    this.classList.remove('active');
                    this.classList.add('inactive');
                } else {
                    map.addLayer(categoryLayers[cat]);
                    this.classList.add('active');
                    this.classList.remove('inactive');
                }
                
            };
        });

        return div;
    },
});

map.addControl(new CategoryToggleControl({ position: 'bottomright' }));

// search bar
document.getElementById("search-button").addEventListener("click", () => {
    const query = document.getElementById("search-input").value;
    if (!query) return;
  
    fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`)
      .then(res => res.json())
      .then(data => {
        if (data && data[0]) {
          const lat = parseFloat(data[0].lat);
          const lon = parseFloat(data[0].lon);
          map.setView([lat, lon], 12);
        } else {
          alert("Nie znaleziono lokalizacji");
        }
      });
  });

map.removeControl(map.zoomControl);


const CustomZoomControl = L.Control.extend({
    onAdd: function (map) {
        const container = L.DomUtil.create('div', 'custom-zoom-container');

        const zoomIn = L.DomUtil.create('button', 'zoom-btn zoom-in', container);
        const zoomOut = L.DomUtil.create('button', 'zoom-btn zoom-out', container);

        L.DomEvent.on(zoomIn, 'click', function (e) {
        e.stopPropagation();
        map.zoomIn();
        });

        L.DomEvent.on(zoomOut, 'click', function (e) {
        e.stopPropagation();
        map.zoomOut();
        });

        return container;
    },
    onRemove: function () {}
});

map.addControl(new CustomZoomControl({ position: 'bottomleft' }));


var baseLayers = {
    "MapTiler": L.tileLayer('https://api.maptiler.com/maps/winter-v2/{z}/{x}/{y}.png?key=h7HjjXDoOt4QndexKLba', {
        maxZoom: 19
        // attribution: '&copy; <a href="https://www.maptiler.com/copyright/" target="_blank">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>'
    }).addTo(map),
    "OpenStreetMap": L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
        // attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    })
};

var overlays = {
    "Punkty": markerLayer,
    "Poligony": polygonLayer,
    "Centroidy": centroidLayer,
};

L.control.layers(baseLayers, overlays).addTo(map);


  

