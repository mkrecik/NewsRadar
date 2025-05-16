import { handleSearch, style_popup, locateUser } from './functions.js';
import { baseLayers, categoryIcons, categoryColors, categoryLayers } from './constants.js';

var map = L.map('map').setView([52.03993467110199, 19.286734471610345], 7);

const markerLayer = L.layerGroup().addTo(map);
const polygonLayer = L.layerGroup().addTo(map);
const centroidLayer = L.layerGroup().addTo(map);

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
    const filtered = getFilteredArticles();
    showArticles(filtered);
    updateSidebarWithArticles(filtered);
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
        const filtered = getFilteredArticles();
        showArticles(filtered);
        updateSidebarWithArticles(filtered);
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

// Search location
const searchInput = document.getElementById("search-input");
const searchButton = document.getElementById("search-button");

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
    const filtered = getFilteredArticles();
    showArticles(filtered);
    updateSidebarWithArticles(filtered);
  }
});

map.on('overlayremove', function(e) {
  if (e.layer === polygonLayer || e.layer === markerLayer || e.layer === centroidLayer) {
    const filtered = getFilteredArticles();
    showArticles(filtered);
    updateSidebarWithArticles(filtered);
  }
});

var overlays = {
  "Punkty": markerLayer,
  "Poligony": polygonLayer,
  "Centroidy": centroidLayer,
};

baseLayers["CartoDB"].addTo(map);

const layersControl = L.control.layers(baseLayers, overlays, { position: 'topright' });
layersControl.addTo(map);

const leafletLayersControl = document.querySelector(".leaflet-control-layers");
const customContainer = document.getElementById("map-buttons");
if (leafletLayersControl && customContainer) {
  customContainer.appendChild(leafletLayersControl);
}

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
}

// Filter by date
const filters = { today: false, yesterday: false, week: false, month: false };
const filtersDiv = document.getElementById("filters");

filtersDiv.addEventListener("change", (e) => {
  if (e.target.type === "checkbox") {
    const filter = e.target.value;
    filters[filter] = e.target.checked;
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

    const filtered = getFilteredArticles();
    showArticles(filtered);
    updateSidebarWithArticles(filtered);
  });
});

// Filter by date and category
function getFilteredArticles() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const anyDateFilterActive = Object.values(filters).some(v => v);

  return allArticles.filter(article => {
    if (!activeCategories.has(article.category)) return false;
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
