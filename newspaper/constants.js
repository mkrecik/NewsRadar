
export var baseLayers = {
    "CartoDB": L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a>'
    }),
    "OpenStreetMap": L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }),
    "MapTiler": L.tileLayer('https://api.maptiler.com/maps/winter-v2/{z}/{x}/{y}.png?key=h7HjjXDoOt4QndexKLba', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.maptiler.com/copyright/" target="_blank">MapTiler</a>'
    }),
  };

export const categoryIcons = {
    "Wydarzenia": L.icon({ iconUrl: 'lucide/wydarzenia.svg'}),
    "Polityka": L.icon({ iconUrl: 'lucide/polityka.svg'}),
    "Gospodarka i Społeczeństwo": L.icon({ iconUrl: 'lucide/gospodarka.svg'}),
    "Kultura": L.icon({ iconUrl: 'lucide/kultura.svg'}),
    "Sport": L.icon({ iconUrl: 'lucide/sport.svg'}),
    "Pogoda i Natura": L.icon({ iconUrl: 'lucide/pogoda.svg'}),
    // "Inne": L.icon({ iconUrl: 'lucide/inne.svg'})
  };

export const categoryColors = {
    "Wydarzenia": "#660001",
    "Polityka": "#990001",
    "Gospodarka i Społeczeństwo": "#CC0002",
    "Sport": "#0D5F8C",
    "Kultura": "#4E8CB0",
    "Pogoda i Natura": "#00314C",
  };

export const categoryLayers = {
    "Wydarzenia": L.layerGroup(),
    "Polityka": L.layerGroup(),
    "Gospodarka i Społeczeństwo": L.layerGroup(),
    "Sport": L.layerGroup(),
    "Kultura": L.layerGroup(),
    "Pogoda i Natura": L.layerGroup(),
    // "Inne": L.layerGroup()
};