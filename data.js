// Where the parts come from: an open dataset with thousands of real PC parts
// (scraped from PCPartPicker), loaded live from GitHub through the jsDelivr CDN.
const DATA_URL = "https://cdn.jsdelivr.net/gh/docyx/pc-part-dataset@main/data/json/";

// Each category: German label, file name in the dataset, short icon text and color
const categories = {
  cpu: { label: "Prozessor", file: "cpu", icon: "CPU", color: "#4f46e5" },
  gpu: { label: "Grafikkarte", file: "video-card", icon: "GPU", color: "#10b981" },
  motherboard: { label: "Mainboard", file: "motherboard", icon: "MB", color: "#f59e0b" },
  ram: { label: "Arbeitsspeicher", file: "memory", icon: "RAM", color: "#ec4899" },
  storage: { label: "Speicher", file: "internal-hard-drive", icon: "SSD", color: "#06b6d4" },
  psu: { label: "Netzteil", file: "power-supply", icon: "PSU", color: "#ef4444" },
  case: { label: "Gehäuse", file: "case", icon: "CASE", color: "#8b5cf6" }
};

// Graphics card performance (best card = 100).
// The dataset has no benchmarks, so these rough ratings are added by hand.
const gpuScores = {
  "RTX 5090": 100, "RTX 4090": 88, "RTX 5080": 75, "RTX 4080 SUPER": 72, "RTX 4080": 70,
  "RX 7900 XTX": 70, "RTX 5070 Ti": 66, "RX 9070 XT": 66, "RTX 4070 Ti SUPER": 62,
  "RX 9070": 60, "RX 7900 XT": 60, "RTX 3090 Ti": 58, "RTX 4070 Ti": 57, "RTX 5070": 55,
  "RTX 4070 SUPER": 54, "RTX 3090": 52, "RX 7800 XT": 52, "RX 6950 XT": 52, "RTX 3080 Ti": 51,
  "RX 6900 XT": 49, "RTX 3080": 48, "RTX 4070": 47, "RX 6800 XT": 47, "RX 7700 XT": 45,
  "RTX 5060 Ti": 42, "RX 9060 XT": 42, "RX 6800": 41, "RTX 3070 Ti": 40, "RTX 4060 Ti": 39,
  "RTX 3070": 38, "RX 6750 XT": 37, "RTX 2080 Ti": 37, "RTX 5060": 36, "RX 6700 XT": 35,
  "Arc B580": 34, "RTX 3060 Ti": 34, "RX 7600 XT": 32, "RTX 4060": 31, "RX 7600": 30,
  "RX 6650 XT": 30, "RTX 2080 SUPER": 30, "RTX 2080": 28, "RX 6600 XT": 28, "Arc A770": 28,
  "Arc B570": 28, "RTX 5050": 26, "RTX 2070 SUPER": 26, "RTX 3060": 26, "Arc A750": 26,
  "RX 6600": 25, "RX 5700 XT": 25, "RTX 2070": 23, "RX 5700": 22, "RTX 2060 SUPER": 22,
  "GTX 1080 Ti": 22, "RTX 2060": 20, "GTX 1080": 18, "GTX 1070 Ti": 18, "RX 5600 XT": 18,
  "RTX 3050": 17, "GTX 1660 SUPER": 17, "GTX 1660 Ti": 17, "RX VEGA 64": 17, "GTX 1660": 15,
  "GTX 1070": 15, "RX VEGA 56": 15, "GTX 1650 SUPER": 13, "RX 5500 XT": 12, "GTX 1060": 12,
  "RX 590": 12, "GTX 980 Ti": 12, "RX 580": 11, "GTX 1650": 10, "RX 6500 XT": 10, "RX 480": 10,
  "RX 570": 9, "GTX 980": 9, "GTX 970": 8, "RX 6400": 7, "GTX 1050 Ti": 6, "Arc A380": 6,
  "GTX 960": 5, "GT 1030": 2, "GT 730": 1, "GT 710": 1
};

// How fast each CPU generation is per GHz and core (newer = higher)
const cpuGenerations = {
  "Zen 5": 2.35, "Zen 4": 2.2, "Zen 3": 1.85, "Zen 2": 1.55, "Zen+": 1.3, "Zen": 1.2,
  "Arrow Lake": 2.1, "Raptor Lake Refresh": 2.1, "Raptor Lake": 2.05, "Alder Lake": 2.0,
  "Rocket Lake": 1.7, "Comet Lake": 1.6, "Coffee Lake Refresh": 1.5, "Coffee Lake": 1.45,
  "Kaby Lake": 1.4, "Skylake": 1.35
};

// CPU socket for each generation
const cpuSockets = {
  "Zen 5": "AM5", "Zen 4": "AM5", "Zen 3": "AM4", "Zen 2": "AM4", "Zen+": "AM4", "Zen": "AM4",
  "Arrow Lake": "LGA1851", "Raptor Lake Refresh": "LGA1700", "Raptor Lake": "LGA1700",
  "Alder Lake": "LGA1700", "Rocket Lake": "LGA1200", "Comet Lake": "LGA1200",
  "Coffee Lake Refresh": "LGA1151", "Coffee Lake": "LGA1151", "Kaby Lake": "LGA1151",
  "Skylake": "LGA1151"
};

// Which RAM type a mainboard socket uses
const socketRam = {
  "AM5": "DDR5", "LGA1851": "DDR5", "AM4": "DDR4", "LGA1200": "DDR4",
  "LGA1151": "DDR4", "LGA2066": "DDR4", "LGA1150": "DDR3", "LGA1155": "DDR3"
};

// cpuFps = FPS with the best CPU, gpuFps = FPS with the best GPU at 1080p
const games = [
  { name: "Valorant", cpuFps: 600, gpuFps: 700 },
  { name: "Counter-Strike 2", cpuFps: 450, gpuFps: 500 },
  { name: "Fortnite (Hoch)", cpuFps: 300, gpuFps: 280 },
  { name: "Call of Duty: Warzone", cpuFps: 220, gpuFps: 200 },
  { name: "Red Dead Redemption 2", cpuFps: 160, gpuFps: 140 },
  { name: "Cyberpunk 2077 (Ultra)", cpuFps: 180, gpuFps: 150 }
];

// Higher resolutions need more power from the graphics card
const resolutions = {
  "1080p": 1,
  "1440p": 0.72,
  "4K": 0.42
};