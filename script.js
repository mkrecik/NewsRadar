import { handleSearch, style_popup, locateUser } from './newspaper/functions.js';
import { baseLayers, categoryIcons, categoryColors, categoryLayers, polygonLevelStyles } from './newspaper/constants.js';

function isMobileSafari() {
  const ua = window.navigator.userAgent;
  return (
    /iP(ad|hone|od)/.test(ua) &&
    /WebKit/.test(ua) &&
    !/CriOS|FxiOS|OPiOS|mercury/i.test(ua)
  );
}

const map = L.map('map', {
  closePopupOnClick: isMobileSafari() ? false : true,
   maxZoom: 18,
}).setView([52.03993467110199, 19.286734471610345], 6);

map.createPane('polygons-country');
map.getPane('polygons-country').style.zIndex = 300;

map.createPane('polygons-region');
map.getPane('polygons-region').style.zIndex = 400;

map.createPane('polygons-county');
map.getPane('polygons-county').style.zIndex = 500;


map.createPane('points');
map.getPane('points').style.zIndex = 600;

const markerLayer = L.layerGroup().addTo(map);

const polygonLayerCountry = L.layerGroup().addTo(map);
const polygonLayerRegion = L.layerGroup().addTo(map);
const polygonLayerCounty = L.layerGroup().addTo(map);

const categoryClusters = {};


let activeCategories = new Set(Object.keys(categoryLayers));
let allArticles = [];

function showArticles(articles) {
  markerLayer.clearLayers();
  
  Object.keys(categoryClusters).forEach(cat => {
    categoryClusters[cat].clearLayers();
  });

  Object.keys(categoryLayers).forEach(cat => {
    categoryLayers[cat].clearLayers();
  });
  

  const showPoints = map.hasLayer(markerLayer);
  const showPolygons = map.hasLayer(polygonLayerCountry) ||
    map.hasLayer(polygonLayerRegion) ||
    map.hasLayer(polygonLayerCounty);

  let pointsCount = 0;
  let polygonCount = 0;

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

    process_geometry(geometry, category, source, location, article, articleDate, showPoints, showPolygons);
  });

  console.log(`Wyświetlono: ${pointsCount} punktów`);
}

function process_geometry(geometry, category, source, location, article, date, showPoints, showPolygons) {
  const color = categoryColors[category] || "#000";

  if (geometry.coordinates) {
   if (geometry.type === "Point" && showPoints) {
      const [lon, lat] = geometry.coordinates;
      const marker = L.circleMarker([lat, lon], {
        pane: 'points',
        radius: 9,
        color: color,
        fillColor: color,
        fillOpacity: 0.8,
        weight: 1,
      });

      let previousCenter = null;

      marker.on('click', function () {
        previousCenter = map.getCenter();

        const latlng = marker.getLatLng();
        const point = map.latLngToContainerPoint(latlng);
        const offsetPoint = L.point(point.x, point.y - 230);
        const newLatLng = map.containerPointToLatLng(offsetPoint);

        map.panTo(newLatLng, {
          animate: true,
          duration: 0.5
        });

        setTimeout(() => {
          const popup = L.popup({
            closeButton: true,
            autoClose: true,
            closeOnClick: true,
            className: 'custom-popup'
          })
          .setLatLng(latlng)
          .setContent(style_popup(category, source, location, date, article))
          .openOn(map);

          popup.on('remove', function () {
            if (previousCenter) {
              map.panTo(previousCenter, {
                animate: true,
                duration: 0.3
              });
              previousCenter = null;
            }
          });
        }, 300);
      });

      categoryClusters[category]?.addLayer(marker);
    }

  }
}

// Get article data 
// fetch('http://127.0.0.1:8000/articles')
fetch('https://wiadomo.onrender.com/articles')
  .then(response => response.json())
  .then(data => {
    allArticles = data;
    const filteredForSidebar = getFilteredArticles();
    updateLocationLabelFromMapCenter(map);
    updateSidebarWithArticles(filteredForSidebar);

    const mapArticles = getFilteredArticles(true); 
    showArticles(mapArticles);
    updateInfoBox(allArticles);
    
});

// Get polygons data in batches of 10
// const baseurl = 'http://127.0.0.1:8000/polygons'
const baseurl = 'https://wiadomo.onrender.com/polygons';
function loadPolygons(level, batchSize = 10) {
    let offset = 0;

    function loadNextBatch() {
        fetch(`${baseurl}?level=${level}&limit=${batchSize}&offset=${offset}`)
            .then(response => response.json())
            .then(polygons => {
                console.log(`Fetched ${polygons.length} polygons at offset ${offset}`);

                polygons.forEach(polygon => {
                    const geometry = polygon.geometry;
                    const style = getPolygonStyle(polygon);

                    const targetLayer = (
                        level === "country" ? polygonLayerCountry :
                        level === "region" ? polygonLayerRegion :
                        polygonLayerCounty
                    );

                    if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates)) {
                        const poly = L.polygon(
                            geometry.coordinates.map(coord => coord.map(c => [c[1], c[0]])),
                            style
                        ).addTo(targetLayer);

                        poly.on('click', function() {
                            zoomToPolygonAndFilter(polygon, poly);
                        });
                    }

                    if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
                        geometry.coordinates.forEach(polygonCoords => {
                            const poly = L.polygon(
                                polygonCoords.map(ring => ring.map(coord => [coord[1], coord[0]])),
                                style
                            ).addTo(targetLayer);

                            poly.on('click', function() {
                                zoomToPolygonAndFilter(polygon, poly);
                            });
                        });
                    }

                });

                if (polygons.length === batchSize) {
                    offset += batchSize;
                    setTimeout(loadNextBatch, 100); 
                } else {
                    console.log(`DONE loading level=${level}`);
                }
            });
    }

    loadNextBatch();
}

loadPolygons("county", 10);
setTimeout(() => loadPolygons("region", 10), 1000);
setTimeout(() => loadPolygons("country", 10), 5000);


// Category layers toggle
Object.values(categoryLayers).forEach(layer => layer.addTo(map));

const CategoryToggleControl = L.Control.extend({
  onAdd: function(map) {
    const div = L.DomUtil.create('div', 'category-toggle-control');

    Object.keys(categoryIcons).forEach(category => {
      const btn = L.DomUtil.create('div', 'category-toggle-btn', div);
      const color = categoryColors[category] || "#000";
      btn.innerHTML = `<span class="category-toggle-text">${category}</span><img src="${categoryIcons[category].options.iconUrl}" title="${category}" alt="${category}">`;
      btn.style.backgroundColor = color;
      btn.dataset.category = category;
      btn.classList.add('active');

      if (!categoryClusters[category]) {
        categoryClusters[category] = L.markerClusterGroup({
          disableClusteringAtZoom: 12,
          spiderfyOnMaxZoom: true,
          showCoverageOnHover: false,
          iconCreateFunction: function (cluster) {
            const count = cluster.getChildCount();
            const color = categoryColors[category] || '#000';

            const size = Math.max(17, Math.min(60, 17 + Math.log(count) * 10));

            return L.divIcon({
              html: `<div style="
                        background-color: ${color}; 
                        border-radius: 50%; 
                        width: ${size}px; 
                        height: ${size}px; 
                        display: flex; 
                        align-items: center; 
                        justify-content: center; 
                        color: white; 
                        font-weight: bold;
                      ">${count}</div>`,
              className: 'custom-cluster-icon',
              iconSize: L.point(size, size)
            });
          }
        });

        map.addLayer(categoryClusters[category]);
      }

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

        const mapArticles = getFilteredArticles(true); 
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


const polygonLayers = [polygonLayerCountry, polygonLayerRegion, polygonLayerCounty];

map.on('overlayadd', function(e) {
  if (polygonLayers.includes(e.layer) || e.layer === markerLayer) {
    const filteredForSidebar = getFilteredArticles();
    updateSidebarWithArticles(filteredForSidebar);

    const mapArticles = getFilteredArticles(true); 
    showArticles(mapArticles);
  }
});

map.on('overlayremove', function(e) {
  if (polygonLayers.includes(e.layer) || e.layer === markerLayer) {
    const filteredForSidebar = getFilteredArticles();
    updateSidebarWithArticles(filteredForSidebar);

    const mapArticles = getFilteredArticles(true); 
    showArticles(mapArticles);
  }
});


var overlays = {
  "Punkty": markerLayer,
  "Kraje": polygonLayerCountry,
  "Województwa": polygonLayerRegion,
  "Powiaty": polygonLayerCounty
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

function pluralize(n, forms) {
    return (n === 1) ? forms[0] :
           (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? forms[1] :
           forms[2];
}

function timeAgo(dateString) {
    const now = new Date();
    const articleDate = new Date(dateString);

    const diffMs = now - articleDate;
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSeconds < 60) return `${diffSeconds} ${pluralize(diffSeconds, ["sekunda", "sekundy", "sekund"])} temu`;
    if (diffMinutes < 60) return `${diffMinutes} ${pluralize(diffMinutes, ["minuta", "minuty", "minut"])} temu`;
    if (diffHours < 24) return `${diffHours} ${pluralize(diffHours, ["godzina", "godziny", "godzin"])} temu`;
    if (diffDays === 1) return `wczoraj`;
    return `${diffDays} ${pluralize(diffDays, ["dzień", "dni", "dni"])} temu`;
}

// normalna data:
// <p class="popup-article-date">${article.date ? new Date(article.date).toLocaleDateString('pl-PL') : 'Brak daty'}</p>

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
        <p class="popup-article-date">${article.date ? timeAgo(article.date) : 'brak daty'}</p>
      </div>
      <p class="popup-article-summary">${article.premium_summary ? article.premium_summary : article.summary}</p>
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

    if (filter === "all") {
      if (!isChecked) {
        e.target.checked = true;
        return;
      }

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

    const isAnyActive = Object.entries(filters).some(([key, value]) => key !== "all" && value);

    if (!isAnyActive) {
        filters.all = true;
        document.querySelector('input[value="all"]').checked = true;
    }

    updateLocationLabelFromMapCenter(map);

    const filteredForSidebar = getFilteredArticles();
    updateSidebarWithArticles(filteredForSidebar);

    const mapArticles = getFilteredArticles(true);
    showArticles(mapArticles);

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
    updateLocationLabelFromMapCenter(map);
    updateSidebarWithArticles(filteredForSidebar);

    const mapArticles = getFilteredArticles(true); 
    showArticles(mapArticles);

  });
});

// Filter by date and category
function getFilteredArticles(skipLocationFilter = false) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const anyDateFilterActive = Object.entries(filters).some(([k, v]) => k !== "all" && v);

  return allArticles.filter(article => {
    if (!activeCategories.has(article.category)) return false;

    // Filtrowanie po lokalizacji mapy
    if (!skipLocationFilter && mapLocationFilter && mapZoomLevel !== null) {
      const address = article.geocode_result?.address || {};

      if (mapZoomLevel <= 8) {
          const isCountryOnly =
              address.country === mapLocationFilter.country &&
              !address.state && !address.region && !address.city && !address.town && !address.village && !address.municipality;
          if (!isCountryOnly) return false;
      }

      if (mapZoomLevel > 8 && mapZoomLevel <= 11) {
          const isStateOnly =
              (address.state === mapLocationFilter.state || address.region === mapLocationFilter.state || address.province === mapLocationFilter.state) &&
              !address.city && !address.town && !address.village && !address.municipality && !address.administrative && !address.county && !address.district;
          if (!isStateOnly) return false;
      }

      if (mapZoomLevel > 11) {
          const articleCity =
              address.administrative ||
              address.county ||
              address.district ||
              address.city ||
              address.town ||
              address.village ||
              address.municipality ||
              address.suburb;

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
      let label = "Przybliż na ląd";

      if (mapZoomLevel > 11) {
          label =
              address.administrative ||
              address.county ||
              address.district ||
              address.city ||
              address.town ||
              address.village ||
              address.municipality ||
              address.suburb ||
              "Przybliż na ląd";
      } else if (mapZoomLevel > 8) {
          label =
              address.state ||
              address.region ||
              address.province ||
              address.city ||
              address.administrative ||
              "Przybliż na ląd";
      } else {
          label = address.country || "Przybliż na ląd";
      }

      const locationBtn = document.getElementById("current-location-button");
      if (locationBtn) locationBtn.textContent = label;

      mapLocationFilter = {
          county:
              address.administrative ||
              address.county ||
              address.district ||
              address.city ||
              address.town ||
              address.village ||
              address.municipality ||
              address.suburb ||
              "",
          state:
              address.state ||
              address.region ||
              address.province ||
              address.county || 
              address.administrative ||
              "",
          country: address.country || ""
      };

      const filteredForSidebar = getFilteredArticles();
      updateSidebarWithArticles(filteredForSidebar);

      const pointsArticles = getFilteredArticles(true);
      const polygonsArticles = getFilteredArticles();

      const combinedArticles = pointsArticles.map(a => ({...a, __type: "Point"}))
          .concat(polygonsArticles.map(a => ({...a, __type: "PolygonOrMultiPolygon"})));

      showArticles(combinedArticles);


    })
    .catch(() => {
      const locationBtn = document.getElementById("current-location-button");
      if (locationBtn) locationBtn.textContent = "Przybliż na ląd";
    });

}

function isCountryPolygon(polygon) {
    return polygon.address?.country && !polygon.address?.state;
}

function isRegionPolygon(polygon) {
    return (
        polygon.address?.state ||
        polygon.address?.region ||
        polygon.address?.province
    ) && !(
        polygon.address?.county ||
        polygon.address?.administrative ||
        polygon.address?.district ||
        polygon.address?.city ||
        polygon.address?.town ||
        polygon.address?.village ||
        polygon.address?.municipality
    );
}

function isCountyPolygon(polygon) {
    return (
        polygon.address?.county ||
        polygon.address?.administrative ||
        polygon.address?.district ||
        polygon.address?.city ||
        polygon.address?.town ||
        polygon.address?.village ||
        polygon.address?.municipality
    );
}


function getPolygonLevel(polygon) {
    if (isCountryPolygon(polygon)) return 0;
    if (isRegionPolygon(polygon)) return 1; 
    if (isCountyPolygon(polygon)) return 2;  
    return 3; 
}

function getPolygonStyle(polygon) {
    const level = getPolygonLevel(polygon);
    let pane = 'polygons';

    if (level === 0) pane = 'polygons-country';
    if (level === 1) pane = 'polygons-region';
    if (level === 2) pane = 'polygons-county';

    return {
        pane: pane,
        ...polygonLevelStyles[level]
    };
}

function zoomToPolygonAndFilter(polygon, polyLayer) {
    map.fitBounds(polyLayer.getBounds());
}
