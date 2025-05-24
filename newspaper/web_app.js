import { handleSearch, style_popup, locateUser } from './functions.js';
import { baseLayers, categoryIcons, categoryColors, categoryLayers } from './constants.js';

var map = L.map('map').setView([52.03993467110199, 19.286734471610345], 7);

map.createPane('polygons');
map.getPane('polygons').style.zIndex = 400;

map.createPane('points');
map.getPane('points').style.zIndex = 600;

map.createPane('centroids');
map.getPane('centroids').style.zIndex = 500;

const markerLayer = L.layerGroup().addTo(map);
const polygonLayer = L.layerGroup();
const centroidLayer = L.layerGroup();


let activeCategories = new Set(Object.keys(categoryLayers));
let allArticles = [];

function showArticles(articles) {
  markerLayer.clearLayers();
  polygonLayer.clearLayers();
  centroidLayer.clearLayers();

  Object.keys(categoryLayers).forEach(cat => {
    categoryLayers[cat].clearLayers();
  });

  const showPoints = map.hasLayer(markerLayer);
  const showPolygons = map.hasLayer(polygonLayer);
  const showCentroids = map.hasLayer(centroidLayer);

  let pointsCount = 0;
  let centroidsCount = 0;

  articles.forEach(article => {
    const geometry = article.geocode_result?.geometry;
    const category = article.category;
    const src = article.source;
    const source = src.replace(/^https?:\/\//, "");
    const address = article.geocode_result.address;
    const location =
      address.city || address.town || address.village || address.municipality ||
      address.administrative || address.state || address.country || address.continent ||
      address.bay || address.road || address.river;

    let articleDate = "";
    if (article.date) {
      articleDate = new Date(article.date).toLocaleDateString('pl-PL', {
        year: 'numeric', month: '2-digit', day: '2-digit'
      });
    }

    const geometryType = geometry?.type;
    if (geometryType === "Point" && showPoints) pointsCount++;
    if ((geometryType === "Polygon" || geometryType === "MultiPolygon") && showCentroids) centroidsCount++;

    process_geometry(geometry, category, source, location, article, articleDate, showPoints, showPolygons, showCentroids);
  });

  console.log(`Wyświetlono: ${pointsCount} punktów, ${centroidsCount} centroidów`);
}

function process_geometry(geometry, category, source, location, article, date, showPoints, showPolygons, showCentroids) {
  const color = categoryColors[category] || "#000";

  if (geometry.coordinates) {
    if (geometry.type === "Point" && showPoints) {
      const [lon, lat] = geometry.coordinates;
      const marker = L.circleMarker([lat, lon], {
        pane: 'points',
        radius: 5,
        color: color,
        fillColor: color,
        fillOpacity: 0.8,
        weight: 1
      }).addTo(markerLayer);
      categoryLayers[category]?.addLayer(marker);
      marker.bindPopup(style_popup(category, source, location, date, article));
    }

    if (geometry.type === "Polygon" && showPolygons) {
      const polygon = L.polygon(
        geometry.coordinates.map(coord => coord.map(c => [c[1], c[0]])),
        {
          pane: 'polygons',
          color: color,
          fillColor: color,
          fillOpacity: 0.1,
          weight: 2
        }
      ).addTo(polygonLayer);
      categoryLayers[category]?.addLayer(polygon);
      polygon.bindPopup(style_popup(category, source, location, date, article));
    }

    if (geometry.type === "MultiPolygon" && showPolygons) {
      geometry.coordinates.forEach(polygonCoords => {
        const polygon = L.polygon(
          polygonCoords.map(ring => ring.map(coord => [coord[1], coord[0]])),
          {
            pane: 'polygons',
            color: color,
            fillColor: color,
            fillOpacity: 0.1,
            weight: 2
          }
        ).addTo(polygonLayer);
        categoryLayers[category]?.addLayer(polygon);
        polygon.bindPopup(style_popup(category, source, location, date, article));
      });
    }
  }

  if ((geometry.type === "Polygon" || geometry.type === "MultiPolygon") && showCentroids) {
    const center = article.geocode_result?.center;
    if (center) {
      const marker = L.circleMarker([center.lat, center.lon], {
        pane: 'centroids',
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

// Get data 
fetch('http://127.0.0.1:8000/articles')
  .then(response => response.json())
  .then(data => {
    allArticles = data;
    const filteredForSidebar = getFilteredArticles();
    updateSidebarWithArticles(filteredForSidebar);

    const mapArticles = allArticles.filter(article =>
      activeCategories.has(article.category)
    );
    showArticles(mapArticles);

    updateInfoBox(allArticles);
  });

// Category layers toggle
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

      btn.onclick = function () {
        const cat = this.dataset.category;
        const isActive = this.classList.contains('active');
      
        if (isActive) {
          map.removeLayer(categoryLayers[cat]);
          this.classList.remove('active');
          this.classList.add('inactive');
          activeCategories.delete(cat);
        } else {
          map.addLayer(categoryLayers[cat]);
          this.classList.add('active');
          this.classList.remove('inactive');
          activeCategories.add(cat);
        }
      
        // Update articles based on active categories
        const filteredForSidebar = getFilteredArticles();
        updateSidebarWithArticles(filteredForSidebar);

        const mapArticles = allArticles.filter(article =>
          activeCategories.has(article.category)
        );
        showArticles(mapArticles);

      };
      
    });

    return div;
  }
});
map.addControl(new CategoryToggleControl({ position: 'bottomright' }));

// Zoom, reset, locate buttons
map.removeControl(map.zoomControl);
document.querySelector(".zoom-in").addEventListener("click", () => map.zoomIn());
document.querySelector(".zoom-out").addEventListener("click", () => map.zoomOut());
document.querySelector(".reset-view-button").addEventListener("click", () => map.setView([52.03993467110199, 19.286734471610345], 7));
document.querySelector(".locate-user-button").addEventListener("click", () => locateUser(map));
document.querySelector(".info-button").addEventListener("click", () => {
  const infoDiv = document.querySelector('.info-container');
  infoDiv.style.display = infoDiv.style.display === 'none' ? 'block' : 'none';
});

let mapZoomLevel = map.getZoom();
let mapLocationFilter = {};

// Search location
const searchInput = document.getElementById("search-input");
const searchButton = document.getElementById("search-button");

// Date filters
const filters = { today: false, yesterday: false, week: false, month: false, all: true };
const filtersDiv = document.getElementById("filters");

searchButton.addEventListener("click", handleSearch);
searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    handleSearch(searchInput, map);
  }
});


// Layer control
map.on('overlayadd', function(e) {
  if (e.layer === polygonLayer || e.layer === markerLayer || e.layer === centroidLayer) {
    const filteredForSidebar = getFilteredArticles();
    updateSidebarWithArticles(filteredForSidebar);

    const mapArticles = allArticles.filter(article =>
      activeCategories.has(article.category)
    );
    showArticles(mapArticles);
  }
});

map.on('overlayremove', function(e) {
  if (e.layer === polygonLayer || e.layer === markerLayer || e.layer === centroidLayer) {
    const filteredForSidebar = getFilteredArticles();
    updateSidebarWithArticles(filteredForSidebar);

    const mapArticles = allArticles.filter(article =>
      activeCategories.has(article.category)
    );
    showArticles(mapArticles);
  }
});

var overlays = {
  "Punkty": markerLayer,
  "Poligony": polygonLayer,
  "Centroidy": centroidLayer
};

baseLayers["CartoDB"].addTo(map);

updateLocationLabelFromMapCenter(map);

map.on('moveend', () => {
  updateLocationLabelFromMapCenter(map);
});

const layersControl = L.control.layers(baseLayers, overlays, { position: 'topright' });
layersControl.addTo(map);

const leafletLayersControl = document.querySelector(".leaflet-control-layers");
const customContainer = document.getElementById("map-buttons");

if (leafletLayersControl && customContainer) {
  customContainer.appendChild(leafletLayersControl);
}

window.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.querySelector('.sidebar');
  const resizer = document.getElementById('sidebar-resizer');

  const windowWidth = window.innerWidth;
  const initialWidth = Math.min(Math.max(windowWidth * 0.22, 250), 1000);
  sidebar.style.flex = `0 0 ${initialWidth}px`;
  resizer.style.left = `${initialWidth}px`;


  let isResizing = false;

  resizer.addEventListener('mousedown', () => {
    isResizing = true;
    document.body.style.cursor = 'ew-resize';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const newWidth = Math.min(Math.max(e.clientX, 250), 1000);
    sidebar.style.flex = `0 0 ${newWidth}px`;

    const actualWidth = sidebar.getBoundingClientRect().width;
    resizer.style.left = `${actualWidth}px`;

  });

  document.addEventListener('mouseup', () => {
    isResizing = false;
    document.body.style.cursor = 'default';
  });
});

// Sidebar
function addArticleToSidebar(article) {
  const sidebarContent = document.querySelector('.sidebar-content');
  const color = categoryColors[article.category] || "#000000";
  const address = article.geocode_result?.address || {};
  const location =
    address.city || address.town || address.village || address.municipality ||
    address.administrative || address.state || address.country || address.continent ||
    address.bay || address.road || address.river;

  const articleDiv = document.createElement('div');
  articleDiv.className = 'sidebar-article';
  articleDiv.innerHTML = `
    <div class="popup-article">
      <a href="${article.url}" target="_blank"><h3 class="popup-article-title">${article.title}</h3></a>
      <div class="popup-article-info">
        <div class="popup-tags">
          <p class="popup-article-category" style="background-color: ${color};">${article.category}</p>
          <p class="popup-article-location">${location}</p>
          <p class="popup-article-source">${article.source.replace(/^https?:\/\//, '')}</p>
        </div>
        <p class="popup-article-date">${article.date ? new Date(article.date).toLocaleDateString('pl-PL') : 'Brak daty'}</p>
      </div>
      <p class="popup-article-summary">${article.summary}</p>
    </div>`;
  sidebarContent.appendChild(articleDiv);
}

function updateSidebarWithArticles(articles) {
  const sidebarContent = document.querySelector('.sidebar-content');
  sidebarContent.innerHTML = '';

  const filteredArticles = articles
    .filter(article =>
      article.geocode_result?.geometry?.type === "Polygon" ||
      article.geocode_result?.geometry?.type === "MultiPolygon"
    )
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  filteredArticles.forEach(addArticleToSidebar);

  const sidebar = document.querySelector('.sidebar');
  const resizer = document.getElementById('sidebar-resizer');
  const currentWidth = sidebar.offsetWidth;
  resizer.style.left = `${currentWidth}px`;
}

// Filter by date
filtersDiv.addEventListener("change", (e) => {
  if (e.target.type === "checkbox") {
    const filter = e.target.value;
    const isChecked = e.target.checked;

    // Resetuj wykluczające się filtry
    if (filter === "all" && isChecked) {
      Object.keys(filters).forEach(f => filters[f] = false);
      filters.all = true;

      document.querySelectorAll('#filters input[type="checkbox"]').forEach(input => {
        input.checked = input.value === "all";
      });
    } else {
      filters[filter] = isChecked;
      filters.all = false;
      document.querySelector('input[value="all"]').checked = false;

      if (filter === "month" && isChecked) {
        ["today", "yesterday", "week"].forEach(f => {
          filters[f] = false;
          document.querySelector(`input[value="${f}"]`).checked = false;
        });
      }

      if (filter === "week" && isChecked) {
        ["today", "yesterday", "month"].forEach(f => {
          filters[f] = false;
          document.querySelector(`input[value="${f}"]`).checked = false;
        });
      }

      if ((filter === "today" || filter === "yesterday") && isChecked) {
        ["week", "month"].forEach(f => {
          filters[f] = false;
          document.querySelector(`input[value="${f}"]`).checked = false;
        });
      }
    }

    const filtered = getFilteredArticles();
    showArticles(filtered);
    updateSidebarWithArticles(filtered);
  }
});

document.querySelectorAll('.date-filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const filter = btn.dataset.filter;
    const isActive = btn.classList.contains('active');

    document.querySelectorAll('.date-filter-btn').forEach(b => b.classList.remove('active'));

    if (isActive) {
      filters[filter] = false;
    } else {
      Object.keys(filters).forEach(key => filters[key] = false);
      filters[filter] = true;
      btn.classList.add('active');
    }

    const filteredForSidebar = getFilteredArticles();
    updateSidebarWithArticles(filteredForSidebar);

    const mapArticles = allArticles.filter(article =>
      activeCategories.has(article.category)
    );
    showArticles(mapArticles);

  });
});

// Filter by date and category
function getFilteredArticles() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const anyDateFilterActive = Object.entries(filters).some(([k, v]) => k !== "all" && v);

  return allArticles.filter(article => {
    if (!activeCategories.has(article.category)) return false;

    // Filtrowanie po lokalizacji mapy
    if (mapLocationFilter && mapZoomLevel !== null) {
      const address = article.geocode_result?.address || {};

      if (mapZoomLevel <= 8) {
        // Kraj, brak dokładniejszych danych
        const isCountryOnly =
          address.country === mapLocationFilter.country &&
          !address.state && !address.city && !address.town && !address.village && !address.municipality;
        if (!isCountryOnly) return false;
      }

      if (mapZoomLevel > 8 && mapZoomLevel <= 12) {
        const isStateOnly =
          address.state === mapLocationFilter.state &&
          !address.city && !address.town && !address.village && !address.municipality && !address.administrative && !address.county;
        if (!isStateOnly) return false;
      }

      if (mapZoomLevel > 11) {
        const articleCity =
          address.administrative || address.county || address.city || address.town || address.municipality || address.suburb;
        if (articleCity !== mapLocationFilter.county) return false;
      }
    }

    if (!anyDateFilterActive) return true;
    if (!article.date) return false;

    const articleDate = new Date(article.date);
    articleDate.setHours(0, 0, 0, 0);
    let match = false;

    if (filters.today && articleDate.getTime() === today.getTime()) match = true;

    if (filters.yesterday) {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      if (articleDate.getTime() === yesterday.getTime()) match = true;
    }

    if (filters.week) {
      const weekAgo = new Date(today);
      weekAgo.setDate(today.getDate() - 7);
      if (articleDate >= weekAgo && articleDate <= today) match = true;
    }

    if (filters.month) {
      const monthAgo = new Date(today);
      monthAgo.setMonth(today.getMonth() - 1);
      if (articleDate >= monthAgo && articleDate <= today) match = true;
    }

    return match;
  });
}

// Update articles count in info
function updateInfoBox(articles) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayCount = articles.filter(article => {
    if (!article.date) return false;
    const articleDate = new Date(article.date);
    articleDate.setHours(0, 0, 0, 0);
    return articleDate.getTime() === today.getTime();
  }).length;

  document.getElementById("today_articles").innerText = `${todayCount}`;
  document.getElementById("total_articles").innerText = `${articles.length}`;
}

function updateLocationLabelFromMapCenter(map) {
  const center = map.getCenter();
  mapZoomLevel = map.getZoom();
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${center.lat}&lon=${center.lng}&accept-language=pl`;

  fetch(url, {
    headers: {
      'User-Agent': 'WiadoMo-NewsRadar/1.0'
    }
  })
    .then(response => response.json())
    .then(data => {
      const address = data.address || {};
      let label = "Nieznane";

      if (mapZoomLevel > 11
      ) {
        label = address.administrative || address.county || address.city || address.town || address.municipality || address.suburb  || "Nieznana lokalizacja";
      } else if (mapZoomLevel > 8) {
        label = address.state || "Nieznane";
      } else {
        label = address.country || "Nieznane";
      }

      const locationBtn = document.getElementById("current-location-button");
      if (locationBtn) locationBtn.textContent = label;

      mapLocationFilter = {
        county: address.administrative || address.county || address.city || address.town || address.municipality || address.suburb || "",
        state: address.state || "",
        country: address.country || ""
      };

      const filteredForSidebar = getFilteredArticles();
      updateSidebarWithArticles(filteredForSidebar);

      const mapArticles = allArticles.filter(article =>
        activeCategories.has(article.category)
      );
      showArticles(mapArticles);


    })
    .catch(() => {
      const locationBtn = document.getElementById("current-location-button");
      if (locationBtn) locationBtn.textContent = "Nieznane";
    });

}

