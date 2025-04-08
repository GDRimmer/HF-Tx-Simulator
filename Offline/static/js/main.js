// --- DOM Elements ---
const txLatInput = document.getElementById('txLat');
const txLonInput = document.getElementById('txLon');
const rxLatInput = document.getElementById('rxLat');
const rxLonInput = document.getElementById('rxLon');
const txPowerInput = document.getElementById('txPower');
const startFreqInput = document.getElementById('startFreq');
const endFreqInput = document.getElementById('endFreq');
const freqStepsInput = document.getElementById('freqSteps');
const sfiInput = document.getElementById('sfi'); // Added
const ssnInput = document.getElementById('ssn'); // Added
const kpInput = document.getElementById('kp');   // Added
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
const themeToggleButton = document.getElementById('theme-toggle'); // Added

// --- Removed Map Variables ---

// --- Removed Map Functions ---

// --- Helper Functions ---
/**
 * Displays a message to the user.
 * @param {string} text - The message text.
 * @param {'error'|'warning'|'info'} type - The type of message.
 */
function showMessage(text, type = 'error') {
    messageBox.textContent = text;
    messageBox.className = 'message-box'; // Reset classes
    messageBox.style.display = 'block'; // Make visible
    // Add specific type classes (assuming basic CSS provides these)
    if (type === 'error') {
        messageBox.classList.add('bg-red-100'); // Corresponds to CSS var --msg-error-bg in light mode
    } else if (type === 'warning') {
        messageBox.classList.add('bg-yellow-100'); // Corresponds to CSS var --msg-warn-bg in light mode
    } else { // info
        messageBox.classList.add('bg-blue-100'); // Corresponds to CSS var --msg-info-bg in light mode
    }
}

/**
 * Hides the message box.
 */
function hideMessage() {
    messageBox.style.display = 'none';
    messageBox.textContent = '';
    messageBox.className = 'message-box'; // Reset classes
}

/**
 * Validates latitude and longitude values.
 * @param {number} lat - Latitude.
 * @param {number} lon - Longitude.
 * @returns {boolean} True if coordinates are valid, false otherwise.
 */
function validateCoords(lat, lon) {
     // Use isFinite to also catch NaN/Infinity
     return isFinite(lat) && isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

/**
 * Formats SNR value for display.
 * @param {number|null|undefined} snrDb - SNR in dB.
 * @returns {string} Formatted SNR string or '-'.
 */
function formatSNR(snrDb) {
    if (snrDb === null || snrDb === undefined || !isFinite(snrDb)) return "-";
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
 * Updates the display area for single frequency results.
 * @param {object} result - The result object from the backend for a single frequency.
 */
function updateSingleResultDisplay(result) {
    if (!result) return;
    distanceResult.textContent = result.distanceKm?.toFixed(1) ?? '-';
    likelihoodResult.textContent = result.skywaveLikelihood ?? '-';
    likelihoodResult.className = 'likelihood-indicator'; // Reset
    let likelihoodClass = (result.skywaveLikelihood ?? 'poor').toLowerCase();
    // Handle custom likelihood string from backend
    if (likelihoodClass.includes('gw')) {
         likelihoodClass = 'fair-gw'; // Use a specific class for GW? indication
    }
    likelihoodResult.classList.add(`likelihood-${likelihoodClass}`);

    groundWaveResult.textContent = formatSNR(result.groundWaveSNR);
    skyWaveResult.textContent = formatSNR(result.skywaveSNR);
    singleResultDisplay.style.display = 'grid'; // Use style.display now
    resultsTableContainer.style.display = 'none';
}

/**
 * Updates the results table for frequency range simulations.
 * @param {Array<object>} resultsArray - An array of result objects from the backend.
 */
 function updateResultsTable(resultsArray) {
    resultsTableBody.innerHTML = ''; // Clear previous results
    if (!resultsArray || resultsArray.length === 0) {
         resultsTableContainer.style.display = 'none';
         singleResultDisplay.style.display = 'grid'; // Show single display if table empty
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
        let likelihoodClass = (res.skywaveLikelihood ?? 'poor').toLowerCase();
        if (likelihoodClass.includes('gw')) {
            likelihoodClass = 'fair-gw';
        }
        // Updated table columns based on new data
        row.innerHTML = `
            <td>${formatFreq(res.frequencyMHz)}</td>
            <td>${formatSNR(res.groundWaveSNR)}</td>
            <td>${res.skywaveMode ?? '-'}</td>
            <td>${formatLoss(res.absorptionDb)}</td>
            <td>${formatLoss(res.skywaveTotalLossDb)}</td>
            <td>${formatSNR(res.skywaveSNR)}</td>
            <td>
                <span class="likelihood-indicator likelihood-${likelihoodClass}">
                    ${res.skywaveLikelihood ?? 'Poor'}
                </span>
            </td>
        `;
    });

    singleResultDisplay.style.display = 'none';
    resultsTableContainer.style.display = 'block'; // Use block for table container
}

/**
 * Updates the calculation details section.
 * @param {object|null} details - The result object for the frequency to detail (usually center freq), or null to clear.
 */
function updateCalcDetails(details) {
    if (!calcDetailsContainer || !details) {
        calcDetailsContainer.innerHTML = '<p>Run simulation to see calculation details.</p>'; // Reset message
        if(calcDetailsTitle) calcDetailsTitle.textContent = 'Calculation Details';
        return;
    }
    if(calcDetailsTitle && details.frequencyMHz) {
        calcDetailsTitle.textContent = `Calculation Details (${formatFreq(details.frequencyMHz)} MHz)`;
    } else if (calcDetailsTitle) {
         calcDetailsTitle.textContent = 'Calculation Details';
    }
    calcDetailsContainer.innerHTML = `
        <p><strong>Distance:</strong> ${details.distanceKm?.toFixed(1) ?? '-'} km</p>
        <p><strong>Tx Power:</strong> ${details.txPowerW ?? '-'} W (${(10 * Math.log10((details.txPowerW ?? 1) * 1000)).toFixed(1)} dBm)</p>
        <p><strong>Time Used (UTC):</strong> ${new Date().toISOString()} (${details.timeOfDay ?? '-'})</p>
        <p><strong>Solar Zenith Angle:</strong> ${details.solarZenithAngle?.toFixed(1) ?? '-'}°</p>
        <p><strong>Indices Used:</strong> SFI=${details.sfi ?? '-'}, SSN=${details.ssn ?? '-'}, Kp=${details.kp ?? '-'}</p>
        <hr>
        <p><strong>Tx Antenna:</strong> ${details.txAntennaType ?? '-'} (${details.txAntennaHeight ?? '-'}) | <strong>Gain:</strong> ${details.txGainDbi?.toFixed(1) ?? '-'} dBi</p>
        <p><strong>Rx Antenna:</strong> ${details.rxAntennaType ?? '-'} (${details.rxAntennaHeight ?? '-'}) | <strong>Gain:</strong> ${details.rxGainDbi?.toFixed(1) ?? '-'} dBi</p>
        <p><strong>Rx Noise Env:</strong> ${details.noiseEnvironment ?? '-'} | <strong>Noise Fig:</strong> ${details.noiseFigureDb?.toFixed(1) ?? '-'} dB</p>
        <p><strong>Noise Floor:</strong> kTB + NoiseFig = ${details.noiseFloorDbm?.toFixed(1) ?? '-'} dBm</p>
        <hr>
        <p><strong>Est. MUF (F2):</strong> ${details.MUF_F2?.toFixed(1) ?? '-'} MHz | <strong>Est. FOT (F2):</strong> ${details.FOT_F2?.toFixed(1) ?? '-'} MHz</p>
        <p><strong>Est. MUF (E):</strong> ${details.MUF_E?.toFixed(1) ?? '-'} MHz</p>
        <p><strong>Base FSPL:</strong> ${formatLoss(details.fsplDb)} dB</p>
        <p><strong>Absorption (Est.):</strong> ${formatLoss(details.absorptionDb)} dB</p>
        <hr>
        <p><strong>Ground Wave Loss:</strong> FSPL + Extra ≈ ${formatLoss(details.groundWaveTotalLossDb)} dB</p>
        <p><strong>Skywave Mode:</strong> ${details.skywaveMode ?? '-'}</p>
        <p><strong>Skywave Loss:</strong> FSPL + ModeLoss + Absorp ≈ ${formatLoss(details.skywaveTotalLossDb)} dB</p>
        <hr>
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
    const isDark = theme === 'dark';
    // Apply class to HTML element
    document.documentElement.classList.toggle('dark', isDark);
    // Save preference
    localStorage.setItem('color-theme', theme);
    // Update button text/symbol (using simple symbols)
    if (themeToggleButton) {
        themeToggleButton.textContent = isDark ? '☀️' : '🌙'; // Sun for dark, Moon for light
    }
    console.log(`Theme set to: ${theme}`);
}

/**
 * Toggles the theme between light and dark.
 */
function toggleTheme() {
    const currentThemeIsDark = document.documentElement.classList.contains('dark');
    const newTheme = currentThemeIsDark ? 'light' : 'dark';
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
    loadingIndicator.style.display = 'block';
    simulateBtn.disabled = true;
    console.log("Simulation requested...");

    // Get Inputs, including SFI, SSN, Kp
    const params = {
        txLat: parseFloat(txLatInput.value),
        txLon: parseFloat(txLonInput.value),
        rxLat: parseFloat(rxLatInput.value),
        rxLon: parseFloat(rxLonInput.value),
        txPowerW: parseFloat(txPowerInput.value),
        startFreq: parseFloat(startFreqInput.value),
        endFreq: parseFloat(endFreqInput.value),
        freqSteps: parseInt(freqStepsInput.value, 10),
        sfi: parseInt(sfiInput.value, 10), // Added
        ssn: parseInt(ssnInput.value, 10), // Added
        kp: parseInt(kpInput.value, 10),   // Added
        txAntennaType: txAntennaTypeSelect.value,
        txAntennaHeight: txAntennaHeightSelect.value,
        rxAntennaType: rxAntennaTypeSelect.value,
        rxAntennaHeight: rxAntennaHeightSelect.value,
        noiseEnvironment: noiseEnvironmentSelect.value
    };
    console.log("Input Params:", params);

    // Frontend Validation
    let validationError = null;
    if (!validateCoords(params.txLat, params.txLon)) { validationError = "Invalid Transmitter coordinates."; }
    else if (!validateCoords(params.rxLat, params.rxLon)) { validationError = "Invalid Receiver coordinates."; }
    else if (params.txLat === params.rxLat && params.txLon === params.rxLon) { validationError = "Transmitter and Receiver locations cannot be the same."; }
    else if (isNaN(params.txPowerW) || params.txPowerW <= 0) { validationError = "Invalid Transmitter Power (must be > 0)."; }
    else if (isNaN(params.startFreq) || params.startFreq < 1.8 || params.startFreq > 30) { validationError = "Invalid Start Frequency (1.8-30 MHz)."; }
    else if (isNaN(params.endFreq) || params.endFreq < 1.8 || params.endFreq > 30) { validationError = "Invalid End Frequency (1.8-30 MHz)."; }
    else if (params.endFreq < params.startFreq) { validationError = "End Frequency must be >= Start Frequency."; }
    else if (isNaN(params.freqSteps) || params.freqSteps < 1 || params.freqSteps > 100) { validationError = "Invalid number of Frequency Steps (1-100)."; } // Use MAX_FREQ_STEPS?
    else if (params.freqSteps > 1 && params.endFreq === params.startFreq) { validationError = "Start and End Frequency cannot be the same when Steps > 1."; }
    // Use constants defined in backend for validation ranges if possible, or duplicate here
    else if (isNaN(params.sfi) || params.sfi < 60 || params.sfi > 350) { validationError = "Invalid SFI value (60-350)."; }
    else if (isNaN(params.ssn) || params.ssn < 0 || params.ssn > 400) { validationError = "Invalid SSN value (0-400)."; }
    else if (isNaN(params.kp) || params.kp < 0 || params.kp > 9) { validationError = "Invalid Kp value (0-9)."; }


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
            body: JSON.stringify(params), // Send params including sfi, ssn, kp
        });
        console.log("Response status:", response.status);

        if (!response.ok) { /* ... (error handling remains same) ... */
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
             const centerResult = resultsArray[centerIndex];

             if (resultsArray.length === 1) {
                 updateSingleResultDisplay(firstResult);
                 updateCalcDetails(firstResult);
             } else {
                 updateResultsTable(resultsArray);
                 updateCalcDetails(centerResult);
             }
             // No map update needed
         } else {
            console.warn("Received empty results array from server.");
            showMessage("Received empty results from server.", "warning");
            updateResultsTable([]);
            updateCalcDetails(null);
         }

    } catch (error) {
        console.error('Simulation Error:', error);
        showMessage(`Simulation failed: ${error.message || 'Check console for details.'}`, 'error');
        updateResultsTable([]);
        updateCalcDetails(null);
    } finally {
        loadingIndicator.style.display = 'none';
        simulateBtn.disabled = false;
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
    // Removed map initialization
    applyInitialTheme(); // Apply light/dark theme on load
    // Optionally run simulation on load
    // handleSimulation();
});
