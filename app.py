import math
import json
import datetime
import time
import traceback # Import traceback for logging
from flask import Flask, request, jsonify, render_template, make_response
import requests
import numpy as np # Using numpy for some math functions

# --- Configuration & Constants ---
# Cache for NOAA data to avoid hitting the API too often
NOAA_CACHE = {
    'radio_flux': {'data': None, 'timestamp': 0}, # Using solar-radio-flux for SFI
    'kp_7day': {'data': None, 'timestamp': 0},    # Using 7-day Kp forecast for Kp
}
CACHE_DURATION_SECONDS = 15 * 60 # Cache data for 15 minutes
MAX_FREQ_STEPS = 100 # Limit frequency steps for DoS prevention
MAX_TX_POWER = 10000 # Example limit for Tx Power (Watts)

# Physics Constants
C = 299792458  # Speed of light m/s
BOLTZMANN_K = 1.380649e-23
REFERENCE_TEMP = 290 # Kelvin
BANDWIDTH = 3000 # Hz for SSB

# Simplified Noise Figures (dB added to thermal noise floor)
NOISE_FIGURES = {
    'Quiet Rural': 5, 'Rural': 8, 'Residential': 12,
    'Urban': 16, 'Industrial': 20
}
ALLOWED_NOISE_ENV = list(NOISE_FIGURES.keys())

# Simplified Antenna Parameters
ANTENNA_PARAMS = {
    'type': {
        'Dipole': {'base_gain_dbi': 2.15},
        'Vertical': {'base_gain_dbi': 1.5},
        'Yagi (Simple)': {'base_gain_dbi': 7.0}
    },
    'height': {
        'Low (<0.25λ)': -1.0,
        'Medium (≈0.5λ)': 0.0,
        'High (>0.75λ)': 1.0
    }
}
ALLOWED_ANTENNA_TYPES = list(ANTENNA_PARAMS['type'].keys())
ALLOWED_ANTENNA_HEIGHTS = list(ANTENNA_PARAMS['height'].keys())


# --- Flask App Initialization ---
app = Flask(__name__)

# --- Security Headers ---
@app.after_request
def add_security_headers(response):
    # Prevent MIME type sniffing
    response.headers['X-Content-Type-Options'] = 'nosniff'
    # Prevent clickjacking
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    # Control referrer information
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    # Basic Content Security Policy (adjust as needed)
    csp = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://unpkg.com https://cdn.tailwindcss.com; "
        "style-src 'self' 'unsafe-inline' https://unpkg.com; "
        "img-src 'self' data: https://*.tile.openstreetmap.org; "
        "font-src 'self' https://cdn.jsdelivr.net; "
        "connect-src 'self';" # Allows fetch requests to own origin (/simulate)
    )
    response.headers['Content-Security-Policy'] = csp
    # Optional: HTTP Strict Transport Security (only if using HTTPS)
    # response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    return response


# --- NOAA Data Fetching ---
def get_noaa_data(product_key, url):
    """Fetches data from NOAA SWPC URL with simple caching."""
    now = time.time()
    cache_entry = NOAA_CACHE.get(product_key)

    # Check cache first
    if cache_entry and (now - cache_entry['timestamp'] < CACHE_DURATION_SECONDS):
        # print(f"Using cached data for {product_key}")
        return cache_entry['data']

    try:
        # print(f"Fetching fresh data for {product_key} from {url}")
        response = requests.get(url, timeout=10) # Added timeout
        response.raise_for_status() # Raise HTTPError for bad responses (4xx or 5xx)
        data = response.json()
        # Update cache only if fetch and parse are successful
        NOAA_CACHE[product_key] = {'data': data, 'timestamp': now}
        return data
    except requests.exceptions.RequestException as e:
        print(f"Error fetching NOAA data for {product_key}: {e}")
        # Return old cached data if available on fetch error, otherwise None
        return cache_entry['data'] if cache_entry else None
    except json.JSONDecodeError as e:
        print(f"Error decoding JSON for {product_key}: {e}")
        # Return old cached data if available on parse error, otherwise None
        return cache_entry['data'] if cache_entry else None


def get_latest_indices():
    """Extracts latest SFI, SSN, Kp, Ap from cached/fetched NOAA data."""
    sfi = 80 # Default fallback
    ssn = 10 # Default fallback (Using default as reliable daily JSON source unclear)
    kp = 2   # Default fallback
    ap = 5   # Default fallback

    # --- Get SFI (F10.7) using solar-radio-flux ---
    # Structure is array of objects: [{"time_tag": "...", "flux": ..., "observed_or_predicted": "OBSERVED"}, ...]
    srf_url = 'https://services.swpc.noaa.gov/json/solar-radio-flux.json'
    srf_data = get_noaa_data('radio_flux', srf_url)
    if srf_data and isinstance(srf_data, list) and len(srf_data) > 0:
        try:
            # Find the latest OBSERVED flux value
            latest_observed_sfi = None
            for entry in reversed(srf_data):
                if entry.get('observed_or_predicted', '').upper() == 'OBSERVED' and 'flux' in entry:
                    latest_observed_sfi = entry['flux']
                    break # Found the latest observed
            if latest_observed_sfi is not None:
                sfi = int(float(latest_observed_sfi))
                # print(f"SFI from {srf_url}: {sfi}")
            else:
                 print(f"No OBSERVED SFI found in {srf_url}. Using default.")
        except (ValueError, TypeError, KeyError, IndexError) as e:
            print(f"Error parsing F10.7 data from {srf_url}: {e}. Using default SFI.")
    else:
         print(f"Solar Radio Flux data not available or in unexpected format from {srf_url}.")


    # --- Get Kp using 7-day forecast file ---
    # Structure is array, index 0=header, data rows: ["time_tag", kp_value, "status"] where status="observed", "estimated", "predicted"
    kp_url = 'https://services.swpc.noaa.gov/json/geospace/geospce_pred_est_kp_7_day.json'
    kp_data = get_noaa_data('kp_7day', kp_url)
    if kp_data and isinstance(kp_data, list) and len(kp_data) > 1: # Need header + data
         try:
             # Find the last entry marked as 'observed'
             last_observed_kp = None
             for entry in reversed(kp_data[1:]): # Skip header row
                 # Check entry structure before accessing indices
                 if len(entry) >= 3 and entry[2] == 'observed' and entry[1] is not None:
                     last_observed_kp = entry[1]
                     break # Found the latest observed Kp
             if last_observed_kp is not None:
                 kp = int(float(last_observed_kp)) # Kp can be float in source
                 # print(f"Observed Kp from {kp_url}: {kp}")
             else:
                  print(f"No OBSERVED Kp found in {kp_url}. Using default.")
         except (IndexError, ValueError, TypeError) as e:
             print(f"Error parsing Kp data from {kp_url}: {e}. Using default Kp.")
    else:
        print(f"Kp data not available or in unexpected format from {kp_url}.")


    # --- SSN ---
    # print(f"Using default/fallback SSN: {ssn}")


    # Very rough Ap estimate from Kp
    kp_to_ap = {0: 0, 1: 3, 2: 7, 3: 15, 4: 27, 5: 48, 6: 80, 7: 140, 8: 240, 9: 400}
    ap = kp_to_ap.get(kp, 7) # Default to Ap for Kp=2 if Kp is invalid

    # Basic sanity check
    sfi = max(60, min(sfi, 350))
    ssn = max(0, min(ssn, 400)) # Still check default SSN just in case
    kp = max(0, min(kp, 9))
    ap = max(0, min(ap, 400))

    return {'sfi': sfi, 'ssn': ssn, 'kp': kp, 'ap': ap}

# --- Geographic & Time Helpers ---
# calculate_distance, get_solar_zenith_angle remain the same
def calculate_distance(lat1, lon1, lat2, lon2):
    """Calculate great-circle distance using Haversine formula."""
    R = 6371  # Earth radius in km
    lat1_rad, lon1_rad = math.radians(lat1), math.radians(lon1)
    lat2_rad, lon2_rad = math.radians(lat2), math.radians(lon2)
    dlon = lon2_rad - lon1_rad
    dlat = lat2_rad - lat1_rad
    a = math.sin(dlat / 2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def get_solar_zenith_angle(lat, lon, dt_utc):
    """Approximate solar zenith angle."""
    day_of_year = dt_utc.timetuple().tm_yday
    hour_utc = dt_utc.hour + dt_utc.minute / 60.0 + dt_utc.second / 3600.0
    declination = -23.44 * math.cos(math.radians(360.0 / 365.25 * (day_of_year + 10)))
    hour_angle = 15.0 * (hour_utc - 12.0) + lon
    lat_rad = math.radians(lat)
    decl_rad = math.radians(declination)
    ha_rad = math.radians(hour_angle)
    cos_zenith = (math.sin(lat_rad) * math.sin(decl_rad) +
                  math.cos(lat_rad) * math.cos(decl_rad) * math.cos(ha_rad))
    cos_zenith = max(-1.0, min(1.0, cos_zenith))
    zenith_angle_rad = math.acos(cos_zenith)
    zenith_angle_deg = math.degrees(zenith_angle_rad)
    return zenith_angle_deg

# --- Propagation Modeling Helpers ---
# calculate_noise_floor_dbm, estimate_muf_fot, calculate_absorption,
# calculate_path_loss, get_antenna_gain, calculate_snr, isfinite
# remain the same as the previous version.

def calculate_noise_floor_dbm(noise_environment_name):
    """Calculates the receiver noise floor in dBm."""
    noise_figure_db = NOISE_FIGURES.get(noise_environment_name, NOISE_FIGURES['Residential'])
    noise_power_w = BOLTZMANN_K * REFERENCE_TEMP * BANDWIDTH
    if noise_power_w <= 0: noise_power_dbm = -float('inf')
    else: noise_power_dbm = 10 * math.log10(noise_power_w / 0.001)
    noise_floor_dbm = noise_power_dbm + noise_figure_db
    return {'noiseFloorDbm': noise_floor_dbm, 'noiseFigureDb': noise_figure_db}

def estimate_muf_fot(lat1, lon1, lat2, lon2, dt_utc, ssn):
    """VERY simplified MUF/FOT estimation."""
    mid_lat = (lat1 + lat2) / 2
    lon_diff = lon2 - lon1
    if lon_diff > 180: mid_lon = (lon1 + lon2 - 360) / 2
    elif lon_diff < -180: mid_lon = (lon1 + lon2 + 360) / 2
    else: mid_lon = (lon1 + lon2) / 2
    if mid_lon > 180: mid_lon -= 360
    if mid_lon < -180: mid_lon += 360
    zenith_angle = get_solar_zenith_angle(mid_lat, mid_lon, dt_utc)
    ssn_factor = 10 + (ssn * 0.1)
    zenith_factor = max(0, math.cos(math.radians(zenith_angle)))**0.5
    estimated_f2_muf = ssn_factor * (1 + 1.5 * zenith_factor)
    estimated_f2_muf = max(5.0, min(estimated_f2_muf, 50.0))
    estimated_e_muf = (5 + 10 * zenith_factor)
    estimated_e_muf = max(3.0, min(estimated_e_muf, 25.0))
    estimated_f2_fot = estimated_f2_muf * 0.85
    estimated_e_fot = estimated_e_muf * 0.85
    return {
        'f2_muf': estimated_f2_muf, 'f2_fot': estimated_f2_fot,
        'e_muf': estimated_e_muf, 'e_fot': estimated_e_fot
    }

def calculate_absorption(frequency_mhz, zenith_angle, kp, path_mid_lat, sfi):
    """Simplified D-layer and Auroral absorption calculation."""
    absorption_db = 0
    if zenith_angle < 95:
        cos_chi = max(0, math.cos(math.radians(zenith_angle)))
        d_layer_abs = (1 + 0.01 * sfi) * (15 * cos_chi**0.8) / ((frequency_mhz + 0.6)**1.8)
        absorption_db += max(0, d_layer_abs)
    auroral_lat_threshold = 58
    if abs(path_mid_lat) > auroral_lat_threshold:
        kp_factor = max(0, kp - 1)
        lat_scale = 1 + (abs(path_mid_lat) - auroral_lat_threshold) / 15
        auroral_abs = (kp_factor**1.8 * lat_scale * 3) / (frequency_mhz**0.5)
        absorption_db += max(0, auroral_abs)
    return absorption_db

def calculate_path_loss(distance_km, frequency_mhz, muf_data, is_day, zenith_angle):
    """Calculate path loss including FSPL and simplified mode/extra losses."""
    if frequency_mhz <= 0: frequency_mhz = 1.8
    fspl_db = 20 * math.log10(max(1.0, distance_km * 1000)) + 20 * math.log10(frequency_mhz * 1e6) - 147.55
    if not isfinite(fspl_db): return {'skywave_total_loss': float('inf'), 'ground_wave_total_loss': float('inf'), 'mode': 'N/A', 'fspl': float('inf'), 'skywave_extra_loss': 0, 'ground_wave_extra_loss': 0}
    mode = "N/A"
    extra_loss_db = 50
    if frequency_mhz > muf_data['f2_muf']:
        mode = "Above F2 MUF"
        extra_loss_db = 100
    elif is_day and frequency_mhz <= muf_data['e_muf']:
        mode = "E Layer"
        hops = max(1, math.ceil(distance_km / 1500))
        extra_loss_db = 18 + hops * 6
    else:
        mode = "F Layer"
        hops = max(1, math.ceil(distance_km / 2500))
        extra_loss_db = 12 + hops * 4
    ground_wave_extra_loss_db = 10 + (distance_km / 50)
    ground_wave_total_loss_db = fspl_db + ground_wave_extra_loss_db
    skywave_base_total_loss_db = fspl_db + extra_loss_db
    return {
        'fspl': fspl_db,
        'skywave_base_total_loss': skywave_base_total_loss_db,
        'ground_wave_total_loss': ground_wave_total_loss_db,
        'mode': mode,
        'skywave_extra_loss': extra_loss_db,
        'ground_wave_extra_loss': ground_wave_extra_loss_db
    }

def get_antenna_gain(type_name, height_name):
    """Looks up antenna gain based on type and height."""
    type_params = ANTENNA_PARAMS['type'].get(type_name, ANTENNA_PARAMS['type']['Dipole'])
    height_adj = ANTENNA_PARAMS['height'].get(height_name, ANTENNA_PARAMS['height']['Medium (≈0.5λ)'])
    return type_params['base_gain_dbi'] + height_adj

def calculate_snr(tx_power_w, total_path_loss_db, tx_gain_dbi, rx_gain_dbi, noise_floor_dbm):
    """Calculate estimated SNR."""
    fade_margin = 15
    if not isfinite(total_path_loss_db) or tx_power_w <= 0:
        return -float('inf')
    tx_power_dbm = 10 * math.log10(tx_power_w * 1000)
    received_power_dbm = tx_power_dbm + tx_gain_dbi + rx_gain_dbi - total_path_loss_db - fade_margin
    snr_db = received_power_dbm - noise_floor_dbm
    return snr_db

def isfinite(f):
    """Check if a float is finite (not inf or nan)."""
    if f is None: return False
    if hasattr(f, 'isinf') and hasattr(f, 'isnan'): return not (np.isinf(f) or np.isnan(f))
    return not (math.isinf(f) or math.isnan(f))

# --- Main Simulation Logic ---
# run_hf_simulation remains the same as the previous version.
def run_hf_simulation(params):
    """Performs the HF simulation for a range of frequencies."""
    results = []
    real_time_indices = get_latest_indices()
    sfi = real_time_indices['sfi']
    ssn = real_time_indices['ssn'] # Using default/fallback SSN
    kp = real_time_indices['kp']

    lat1, lon1 = params['txLat'], params['txLon']
    lat2, lon2 = params['rxLat'], params['rxLon']
    tx_power_w = params['txPowerW']
    start_freq = params['startFreq']
    end_freq = params['endFreq']
    steps = params['freqSteps']
    tx_antenna_type = params['txAntennaType']
    tx_antenna_height = params['txAntennaHeight']
    rx_antenna_type = params['rxAntennaType']
    rx_antenna_height = params['rxAntennaHeight']
    noise_environment = params['noiseEnvironment']

    distance_km = calculate_distance(lat1, lon1, lat2, lon2)
    lon_diff = lon2 - lon1
    if lon_diff > 180: mid_lon = (lon1 + lon2 - 360) / 2
    elif lon_diff < -180: mid_lon = (lon1 + lon2 + 360) / 2
    else: mid_lon = (lon1 + lon2) / 2
    if mid_lon > 180: mid_lon -= 360
    if mid_lon < -180: mid_lon += 360
    mid_lat = (lat1 + lat2) / 2

    dt_utc = datetime.datetime.now(datetime.timezone.utc)
    zenith_angle = get_solar_zenith_angle(mid_lat, mid_lon, dt_utc)
    is_day = zenith_angle < 90
    time_of_day_str = "Day" if is_day else "Night"

    muf_data = estimate_muf_fot(lat1, lon1, lat2, lon2, dt_utc, ssn)
    noise_floor_info = calculate_noise_floor_dbm(noise_environment)
    noise_floor_dbm = noise_floor_info['noiseFloorDbm']
    noise_figure_db = noise_floor_info['noiseFigureDb']
    tx_gain_dbi = get_antenna_gain(tx_antenna_type, tx_antenna_height)
    rx_gain_dbi = get_antenna_gain(rx_antenna_type, rx_antenna_height)

    freq_increment = (end_freq - start_freq) / (steps - 1) if steps > 1 else 0

    for i in range(steps):
        freq_mhz = start_freq + i * freq_increment if steps > 1 else start_freq
        freq_mhz = max(1.8, min(30.0, freq_mhz))

        absorption_db = calculate_absorption(freq_mhz, zenith_angle, kp, mid_lat, sfi)
        path_loss_info = calculate_path_loss(distance_km, freq_mhz, muf_data, is_day, zenith_angle)

        skywave_total_loss_with_abs = path_loss_info['skywave_base_total_loss'] + absorption_db
        ground_wave_total_loss = path_loss_info['ground_wave_total_loss']

        skywave_snr = calculate_snr(tx_power_w, skywave_total_loss_with_abs, tx_gain_dbi, rx_gain_dbi, noise_floor_dbm)
        ground_wave_snr = calculate_snr(tx_power_w, ground_wave_total_loss, tx_gain_dbi, rx_gain_dbi, noise_floor_dbm)

        likelihood = "Poor"
        if freq_mhz <= muf_data['f2_muf'] and absorption_db < 30:
            if freq_mhz <= muf_data['f2_fot'] and skywave_snr > 5: likelihood = "Good"
            elif skywave_snr > -5: likelihood = "Fair"
        elif likelihood == "Poor" and ground_wave_snr > 0:
             likelihood = "Fair (GW?)"

        results.append({
            "frequencyMHz": freq_mhz, "distanceKm": distance_km, "txPowerW": tx_power_w,
            "timeOfDay": time_of_day_str, "txAntennaType": tx_antenna_type, "txAntennaHeight": tx_antenna_height,
            "rxAntennaType": rx_antenna_type, "rxAntennaHeight": rx_antenna_height,
            "noiseEnvironment": noise_environment, "txGainDbi": tx_gain_dbi, "rxGainDbi": rx_gain_dbi,
            "noiseFloorDbm": noise_floor_dbm, "noiseFigureDb": noise_figure_db,
            "fsplDb": path_loss_info['fspl'],
            "groundWaveExtraLossDb": path_loss_info['ground_wave_extra_loss'],
            "groundWaveTotalLossDb": ground_wave_total_loss, "groundWaveSNR": ground_wave_snr,
            "skywaveMode": path_loss_info['mode'],
            "skywaveExtraLossDb": path_loss_info['skywave_extra_loss'],
            "absorptionDb": absorption_db, "skywaveTotalLossDb": skywave_total_loss_with_abs,
            "skywaveSNR": skywave_snr, "skywaveLikelihood": likelihood,
            "MUF_F2": muf_data['f2_muf'], "FOT_F2": muf_data['f2_fot'], "MUF_E": muf_data['e_muf'],
            "solarZenithAngle": zenith_angle, "sfi": sfi, "ssn": ssn, "kp": kp
        })
    return results


# --- Flask Routes ---
# @app.route('/') and @app.route('/simulate', ...) remain the same
# as the previous version, including validation.
@app.route('/')
def index():
    """Serves the main HTML page."""
    return render_template('index.html')

@app.route('/simulate', methods=['POST'])
def simulate():
    """Handles simulation requests from the frontend."""
    try:
        params = request.get_json()
        if not params:
             return jsonify({"error": "Invalid JSON payload received."}), 400

        # --- Enhanced Input Validation ---
        validated_params = {}
        required_keys = ['txLat', 'txLon', 'rxLat', 'rxLon', 'txPowerW', 'startFreq', 'endFreq', 'freqSteps',
                         'txAntennaType', 'txAntennaHeight', 'rxAntennaType', 'rxAntennaHeight', 'noiseEnvironment']
        missing_keys = [key for key in required_keys if key not in params]
        if missing_keys:
             return jsonify({"error": f"Missing required parameters: {', '.join(missing_keys)}"}), 400

        # Validate numeric types and ranges
        try:
            validated_params['txLat'] = float(params['txLat'])
            if not (-90 <= validated_params['txLat'] <= 90): raise ValueError("Tx Latitude out of range (-90 to 90).")
            validated_params['txLon'] = float(params['txLon'])
            if not (-180 <= validated_params['txLon'] <= 180): raise ValueError("Tx Longitude out of range (-180 to 180).")
            validated_params['rxLat'] = float(params['rxLat'])
            if not (-90 <= validated_params['rxLat'] <= 90): raise ValueError("Rx Latitude out of range (-90 to 90).")
            validated_params['rxLon'] = float(params['rxLon'])
            if not (-180 <= validated_params['rxLon'] <= 180): raise ValueError("Rx Longitude out of range (-180 to 180).")
            validated_params['txPowerW'] = float(params['txPowerW'])
            if not (0 < validated_params['txPowerW'] <= MAX_TX_POWER): raise ValueError(f"Tx Power must be between 0 and {MAX_TX_POWER} Watts.")
            validated_params['startFreq'] = float(params['startFreq'])
            if not (1.8 <= validated_params['startFreq'] <= 30.0): raise ValueError("Start Frequency out of range (1.8 to 30.0 MHz).")
            validated_params['endFreq'] = float(params['endFreq'])
            if not (1.8 <= validated_params['endFreq'] <= 30.0): raise ValueError("End Frequency out of range (1.8 to 30.0 MHz).")
            if validated_params['endFreq'] < validated_params['startFreq']: raise ValueError("End Frequency must be >= Start Frequency.")
            validated_params['freqSteps'] = int(params['freqSteps'])
            if not (1 <= validated_params['freqSteps'] <= MAX_FREQ_STEPS): raise ValueError(f"Frequency Steps must be between 1 and {MAX_FREQ_STEPS}.")
            if validated_params['freqSteps'] > 1 and validated_params['endFreq'] == validated_params['startFreq']:
                raise ValueError("Start and End Frequency cannot be the same when Steps > 1.")
        except (ValueError, TypeError) as e:
             return jsonify({"error": f"Invalid numeric parameter: {e}"}), 400

        # Validate string selections
        validated_params['txAntennaType'] = params['txAntennaType']
        if validated_params['txAntennaType'] not in ALLOWED_ANTENNA_TYPES:
             return jsonify({"error": f"Invalid Tx Antenna Type: {validated_params['txAntennaType']}"}), 400
        validated_params['txAntennaHeight'] = params['txAntennaHeight']
        if validated_params['txAntennaHeight'] not in ALLOWED_ANTENNA_HEIGHTS:
             return jsonify({"error": f"Invalid Tx Antenna Height: {validated_params['txAntennaHeight']}"}), 400
        validated_params['rxAntennaType'] = params['rxAntennaType']
        if validated_params['rxAntennaType'] not in ALLOWED_ANTENNA_TYPES:
             return jsonify({"error": f"Invalid Rx Antenna Type: {validated_params['rxAntennaType']}"}), 400
        validated_params['rxAntennaHeight'] = params['rxAntennaHeight']
        if validated_params['rxAntennaHeight'] not in ALLOWED_ANTENNA_HEIGHTS:
             return jsonify({"error": f"Invalid Rx Antenna Height: {validated_params['rxAntennaHeight']}"}), 400
        validated_params['noiseEnvironment'] = params['noiseEnvironment']
        if validated_params['noiseEnvironment'] not in ALLOWED_NOISE_ENV:
             return jsonify({"error": f"Invalid Noise Environment: {validated_params['noiseEnvironment']}"}), 400

        # --- Validation Passed ---
        results = run_hf_simulation(validated_params)
        return jsonify(results)

    except Exception as e:
        print(f"Unhandled Exception during simulation: {e}")
        traceback.print_exc()
        return jsonify({"error": "An internal server error occurred during simulation."}), 500

# --- Main Execution ---
if __name__ == '__main__':
    # IMPORTANT: debug=True is for development only!
    # Remove or set to False for production deployment.
    # Use a proper WSGI server like Gunicorn or Waitress instead of app.run() in production.
    app.run(host='0.0.0.0', port=5000, debug=True)
