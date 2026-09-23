/* ==========================================================================
   AURA MOBILITY INTERACTIVE MAP & ROUTE ENGINE
   Leaflet, OpenStreetMap Nominatim, OSRM Routing Engine (100% Free Stack)
   ========================================================================== */

const AuraMap = {
  instances: {},

  initMap(containerId, options = {}) {
    const defaultCenter = [28.6139, 77.2090]; // Default New Delhi coordinates
    const zoom = options.zoom || 13;

    const container = document.getElementById(containerId);
    if (!container) return null;

    // Check if Leaflet is loaded
    if (typeof L !== 'undefined') {
      const map = L.map(containerId, {
        zoomControl: false
      }).setView(options.center || defaultCenter, zoom);

      // Use 100% free Esri World Street Map tiles (No API Key Required, No 403 Access Blocked)
      const tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';

      const tileLayer = L.tileLayer(tileUrl, {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.esri.com/">Esri</a> &copy; OpenStreetMap contributors'
      });

      tileLayer.addTo(map);



      // Add Zoom Control to Top Right
      L.control.zoom({ position: 'topright' }).addTo(map);

      // Add Custom Live GPS Button to Top Right on Map
      const locateControl = L.control({ position: 'topright' });
      locateControl.onAdd = function() {
        const btn = L.DomUtil.create('button', 'aura-map-locate-btn');
        btn.innerHTML = '📍';
        btn.title = 'Get My Live Location';
        btn.style.cssText = 'background:#FFF; border:2px solid rgba(0,0,0,0.2); border-radius:6px; width:34px; height:34px; font-size:18px; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 6px rgba(0,0,0,0.2); margin-top:6px; color:#2563EB; font-weight:bold; transition:all 0.2s;';
        btn.onclick = function(e) {
          e.stopPropagation();
          e.preventDefault();
          AuraMap.fetchUserLiveLocation(containerId, (data) => {
            const pickupAddr = document.getElementById('pickup_address');
            const pickupLat = document.getElementById('pickup_latitude');
            const pickupLon = document.getElementById('pickup_longitude');
            if (pickupAddr) pickupAddr.value = data.address;
            if (pickupLat) pickupLat.value = data.lat;
            if (pickupLon) pickupLon.value = data.lon;

            const origAddr = document.getElementById('origin_address');
            const origLat = document.getElementById('origin_lat');
            const origLon = document.getElementById('origin_lon');
            if (origAddr) origAddr.value = data.address;
            if (origLat) origLat.value = data.lat;
            if (origLon) origLon.value = data.lon;

            if (window.AuraBooking) window.AuraBooking.updateRoute(data.coords, null);
          });
        };
        return btn;
      };
      locateControl.addTo(map);


      this.instances[containerId] = {
        map: map,
        markers: {},
        routeLine: null
      };

      return map;
    } else {
      // Fallback to Canvas SVG map rendering
      this.initCanvasFallbackMap(containerId);
      return null;
    }
  },

  /**
   * Reverse Geocoding via OpenStreetMap Nominatim
   */
  async reverseGeocode(lat, lon) {
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
      if (!response.ok) return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
      const data = await response.json();
      return data.display_name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    } catch (err) {
      console.warn("Reverse Geocoding Error:", err);
      return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    }
  },

  /**
   * Fetch Live Browser Geolocation, center map, and return address
   */
  fetchUserLiveLocation(containerId, callback) {
    const notify = (msg, type) => {
      if (window.AuraApp && typeof window.AuraApp.showToast === 'function') {
        window.AuraApp.showToast(msg, type);
      } else {
        console.log(`[AuraMap] ${type}: ${msg}`);
      }
    };

    notify("Requesting your live location...", "info");

    let isHandled = false;

    const onSuccess = async (lat, lon) => {
      if (isHandled) return;
      isHandled = true;
      const coords = [lat, lon];

      const instance = this.instances[containerId];
      if (instance && instance.map) {
        instance.map.flyTo(coords, 14);

        if (!instance.markers.userGps) {
          const userIcon = L.divIcon({
            className: 'aura-user-gps-pin',
            html: `<div style="background:#10B981; width:22px; height:22px; border-radius:50%; border:3px solid #FFF; box-shadow:0 0 16px rgba(16,185,129,0.8);"></div>`,
            iconSize: [22, 22]
          });
          instance.markers.userGps = L.marker(coords, { icon: userIcon }).addTo(instance.map);
        } else {
          instance.markers.userGps.setLatLng(coords);
        }
      }

      const address = await this.reverseGeocode(lat, lon);
      notify("Live location updated!", "success");

      if (callback) {
        callback({ lat, lon, coords, address });
      }
    };

    const tryIPFallback = async () => {
      if (isHandled) return;
      try {
        const res = await fetch('https://ipapi.co/json/');
        if (res.ok) {
          const data = await res.json();
          if (data.latitude && data.longitude) {
            onSuccess(data.latitude, data.longitude);
            return;
          }
        }
      } catch (e) {}
      if (!isHandled) {
        notify("Could not detect location automatically. Please select on map or type address.", "warning");
      }
    };

    // Safety fallback timer for browser permission prompt delays
    const fallbackTimer = setTimeout(() => {
      if (!isHandled) tryIPFallback();
    }, 3500);

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(fallbackTimer);
          onSuccess(pos.coords.latitude, pos.coords.longitude);
        },
        (err) => {
          clearTimeout(fallbackTimer);
          console.warn("GPS lookup failed:", err);
          tryIPFallback();
        },
        { enableHighAccuracy: true, timeout: 3000, maximumAge: 0 }
      );
    } else {
      clearTimeout(fallbackTimer);
      tryIPFallback();
    }
  },



  /**
   * Free Geocoding via OpenStreetMap Nominatim
   */
  async searchAddress(query) {

    if (!query || query.trim().length < 3) return [];
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
      if (!response.ok) return [];
      const data = await response.json();
      return data.map(item => ({
        displayName: item.display_name,
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon)
      }));
    } catch (err) {
      console.warn("Nominatim Geocoding Error:", err);
      return [];
    }
  },

  /**
   * Free Routing Engine via OSRM (Open Source Routing Machine) with Turn Steps
   */
  async getOSRMRoute(pickupCoords, dropCoords) {
    const pLat = pickupCoords[0], pLon = pickupCoords[1];
    const dLat = dropCoords[0], dLon = dropCoords[1];
    
    // OSRM expects lon,lat format with steps=true for turn-by-turn navigation
    const url = `https://router.project-osrm.org/route/v1/driving/${pLon},${pLat};${dLon},${dLat}?overview=full&geometries=geojson&steps=true`;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("OSRM routing request failed");
      const data = await response.json();
      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const latLngs = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);
        
        // Extract turn-by-turn steps
        let steps = [];
        if (route.legs && route.legs[0] && route.legs[0].steps) {
          steps = route.legs[0].steps.map(s => {
            const m = s.maneuver || {};
            return {
              type: m.type || 'straight',
              modifier: m.modifier || '',
              name: s.name || 'Road',
              distanceM: Math.round(s.distance || 0),
              durationS: Math.round(s.duration || 0),
              location: m.location ? [m.location[1], m.location[0]] : null
            };
          });
        }

        return {
          latLngs: latLngs,
          steps: steps,
          distanceKm: parseFloat((route.distance / 1000).toFixed(2)),
          durationMins: Math.round(route.duration / 60)
        };
      }
    } catch (err) {
      console.warn("OSRM Route fetching failed, falling back to direct line:", err);
    }

    const fallbackDist = this.calculateHaversineDistance(pLat, pLon, dLat, dLon);
    return {
      latLngs: [pickupCoords, dropCoords],
      steps: [
        { type: 'depart', modifier: 'straight', name: 'Pickup Location', distanceM: 0, durationS: 0, location: pickupCoords },
        { type: 'arrive', modifier: 'straight', name: 'Destination Dropoff', distanceM: Math.round(fallbackDist * 1000), durationS: Math.round(fallbackDist * 150), location: dropCoords }
      ],
      distanceKm: parseFloat(fallbackDist.toFixed(2)),
      durationMins: Math.round(fallbackDist * 2.5)
    };
  },

  /**
   * Render real street navigation route, glow line, and pins onto Leaflet Map
   */
  async renderRoadRoute(containerId, pickupCoords, dropCoords) {
    const instance = this.instances[containerId];
    if (!instance || !instance.map) return null;

    // Clear existing layers
    if (instance.markers.pickup) instance.map.removeLayer(instance.markers.pickup);
    if (instance.markers.drop) instance.map.removeLayer(instance.markers.drop);
    if (instance.routeGlow) instance.map.removeLayer(instance.routeGlow);
    if (instance.routeLine) instance.map.removeLayer(instance.routeLine);
    if (instance.traversedLine) instance.map.removeLayer(instance.traversedLine);

    // Custom Styled Pickup Pin with Label Pill
    const pickupIcon = L.divIcon({
      className: 'aura-map-pin-pickup',
      html: `
        <div style="display:flex; flex-direction:column; align-items:center;">
          <div style="background:#2563EB; color:#FFF; font-size:10px; font-weight:700; padding:2px 6px; border-radius:10px; white-space:nowrap; box-shadow:0 2px 6px rgba(0,0,0,0.2); margin-bottom:2px;">📍 Pickup</div>
          <div style="background:#2563EB; width:18px; height:18px; border-radius:50%; border:3px solid #FFF; box-shadow:0 0 12px rgba(37,99,235,0.8);"></div>
        </div>
      `,
      iconSize: [60, 42],
      iconAnchor: [30, 42]
    });

    // Custom Styled Dropoff Pin with Label Pill
    const dropIcon = L.divIcon({
      className: 'aura-map-pin-drop',
      html: `
        <div style="display:flex; flex-direction:column; align-items:center;">
          <div style="background:#F59E0B; color:#0F172A; font-size:10px; font-weight:700; padding:2px 6px; border-radius:10px; white-space:nowrap; box-shadow:0 2px 6px rgba(0,0,0,0.2); margin-bottom:2px;">🏁 Dropoff</div>
          <div style="background:#F59E0B; width:18px; height:18px; border-radius:50%; border:3px solid #FFF; box-shadow:0 0 12px rgba(245,158,11,0.8);"></div>
        </div>
      `,
      iconSize: [60, 42],
      iconAnchor: [30, 42]
    });

    instance.markers.pickup = L.marker(pickupCoords, { icon: pickupIcon }).addTo(instance.map);
    instance.markers.drop = L.marker(dropCoords, { icon: dropIcon }).addTo(instance.map);

    // Fetch OSRM Road Route
    const routeData = await this.getOSRMRoute(pickupCoords, dropCoords);

    // Draw Outer Navigation Glow Polyline
    instance.routeGlow = L.polyline(routeData.latLngs, {
      color: '#1D4ED8',
      weight: 10,
      opacity: 0.35,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(instance.map);

    // Draw Primary Bright Blue Navigation Route Polyline
    instance.routeLine = L.polyline(routeData.latLngs, {
      color: '#2563EB',
      weight: 5,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(instance.map);

    // Prepare Traversed Route Layer (faded gray for driven path)
    instance.traversedLine = L.polyline([], {
      color: '#94A3B8',
      weight: 5,
      opacity: 0.6,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(instance.map);

    // Smoothly fit map bounds
    const bounds = L.latLngBounds([pickupCoords, dropCoords]);
    instance.map.fitBounds(bounds, { padding: [60, 60] });

    return routeData;
  },

  updateNavigationProgress(containerId, activeIndex, latLngs) {
    const instance = this.instances[containerId];
    if (!instance || !instance.map || !latLngs) return;

    if (instance.traversedLine && activeIndex > 0) {
      const drivenCoords = latLngs.slice(0, activeIndex + 1);
      instance.traversedLine.setLatLngs(drivenCoords);
    }
  },

  setMarkers(containerId, pickupCoords, dropCoords) {
    this.renderRoadRoute(containerId, pickupCoords, dropCoords);
  },

  updateDriverMarker(containerId, driverCoords) {
    const instance = this.instances[containerId];
    if (!instance || !instance.map) return;

    if (!instance.markers.driver) {
      const driverIcon = L.divIcon({
        className: 'aura-driver-marker',
        html: `
          <div style="position:relative; display:flex; align-items:center; justify-content:center;">
            <div class="aura-driver-marker-pulse"></div>
            <div style="background:#0F172A; color:#FFF; padding:5px 10px; border-radius:20px; font-weight:700; font-size:11px; border:2px solid #38BDF8; box-shadow:0 4px 14px rgba(0,0,0,0.35); display:flex; align-items:center; gap:4px; white-space:nowrap; z-index:2;">
              <span>🚖</span> <span>En Route</span>
            </div>
          </div>
        `,
        iconSize: [100, 36],
        iconAnchor: [50, 18]
      });
      instance.markers.driver = L.marker(driverCoords, { icon: driverIcon }).addTo(instance.map);
    } else {
      instance.markers.driver.setLatLng(driverCoords);
    }
  },

  calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  },

  initCanvasFallbackMap(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `
      <div style="width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; background:var(--color-surface-hover); color:var(--color-text-muted);">
        <svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
        <p style="margin-top:0.5rem; font-weight:600;">AURA Vector Map Simulator</p>
      </div>
    `;
  }
};
