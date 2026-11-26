import csv

from ..core.source import Source, SourceInfo

# ETOPO1 (1 arc-minute) via NOAA ERDDAP, sampled every 5th point (~9 km). The window covers the
# whole map rectangle (Brazil plus the margin into its neighbours and the Atlantic).
STRIDE = 5
LAT, LON = (-37, 8), (-78, -30)
URL = (
    "https://coastwatch.pfeg.noaa.gov/erddap/griddap/etopo180.csv"
    f"?altitude%5B({LAT[0]}):{STRIDE}:({LAT[1]})%5D%5B({LON[0]}):{STRIDE}:({LON[1]})%5D"
)
FILE = f"etopo_lat{LAT[0]}_{LAT[1]}_lon{LON[0]}_{LON[1]}_stride{STRIDE}.csv"


class Etopo(Source):
    info = SourceInfo(
        id="etopo",
        title="ETOPO1, modelo global de relevo",
        publisher="NOAA National Centers for Environmental Information (via ERDDAP)",
        homepage="https://www.ncei.noaa.gov/products/etopo-global-relief-model",
        license="Domínio público (obra do governo dos EUA)",
        description="Altitude da terra e profundidade do mar, amostradas a cada ~9 km. O relevo de cada hexágono (plano, "
        "morros, serras, picos) vem da média e da rugosidade (desvio-padrão) das amostras de terra dentro dele.",
        used_for=["Relevo (morros, serras)", "Sombreado", "Profundidade do mar"],
    )

    def fetch(self, force=False):
        self.download(URL, FILE, force=force)

    def process(self):
        lat, lon, alt = [], [], []
        with open(self.raw_dir / FILE, newline="") as f:
            rows = csv.reader(f)
            next(rows), next(rows)  # header + units
            for la, lo, al in rows:
                if al == "NaN":
                    continue
                lat.append(round(float(la), 4))
                lon.append(round(float(lo), 4))
                alt.append(int(float(al)))
        return {
            "vintage": "ETOPO1, 1 minuto de arco, amostrado a cada ~9 km",
            "_files": [FILE],
            "lat": lat,
            "lon": lon,
            "alt": alt,
        }
