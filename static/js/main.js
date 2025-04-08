// --- DOM Elements ---
const txLatInput = document.getElementById('txLat');
const txLonInput = document.getElementById('txLon');
const rxLatInput = document.getElementById('rxLat');
const rxLonInput = document.getElementById('rxLon');
const txPowerInput = document.getElementById('txPower');
const startFreqInput = document.getElementById('startFreq');
const endFreqInput = document.getElementById('endFreq');
const freqStepsInput = document.getElementById('freqSteps');
// const timeOfDaySelect = document.getElementById('timeOfDay'); // Removed
const txAntennaTypeSelect = document.getElementById('txAntennaType');
const txAntennaHeightSelect = document.getElementById('txAntennaHeight');
const rxAntennaTypeSelect = document.getElementById('rxAntennaType');
const rxAntennaHeightSelect = document.getElementById('rxAntennaHeight');
const noiseEnvironmentSelect = document.getElementById('noiseEnvironment');
const simulateBtn = document.getElementById('simulateBtn');
const loadingIndicator = document.getElementById('loadingIndicator');
const messageBox = document.getElementById('messageBox');
const distanceResult = document.getElementById('distanceResult');
const likelihoodResult = document.getElementById('likelihoodResult');
const groundWaveResult = document.getElementById('groundWaveResult'); // Now SNR
const skyWaveResult = document.getElementById('skyWaveResult');       // Now SNR
const singleResultDisplay = document.getElementById('singleResultDisplay');
const resultsTableContainer = document.getElementById('resultsTableContainer');
const resultsTableBody = resultsTableContainer.querySelector('tbody');
const calcDetailsContainer = document.getElementById('calcDetailsContainer');
const calcDetailsTitle = calcDetailsContainer?.previousElementSibling; // H3 Title
const themeToggleButton = document.getElementById('theme-toggle');
const themeToggleDarkIcon = document.getElementById('theme-toggle-dark-icon');
const themeToggleLightIcon = document.getElementById('theme-toggle-light-icon');


// --- Map Initialization ---
let map = null; // Initialize later globally
let txMarker = null;
let rxMarker = null;
let groundPathLine = null;
let skyPathLine = null;

/**
 * Initializes the Leaflet map instance.
 * Should be called after the DOM is ready.
 */
function initializeMap() {
    // Only initialize if map container exists and map is not already initialized
    if (document.getElementById('map') && !map) {
        console.log("Initializing Leaflet map...");
        try {
            // --- Explicitly set default icon paths ---
            // This can fix issues where Leaflet fails to auto-detect paths, especially with bundlers or complex setups.
            delete L.Icon.Default.prototype._getIconUrl;
            L.Icon.Default.mergeOptions({
                iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
                iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
                shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
            });
            console.log("Leaflet default icon paths set.");
            // --- End Icon Path Fix ---

            map = L.map('map').setView([38, -95], 4); // Center on US initially
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            }).addTo(map);
             console.log("Map initialized successfully.");
        } catch (error) {
            console.error("Leaflet map initialization failed:", error);
            showMessage("Failed to initialize map. Please refresh.", "error");
        }
    } else if (map) {
         // console.log("Map already initialized."); // Optional: uncomment for debugging
    } else {
         console.error("Map container #map not found!");
    }
}


// --- Helper Functions ---
/**
 * Displays a message to the user.
 * @param {string} text - The message text.
 * @param {'error'|'warning'|'info'} type - The type of message.
 */
function showMessage(text, type = 'error') {
    messageBox.textContent = text;
    messageBox.className = 'p-3 mt-4 rounded-md text-sm'; // Reset classes
    if (type === 'error') {
        messageBox.classList.add('bg-red-100', 'dark:bg-red-900', 'text-red-700', 'dark:text-red-200');
    } else if (type === 'warning') {
        messageBox.classList.add('bg-yellow-100', 'dark:bg-yellow-900', 'text-yellow-700', 'dark:text-yellow-200');
    } else { // info
        messageBox.classList.add('bg-blue-100', 'dark:bg-blue-900', 'text-blue-700', 'dark:text-blue-200');
    }
    messageBox.classList.remove('hidden');
}

/**
 * Hides the message box.
 */
function hideMessage() {
    messageBox.classList.add('hidden');
    messageBox.textContent = '';
}

/**
 * Validates latitude and longitude values.
 * @param {number} lat - Latitude.
 * @param {number} lon - Longitude.
 * @returns {boolean} True if coordinates are valid, false otherwise.
 */
function validateCoords(lat, lon) {
     return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

/**
 * Formats SNR value for display.
 * @param {number|null|undefined} snrDb - SNR in dB.
 * @returns {string} Formatted SNR string or '-'.
 */
function formatSNR(snrDb) {
    // Check for null, undefined, or non-finite values including -Infinity
    if (snrDb === null || snrDb === undefined || !isFinite(snrDb)) return "-";
    // Optionally clamp very low values if needed, but showing negative SNR is valid
    // if (snrDb < -50) return "<-50.0"; // Example clamping
    return snrDb.toFixed(1);
}

/**
 * Formats Loss value for display.
 * @param {number|null|undefined} lossDb - Loss in dB.
 * @returns {string} Formatted Loss string or '-'.
 */
function formatLoss(lossDb) {
     if (lossDb === null || lossDb === undefined || !isFinite(lossDb)) return "-";
     return lossDb.toFixed(1);
}

/**
 * Formats Frequency value for display.
 * @param {number|null|undefined} freqMHz - Frequency in MHz.
 * @returns {string} Formatted Frequency string or '-'.
 */
function formatFreq(freqMHz) {
    if (freqMHz === null || freqMHz === undefined) return "-";
    return freqMHz.toFixed(3);
}

// --- UI Update Functions ---

/**
 * Updates the Leaflet map with markers and path lines.
 * @param {number} txLat - Transmitter Latitude.
 * @param {number} txLon - Transmitter Longitude.
 * @param {number} rxLat - Receiver Latitude.
 * @param {number} rxLon - Receiver Longitude.
 * @param {string} skyLikelihood - Skywave likelihood ('Good', 'Fair', 'Poor').
 * @param {number} groundSNR - Estimated Groundwave SNR (dB).
 */
function updateMap(txLat, txLon, rxLat, rxLon, skyLikelihood, groundSNR) {
    console.log(`Attempting map update. Tx: (${txLat}, ${txLon}), Rx: (${rxLat}, ${rxLon}), Likelihood: ${skyLikelihood}, GW SNR: ${groundSNR}`); // Log input parameters

    // Ensure map is initialized before proceeding
    if (!map) {
        console.error("Map object is not initialized in updateMap!");
        // Attempt recovery - might happen if DOMContentLoaded hasn't fired yet somehow
        initializeMap();
        if (!map) {
             console.error("Map initialization failed in updateMap recovery attempt.");
             return; // Exit if still not initialized
        }
    }

    // Ensure coordinates are valid numbers before adding markers
    if (isNaN(txLat) || isNaN(txLon) || isNaN(rxLat) || isNaN(rxLon)) {
        console.error("Invalid coordinates received by updateMap:", {txLat, txLon, rxLat, rxLon});
        showMessage("Cannot update map due to invalid coordinates.", "error");
        return; // Don't try to add markers with invalid coords
    }

    // Remove previous layers safely
    try {
        if (txMarker) map.removeLayer(txMarker);
        if (rxMarker) map.removeLayer(rxMarker);
        if (groundPathLine) map.removeLayer(groundPathLine);
        if (skyPathLine) map.removeLayer(skyPathLine);
        txMarker = rxMarker = groundPathLine = skyPathLine = null; // Reset variables
    } catch(e) {
        console.warn("Error removing previous map layers:", e);
        // Continue execution even if removal failed
    }


    try {
        // Add new markers
        txMarker = L.marker([txLat, txLon]).addTo(map)
            .bindPopup(`<b>Transmitter</b><br>Lat: ${txLat.toFixed(4)}, Lon: ${txLon.toFixed(4)}`);
        rxMarker = L.marker([rxLat, rxLon]).addTo(map)
            .bindPopup(`<b>Receiver</b><br>Lat: ${rxLat.toFixed(4)}, Lon: ${rxLon.toFixed(4)}`);
        console.log("Markers added successfully.");

        const txll = [txLat, txLon];
        const rxll = [rxLat, rxLon];

        // --- Ground Wave Line (Straight) ---
        let groundFeasible = isFinite(groundSNR) && groundSNR > 0; // Basic check if SNR > 0 dB
        let groundStyleClass = groundFeasible ? 'path-ground-good' : 'path-ground-poor';
        groundPathLine = L.polyline([txll, rxll], { className: `path-base ${groundStyleClass}` }).addTo(map);

        // --- Skywave Line (Curved) ---
        let skyStyleClass = 'path-sky-poor'; // Default
        if (skyLikelihood === 'Good') skyStyleClass = 'path-sky-good';
        else if (skyLikelihood === 'Fair') skyStyleClass = 'path-sky-fair';

        // Simple curve calculation
        const midLat = (txLat + rxLat) / 2;
        const midLon = (txLon + rxLon) / 2;
        const latDiff = Math.abs(txLat - rxLat);
        const lonDiff = Math.abs(txLon - rxLon);
        const curveOffsetFactor = 0.25;
        // Ensure offset is reasonable, avoid extreme values if latDiff/lonDiff are huge/tiny
        const offsetBase = Math.max(latDiff, lonDiff);
        // Add a minimum curve offset if points are very close, scaled slightly by latitude
        const minOffset = 1.0 + Math.abs(midLat) * 0.05;
        const curveOffsetLat = midLat + (offsetBase > 0.1 ? offsetBase * curveOffsetFactor : minOffset);

        let midLonCurve = midLon;
        if (Math.abs(txLon - rxLon) > 180) { // Handle wrap
            midLonCurve = (txLon + rxLon + (txLon < rxLon ? 360 : -360)) / 2;
            if (midLonCurve > 180) midLonCurve -= 360;
            if (midLonCurve < -180) midLonCurve += 360;
        }
        const skyLatLngs = [txll, [curveOffsetLat, midLonCurve], rxll];
        skyPathLine = L.polyline(skyLatLngs, { className: `path-base ${skyStyleClass}` }).addTo(map);
        console.log("Path lines added successfully.");

        // Adjust map view
        const bounds = L.latLngBounds([txll, rxll]);
        if (bounds.isValid()) {
             map.fitBounds(bounds.pad(0.15)); // Add padding
             console.log("Map bounds fitted.");
        } else {
             console.warn("Could not fit map bounds - invalid bounds calculated.");
             // Fallback: Set view to midpoint?
             // map.setView([midLat, midLon], 4);
        }

    } catch (error) {
         console.error("Error during map update (adding markers/lines):", error);
         showMessage("Error updating map display.", "error");
    }
}

/**
 * Updates the display area for single frequency results.
 * @param {object} result - The result object from the backend for a single frequency.
 */
function updateSingleResultDisplay(result) {
    if (!result) return;
    distanceResult.textContent = result.distanceKm?.toFixed(1) ?? '-';
    likelihoodResult.textContent = result.skywaveLikelihood ?? '-';
    likelihoodResult.className = 'likelihood-indicator'; // Reset
    switch (result.skywaveLikelihood) {
        case 'Good': likelihoodResult.classList.add('likelihood-good'); break;
        case 'Fair': likelihoodResult.classList.add('likelihood-fair'); break;
        case 'Poor': likelihoodResult.classList.add('likelihood-poor'); break;
        default: likelihoodResult.textContent = '-';
    }
    groundWaveResult.textContent = formatSNR(result.groundWaveSNR);
    skyWaveResult.textContent = formatSNR(result.skywaveSNR);
    singleResultDisplay.classList.remove('hidden');
    resultsTableContainer.classList.add('hidden');
}

/**
 * Updates the results table for frequency range simulations.
 * @param {Array<object>} resultsArray - An array of result objects from the backend.
 */
 function updateResultsTable(resultsArray) {
    resultsTableBody.innerHTML = ''; // Clear previous results
    if (!resultsArray || resultsArray.length === 0) {
         resultsTableContainer.classList.add('hidden');
         singleResultDisplay.classList.remove('hidden'); // Show single display if table empty
         // Clear single display fields as well
         distanceResult.textContent = '-';
         likelihoodResult.textContent = '-';
         likelihoodResult.className = 'likelihood-indicator';
         groundWaveResult.textContent = '-';
         skyWaveResult.textContent = '-';
         return;
    }

    resultsArray.forEach(res => {
        const row = resultsTableBody.insertRow();
        // Updated table columns based on new data
        row.innerHTML = `
            <td class="px-3 py-1.5 whitespace-nowrap">${formatFreq(res.frequencyMHz)}</td>
            <td class="px-3 py-1.5 whitespace-nowrap">${formatSNR(res.groundWaveSNR)}</td>
            <td class="px-3 py-1.5 whitespace-nowrap">${res.skywaveMode ?? '-'}</td>
            <td class="px-3 py-1.5 whitespace-nowrap">${formatLoss(res.absorptionDb)}</td>
            <td class="px-3 py-1.5 whitespace-nowrap">${formatLoss(res.skywaveTotalLossDb)}</td>
            <td class="px-3 py-1.5 whitespace-nowrap">${formatSNR(res.skywaveSNR)}</td>
            <td class="px-3 py-1.5 whitespace-nowrap">
                <span class="likelihood-indicator likelihood-${(res.skywaveLikelihood ?? 'poor').toLowerCase()}">
                    ${res.skywaveLikelihood ?? 'Poor'}
                </span>
            </td>
        `;
    });

    singleResultDisplay.classList.add('hidden');
    resultsTableContainer.classList.remove('hidden');
}

/**
 * Updates the calculation details section.
 * @param {object|null} details - The result object for the frequency to detail (usually center freq), or null to clear.
 */
function updateCalcDetails(details) {
    // This function remains the same as the previous version
    if (!calcDetailsContainer || !details) {
        calcDetailsContainer.innerHTML = '<p>Run simulation to see calculation details.</p>'; // Reset message
        if(calcDetailsTitle) calcDetailsTitle.textContent = 'Calculation Details';
        return;
    }
    // Update title only if details are valid
    if(calcDetailsTitle && details.frequencyMHz) {
        calcDetailsTitle.textContent = `Calculation Details (${formatFreq(details.frequencyMHz)} MHz)`;
    } else if (calcDetailsTitle) {
         calcDetailsTitle.textContent = 'Calculation Details';
    }

    // Format details from the backend result object
    calcDetailsContainer.innerHTML = `
        <p><strong>Distance:</strong> ${details.distanceKm?.toFixed(1) ?? '-'} km</p>
        <p><strong>Tx Power:</strong> ${details.txPowerW ?? '-'} W (${(10 * Math.log10((details.txPowerW ?? 1) * 1000)).toFixed(1)} dBm)</p> <p><strong>Time (UTC):</strong> ${new Date().toISOString()} (${details.timeOfDay ?? '-'})</p>
        <p><strong>Solar Zenith Angle:</strong> ${details.solarZenithAngle?.toFixed(1) ?? '-'}°</p>
        <p><strong>Indices Used:</strong> SFI=${details.sfi ?? '-'}, SSN=${details.ssn ?? '-'}, Kp=${details.kp ?? '-'}</p>
        <hr class="my-2 border-gray-300 dark:border-gray-600">
        <p><strong>Tx Antenna:</strong> ${details.txAntennaType ?? '-'} (${details.txAntennaHeight ?? '-'}) | <strong>Gain:</strong> ${details.txGainDbi?.toFixed(1) ?? '-'} dBi</p>
        <p><strong>Rx Antenna:</strong> ${details.rxAntennaType ?? '-'} (${details.rxAntennaHeight ?? '-'}) | <strong>Gain:</strong> ${details.rxGainDbi?.toFixed(1) ?? '-'} dBi</p>
        <p><strong>Rx Noise Env:</strong> ${details.noiseEnvironment ?? '-'} | <strong>Noise Fig:</strong> ${details.noiseFigureDb?.toFixed(1) ?? '-'} dB</p>
        <p><strong>Noise Floor:</strong> kTB + NoiseFig = ${details.noiseFloorDbm?.toFixed(1) ?? '-'} dBm</p>
        <hr class="my-2 border-gray-300 dark:border-gray-600">
        <p><strong>Est. MUF (F2):</strong> ${details.MUF_F2?.toFixed(1) ?? '-'} MHz | <strong>Est. FOT (F2):</strong> ${details.FOT_F2?.toFixed(1) ?? '-'} MHz</p>
        <p><strong>Est. MUF (E):</strong> ${details.MUF_E?.toFixed(1) ?? '-'} MHz</p>
        <p><strong>Base FSPL:</strong> ${formatLoss(details.fsplDb)} dB</p>
        <p><strong>Absorption (Est.):</strong> ${formatLoss(details.absorptionDb)} dB</p>
        <hr class="my-2 border-gray-300 dark:border-gray-600">
        <p><strong>Ground Wave Loss:</strong> FSPL + Extra ≈ ${formatLoss(details.groundWaveTotalLossDb)} dB</p>
        <p><strong>Skywave Mode:</strong> ${details.skywaveMode ?? '-'}</p>
        <p><strong>Skywave Loss:</strong> FSPL + ModeLoss + Absorp ≈ ${formatLoss(details.skywaveTotalLossDb)} dB</p>
        <hr class="my-2 border-gray-300 dark:border-gray-600">
        <p><strong>Ground Wave SNR (Est.):</strong> ${formatSNR(details.groundWaveSNR)} dB</p>
        <p><strong>Skywave SNR (Est.):</strong> ${formatSNR(details.skywaveSNR)} dB</p>
    `;
}

// --- Dark Mode Logic ---
/**
 * Sets the theme (light/dark) by adding/removing the 'dark' class and saving preference.
 * @param {'light' | 'dark'} theme - The desired theme.
 */
function setTheme(theme) {
    // Remove existing theme class
    document.documentElement.classList.remove('light', 'dark');

    if (theme === 'dark') {
        document.documentElement.classList.add('dark');
        localStorage.setItem('color-theme', 'dark');
        themeToggleLightIcon?.classList.remove('hidden');
        themeToggleDarkIcon?.classList.add('hidden');
    } else {
        document.documentElement.classList.add('light'); // Optional: explicitly add 'light'
        localStorage.setItem('color-theme', 'light');
        themeToggleDarkIcon?.classList.remove('hidden');
        themeToggleLightIcon?.classList.add('hidden');
    }
     console.log(`Theme set to: ${theme}`);
     // Add/remove dark class from map container if needed for specific map styles
     // document.getElementById('map')?.classList.toggle('dark-map', theme === 'dark');
}

/**
 * Toggles the theme between light and dark.
 */
function toggleTheme() {
    const currentTheme = localStorage.getItem('color-theme') ||
                         (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
}

/**
 * Applies the initial theme based on saved preference or OS setting.
 */
function applyInitialTheme() {
    const savedTheme = localStorage.getItem('color-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (savedTheme) {
        setTheme(savedTheme);
    } else {
        setTheme(prefersDark ? 'dark' : 'light');
    }
}


// --- Main Simulation Trigger ---
/**
 * Gathers inputs, validates them, calls the backend API, and updates the UI.
 */
async function handleSimulation() {
    hideMessage();
    loadingIndicator.style.display = 'block'; // Show spinner
    simulateBtn.disabled = true; // Disable button during request
    console.log("Simulation requested...");

    // Get Inputs
    const params = {
        txLat: parseFloat(txLatInput.value),
        txLon: parseFloat(txLonInput.value),
        rxLat: parseFloat(rxLatInput.value),
        rxLon: parseFloat(rxLonInput.value),
        txPowerW: parseFloat(txPowerInput.value),
        startFreq: parseFloat(startFreqInput.value),
        endFreq: parseFloat(endFreqInput.value),
        freqSteps: parseInt(freqStepsInput.value, 10),
        txAntennaType: txAntennaTypeSelect.value,
        txAntennaHeight: txAntennaHeightSelect.value,
        rxAntennaType: rxAntennaTypeSelect.value,
        rxAntennaHeight: rxAntennaHeightSelect.value,
        noiseEnvironment: noiseEnvironmentSelect.value
    };
    console.log("Input Params:", params);

    // Frontend Validation
    let validationError = null;
    if (isNaN(params.txLat) || isNaN(params.txLon) || !validateCoords(params.txLat, params.txLon)) { validationError = "Invalid Transmitter coordinates."; }
    else if (isNaN(params.rxLat) || isNaN(params.rxLon) || !validateCoords(params.rxLat, params.rxLon)) { validationError = "Invalid Receiver coordinates."; }
    else if (params.txLat === params.rxLat && params.txLon === params.rxLon) { validationError = "Transmitter and Receiver locations cannot be the same."; }
    else if (isNaN(params.txPowerW) || params.txPowerW <= 0) { validationError = "Invalid Transmitter Power (must be > 0)."; }
    else if (isNaN(params.startFreq) || params.startFreq < 1.8 || params.startFreq > 30) { validationError = "Invalid Start Frequency (1.8-30 MHz)."; }
    else if (isNaN(params.endFreq) || params.endFreq < 1.8 || params.endFreq > 30) { validationError = "Invalid End Frequency (1.8-30 MHz)."; }
    else if (params.endFreq < params.startFreq) { validationError = "End Frequency must be >= Start Frequency."; }
    else if (isNaN(params.freqSteps) || params.freqSteps < 1 || params.freqSteps > 100) { validationError = "Invalid number of Frequency Steps (1-100)."; } // Use MAX_FREQ_STEPS?
    else if (params.freqSteps > 1 && params.endFreq === params.startFreq) { validationError = "Start and End Frequency cannot be the same when Steps > 1."; }

    if (validationError) {
         showMessage(validationError, 'error');
         loadingIndicator.style.display = 'none';
         simulateBtn.disabled = false;
         return;
    }

    // Call Backend API
    try {
        console.log("Sending request to /simulate");
        const response = await fetch('/simulate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', },
            body: JSON.stringify(params),
        });
        console.log("Response status:", response.status);

        if (!response.ok) {
            let errorMsg = `HTTP error! Status: ${response.status}`;
            let errorDetails = "";
            try {
                const errorData = await response.json();
                errorDetails = errorData.error || JSON.stringify(errorData);
                errorMsg = `${errorMsg} - ${errorDetails}`;
                console.error("Backend error response:", errorData);
            } catch (e) {
                 try {
                     errorDetails = await response.text();
                     errorMsg = `${errorMsg} - ${errorDetails.substring(0, 200)}`;
                     console.error("Backend error response (non-JSON):", errorDetails);
                 } catch (e_text) { console.error("Could not read backend error response body."); }
            }
            throw new Error(errorMsg);
        }

        const resultsArray = await response.json();
        console.log("Received results:", resultsArray);

        // Update UI
         if (resultsArray && resultsArray.length > 0) {
             const firstResult = resultsArray[0];
             const centerIndex = Math.floor(resultsArray.length / 2);
             const centerResult = resultsArray[centerIndex]; // Use center result for map line coloring

             if (resultsArray.length === 1) {
                 updateSingleResultDisplay(firstResult);
                 updateCalcDetails(firstResult); // Update details with the single result
             } else {
                 updateResultsTable(resultsArray);
                 updateCalcDetails(centerResult); // Update details with center result
             }
             // Update map using coordinates from input params & likelihood/SNR from center result
             updateMap(params.txLat, params.txLon, params.rxLat, params.rxLon,
                       centerResult.skywaveLikelihood, centerResult.groundWaveSNR);
         } else {
            console.warn("Received empty results array from server.");
            showMessage("Received empty results from server.", "warning");
            updateResultsTable([]); // Clear table
            updateCalcDetails(null); // Clear details
         }

    } catch (error) {
        console.error('Simulation Error:', error);
        showMessage(`Simulation failed: ${error.message || 'Check console for details.'}`, 'error');
        // Clear results on error
        updateResultsTable([]);
        updateCalcDetails(null);
    } finally {
        loadingIndicator.style.display = 'none'; // Hide spinner
        simulateBtn.disabled = false; // Re-enable button
        console.log("Simulation request finished.");
    }
}

// --- Event Listeners ---
simulateBtn.addEventListener('click', handleSimulation);

// Add listener for the theme toggle button
if (themeToggleButton) {
    themeToggleButton.addEventListener('click', toggleTheme);
} else {
     console.error("Theme toggle button not found!");
}


// --- Initial Setup ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded and parsed.");
    initializeMap(); // Initialize the map once the DOM is ready
    applyInitialTheme(); // Apply light/dark theme on load
    // Optionally run a simulation with default values on load after map init
    // Use a small delay to allow map tiles to potentially start loading
    // setTimeout(handleSimulation, 150); // Uncomment to run on load
});
