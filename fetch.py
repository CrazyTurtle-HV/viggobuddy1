#!/usr/bin/env python3
"""
Haalt de vluchten van de ingestelde maatschappijen op en schrijft docs/data.json.

Draait in GitHub Actions. Verwacht twee secrets:
    SCHIPHOL_CLIENT_ID
    SCHIPHOL_CLIENT_SECRET
"""

AIRLINES  = ["HV", "AY", "UX"]
AUDIENCE  = "https://api.schiphol.nl/public"
TOKEN_URL = "https://api.auth.schiphol.nl/oauth/token"
BASE      = "https://api.schiphol.nl/public/public-flights/v4"
MAX_PAGES = 25

import json, os, sys, time, datetime, urllib.parse, urllib.request, urllib.error

CID = os.environ.get("SCHIPHOL_CLIENT_ID", "").strip()
SEC = os.environ.get("SCHIPHOL_CLIENT_SECRET", "").strip()


def fail(msg):
    print("\n!! " + msg + "\n")
    sys.exit(1)


def get_token():
    if not CID or not SEC:
        fail("SCHIPHOL_CLIENT_ID of SCHIPHOL_CLIENT_SECRET ontbreekt in de repo-secrets.")
    print(f"client_id eindigt op ...{CID[-6:]}  ·  secret is {len(SEC)} tekens lang")
    body = urllib.parse.urlencode({
        "grant_type": "client_credentials",
        "client_id": CID, "client_secret": SEC, "audience": AUDIENCE}).encode()
    req = urllib.request.Request(TOKEN_URL, data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            j = json.load(r)
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = e.read().decode()[:400]
        except Exception:
            pass
        fail(f"Token ophalen mislukt — HTTP {e.code}\n   {detail}\n"
             "   access_denied = verkeerd secret, of te veel aanvragen achter elkaar.\n"
             "   invalid_client = verkeerd client_id of secret.")
    print(f"token opgehaald, {j.get('expires_in', '?')} seconden geldig")
    return j["access_token"]


def call(tok, path, params, version_header=True):
    """Doet één verzoek en geeft (status, data_of_tekst) terug."""
    url = BASE + path + ("?" + urllib.parse.urlencode(params) if params else "")
    head = {"Accept": "application/json", "Authorization": "Bearer " + tok}
    if version_header:
        head["ResourceVersion"] = "v4"
    req = urllib.request.Request(url, headers=head)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            if r.status == 204:
                return 204, {}
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        try:
            return e.code, e.read().decode()[:500]
        except Exception:
            return e.code, ""


def probe(tok):
    """Wordt gedraaid zodra een verzoek faalt, om te zien waar het aan ligt."""
    print("\n--- diagnose ---")
    tests = [
        ("vluchten, met ResourceVersion",    "/flights",  {"page": 0}, True),
        ("vluchten, zonder ResourceVersion", "/flights",  {"page": 0}, False),
        ("vluchten met airline=HV",          "/flights",  {"page": 0, "airline": "HV"}, True),
        ("maatschappijen",                   "/airlines", {"page": 0}, True),
        ("bestemmingen",                     "/destinations", {"page": 0}, True),
    ]
    for naam, path, params, vh in tests:
        code, data = call(tok, path, params, vh)
        extra = "" if isinstance(data, dict) else f" — {str(data)[:160]}"
        print(f"  {code}  {naam}{extra}")
        time.sleep(0.4)
    print("--- einde diagnose ---")
    print("\nAlles 403  → je abonnement staat aan Schiphol-kant niet open.")
    print("Alleen /flights 403 → het ligt aan die endpoint of aan een parameter.")
    print("200 zonder ResourceVersion → die header moet juist weg.\n")


def slim(f):
    return {
        "flightName": f.get("flightName"),
        "dir": f.get("flightDirection"),
        "scheduleDateTime": f.get("scheduleDateTime"),
        "estimatedLandingTime": f.get("estimatedLandingTime"),
        "actualLandingTime": f.get("actualLandingTime"),
        "publicEstimatedOffBlockTime": f.get("publicEstimatedOffBlockTime"),
        "actualOffBlockTime": f.get("actualOffBlockTime"),
        "gate": f.get("gate"), "pier": f.get("pier"), "terminal": f.get("terminal"),
        "belts": (f.get("baggageClaim") or {}).get("belts") or [],
        "expectedTimeOnBelt": f.get("expectedTimeOnBelt"),
        "expectedTimeGateOpen": f.get("expectedTimeGateOpen"),
        "expectedTimeBoarding": f.get("expectedTimeBoarding"),
        "expectedTimeGateClosing": f.get("expectedTimeGateClosing"),
        "route": (f.get("route") or {}).get("destinations") or [],
        "eu": (f.get("route") or {}).get("eu"),
        "states": (f.get("publicFlightState") or {}).get("flightStates") or [],
        "ac": (f.get("aircraftType") or {}).get("iataMain"),
        "reg": f.get("aircraftRegistration"),
    }


def main():
    tok = get_token()
    today = datetime.date.today().isoformat()
    flights, first_error = [], None

    for airline in AIRLINES:
        for page in range(MAX_PAGES):
            code, data = call(tok, "/flights",
                {"airline": airline, "scheduleDate": today,
                 "page": page, "sort": "+scheduleTime"})
            if code == 204 or (code == 200 and not (data.get("flights") or [])):
                break
            if code != 200:
                print(f"!! HTTP {code} bij {airline} pagina {page} — {str(data)[:200]}")
                first_error = code
                break
            flights += [slim(x) for x in data["flights"]]
            time.sleep(0.25)
        print(f"{airline}: {len([f for f in flights])} vluchten totaal tot nu toe")
        if first_error:
            break

    if first_error:
        probe(tok)
        fail(f"Ophalen gestopt na HTTP {first_error}. Zie de diagnose hierboven.")

    flights.sort(key=lambda f: f.get("scheduleDateTime") or "")
    payload = {"updated": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
               "date": today, "airlines": AIRLINES, "flights": flights}
    os.makedirs("docs", exist_ok=True)
    with open("docs/data.json", "w") as fh:
        json.dump(payload, fh, separators=(",", ":"))
    print(f"\nKlaar — {len(flights)} vluchten weggeschreven naar docs/data.json")


if __name__ == "__main__":
    main()
