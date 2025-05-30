let searchButton, searchInput, searchContainer;
let filterButton, dateFilters;

let isSearchVisible = false;
let isFilterVisible = false;

let searchClickHandler, filterClickHandler, documentClickHandler;

function setupMobileInteractions() {
  searchButton = document.getElementById("search-button");
  searchInput = document.getElementById("search-input");
  searchContainer = document.getElementById("search-container");

  filterButton = document.querySelector(".filter-button");
  dateFilters = document.querySelector(".date-filters");

  if (!searchButton || !searchInput || !searchContainer || !filterButton || !dateFilters) return;

  hideSearch();
  hideFilter();

  searchButton.style.transition = "width 0.2s, padding 0.2s";
  searchInput.style.transition = "opacity 0.2s, visibility 0.2s, padding 0.2s";

  searchClickHandler = function (event) {
    event.stopPropagation();
    if (event.target === searchInput) return;
    if (!isSearchVisible) {
      showSearch();
      hideFilter();
    } else {
      hideSearch();
    }
  };

  filterClickHandler = function (event) {
    event.stopPropagation();
    if (!isFilterVisible) {
      showFilter();
      hideSearch();
    } else {
      hideFilter();
    }
  };

  documentClickHandler = function (event) {
    if (
      !searchContainer.contains(event.target) &&
      !filterButton.contains(event.target) &&
      !dateFilters.contains(event.target)
    ) {
      hideSearch();
      hideFilter();
    }
  };

  searchButton.addEventListener("click", searchClickHandler);
  filterButton.addEventListener("click", filterClickHandler);
  document.addEventListener("click", documentClickHandler);
}

function cleanupMobileInteractions() {
  if (!searchButton || !filterButton || !documentClickHandler) return;

  searchButton.removeEventListener("click", searchClickHandler);
  filterButton.removeEventListener("click", filterClickHandler);
  document.removeEventListener("click", documentClickHandler);

  hideSearch();
  hideFilter();

  searchButton.style.width = "";
  searchButton.style.padding = "";
  searchInput.style.width = "";
  searchInput.style.opacity = "";
  searchInput.style.padding = "";
  searchInput.style.visibility = "";
  dateFilters.style.opacity = "";
  dateFilters.style.visibility = "";


  isSearchVisible = false;
  isFilterVisible = false;
}

const mobileQuery = window.matchMedia("(max-width: 668px)");
mobileQuery.addEventListener("change", (e) => {
  if (e.matches) {
    setupMobileInteractions();
  } else {
    cleanupMobileInteractions();
  }
});

document.addEventListener("DOMContentLoaded", () => {
  if (mobileQuery.matches) {
    setupMobileInteractions();
  }
});

function showSearch() {
  searchButton.style.width = "200px";
  searchButton.style.padding = "5px";
  searchInput.style.width = "120px";
  searchInput.style.opacity = "1";
  searchInput.style.padding = "5px 15px";
  searchInput.style.visibility = "visible";
  isSearchVisible = true;
}

function hideSearch() {
  searchButton.style.width = "";
  searchButton.style.padding = "";
  searchInput.style.width = "0";
  searchInput.style.opacity = "0";
  searchInput.style.padding = "0";
  searchInput.style.visibility = "hidden";
  isSearchVisible = false;
}

function showFilter() {
  dateFilters.style.opacity = "1";
  dateFilters.style.visibility = "visible";
  isFilterVisible = true;
}

function hideFilter() {
  dateFilters.style.opacity = "0";
  dateFilters.style.visibility = "hidden";
  isFilterVisible = false;
}
