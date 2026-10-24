// Loaded parts per category and the parts the user picked
const loadedParts = {};
let build = {};
let currentCategory = "cpu";

// Numbers that are shown right now (used for the count-up animation)
let shownScore = 0;
let shownPrice = 0;

const MAX_RESULTS = 48;

const categoryList = document.getElementById("categoryList");
const partList = document.getElementById("partList");
const resultInfo = document.getElementById("resultInfo");
const search = document.getElementById("search");
const onlyCompatible = document.getElementById("onlyCompatible");
const sort = document.getElementById("sort");
const maxPrice = document.getElementById("maxPrice");
const resolution = document.getElementById("resolution");

/* ---------- Turning raw data into simple parts ---------- */

function getCpuScore(cpu) {
  const clock = cpu.boost_clock || cpu.core_clock || 0;
  const cores = Math.min(cpu.core_count || 1, 8); // games rarely use more than 8 cores
  const generation = cpuGenerations[cpu.microarchitecture] || 0.9;
  let score = clock * cores * generation;

  if (cpu.name.includes("X3D")) score *= 1.12; // extra cache helps a lot in games
  return Math.min(100, Math.round(score));
}

function getGpuScore(chipset) {
  // Find the longest matching name, so "RTX 4070 Ti" wins over "RTX 4070"
  let bestMatch = "";
  for (const model in gpuScores) {
    if ((chipset + " ").includes(model + " ") && model.length > bestMatch.length) {
      bestMatch = model;
    }
  }
  return bestMatch ? gpuScores[bestMatch] : 5;
}

function getFormFactor(text) {
  if (text.includes("ITX")) return "ITX";
  if (text.includes("Micro")) return "mATX";
  if (text === "ATX") return "ATX";
  return "EATX";
}

function getCaseFormFactors(type) {
  if (type.includes("Mini ITX")) return ["ITX"];
  if (type.includes("MicroATX")) return ["mATX", "ITX"];
  if (type.includes("Full Tower")) return ["EATX", "ATX", "mATX", "ITX"];
  if (type.includes("ATX")) return ["ATX", "mATX", "ITX"];
  return null; // unknown, so we skip this check
}

function convertPart(category, p) {
  const part = { name: p.name, price: p.price };

  if (category === "cpu") {
    part.socket = p.name.includes("Threadripper") ? null : cpuSockets[p.microarchitecture];
    part.tdp = p.tdp || 65;
    part.score = getCpuScore(p);
    part.details = p.core_count + " Kerne · " + (p.boost_clock || p.core_clock) + " GHz · " + part.tdp + " W";
  }

  if (category === "gpu") {
    // Some names have no model number, e.g. "Gigabyte WINDFORCE OC"
    if (!/\d/.test(p.name)) part.name = p.name + " " + p.chipset;
    part.score = getGpuScore(p.chipset);
    part.tdp = Math.round(50 + part.score * 4.5); // estimate, the dataset has no wattage
    part.details = p.chipset + " · " + p.memory + " GB";
  }

  if (category === "motherboard") {
    part.socket = p.socket;
    part.formFactor = getFormFactor(p.form_factor);
    part.ramType = socketRam[p.socket] || null;
    if (p.socket === "LGA1700") part.ramType = p.name.includes("DDR4") ? "DDR4" : "DDR5";
    part.details = p.socket + " · " + p.form_factor + (part.ramType ? " · " + part.ramType : "");
  }

  if (category === "ram") {
    if (!Array.isArray(p.speed)) return null; // very old RAM without a DDR version
    part.type = "DDR" + p.speed[0];
    part.size = p.modules[0] * p.modules[1];
    part.score = part.size >= 64 ? 100 : part.size >= 32 ? 90 : part.size >= 16 ? 65 : 30;
    if (part.type === "DDR5") part.score = Math.min(100, part.score + 10);
    part.details = part.size + " GB · " + part.type + "-" + p.speed[1];
  }

  if (category === "storage") {
    const isSsd = p.type === "SSD";
    const isNvme = isSsd && String(p.interface).includes("PCIe");
    part.type = isNvme ? "NVMe SSD" : isSsd ? "SATA SSD" : "HDD";
    part.score = isNvme ? 90 : isSsd ? 65 : 25;
    if (p.capacity >= 2000) part.score += 10;
    const size = p.capacity >= 1000 ? p.capacity / 1000 + " TB" : p.capacity + " GB";
    part.details = part.type + " · " + size;
  }

  if (category === "psu") {
    if (!p.wattage) return null;
    part.watts = p.wattage;
    part.details = p.wattage + " W" + (p.efficiency ? " · 80+ " + p.efficiency : "");
  }

  if (category === "case") {
    part.formFactors = getCaseFormFactors(p.type);
    part.details = p.type;
  }

  return part;
}

// Download one category (only the first time it is needed)
async function loadCategory(category) {
  if (loadedParts[category]) return;

  partList.innerHTML = "<div class='loader'></div>";
  resultInfo.textContent = "Teile werden geladen ...";

  const response = await fetch(DATA_URL + categories[category].file + ".json");
  const rawParts = await response.json();

  const converted = [];
  for (let i = 0; i < rawParts.length; i++) {
    const part = convertPart(category, rawParts[i]);
    if (!part) continue;
    part.rank = i; // the dataset is sorted by popularity, so a lower rank = more popular
    converted.push(part);
  }

  loadedParts[category] = converted;
}

/* ---------- Checks, score and FPS ---------- */

function getPower(pc) {
  let watts = 80; // mainboard, RAM, fans, drives
  if (pc.cpu) watts += pc.cpu.tdp;
  if (pc.gpu) watts += pc.gpu.tdp;
  return watts;
}

// Check if the parts fit together
function getErrors(pc) {
  const errors = [];
  const { cpu, motherboard, ram, psu } = pc;
  const pcCase = pc.case;

  if (cpu && motherboard && cpu.socket && cpu.socket !== motherboard.socket) {
    errors.push("Der Prozessor (" + cpu.socket + ") passt nicht auf das Mainboard (" + motherboard.socket + ").");
  }
  if (ram && motherboard && motherboard.ramType && ram.type !== motherboard.ramType) {
    errors.push("Das Mainboard braucht " + motherboard.ramType + ", du hast " + ram.type + " gewählt.");
  }
  if (motherboard && pcCase && pcCase.formFactors && !pcCase.formFactors.includes(motherboard.formFactor)) {
    errors.push("Das " + motherboard.formFactor + "-Mainboard passt nicht in dieses Gehäuse.");
  }
  if (psu && getPower(pc) > psu.watts) {
    errors.push("Das Netzteil ist zu schwach. Dein PC braucht ca. " + getPower(pc) + " W.");
  }

  return errors;
}

// A part fits if adding it does not create new errors
function fitsBuild(category, part) {
  const withoutPart = Object.assign({}, build);
  delete withoutPart[category];

  const withPart = Object.assign({}, withoutPart);
  withPart[category] = part;

  return getErrors(withPart).length === getErrors(withoutPart).length;
}

function getTips() {
  const tips = [];
  const { cpu, gpu, ram, storage, psu } = build;

  if (cpu && gpu && cpu.score - gpu.score > 35) {
    tips.push("Deine Grafikkarte bremst den PC. Eine stärkere GPU bringt dir am meisten FPS.");
  }
  if (cpu && gpu && gpu.score - cpu.score > 35) {
    tips.push("Dein Prozessor ist zu schwach für die Grafikkarte. Ein besserer CPU lohnt sich.");
  }
  if (ram && ram.size < 16) {
    tips.push("Weniger als 16 GB RAM ist für Spiele zu wenig.");
  }
  if (storage && storage.type === "HDD") {
    tips.push("Eine SSD macht Ladezeiten und Windows viel schneller als eine HDD.");
  }
  if (psu && getPower(build) <= psu.watts && getPower(build) * 1.3 > psu.watts) {
    tips.push("Das Netzteil läuft fast am Limit. Etwas mehr Watt wären sicherer.");
  }

  return tips;
}

// Overall score from 0 to 100
function getScore() {
  const { cpu, gpu, ram, storage } = build;
  if (!cpu || !gpu || !ram || !storage) return null;

  let score = cpu.score * 0.35 + gpu.score * 0.45 + ram.score * 0.1 + storage.score * 0.1;
  score -= getErrors(build).length * 15;

  return Math.max(0, Math.min(100, Math.round(score)));
}

// Estimated FPS: the weaker part (CPU or GPU) decides
function getFps(game) {
  const factor = resolutions[resolution.value];
  const cpuLimit = game.cpuFps * (build.cpu.score / 100);
  const gpuLimit = game.gpuFps * (build.gpu.score / 100) * factor;
  let fps = Math.min(cpuLimit, gpuLimit);

  if (build.ram && build.ram.size < 16) fps *= 0.85;
  return Math.round(fps);
}

// Performance number used for sorting (power supplies have no score, so we use watts)
function getPerformance(part) {
  return part.score || part.watts || 0;
}

// Sort the parts like the user chose in the dropdown
function sortParts(list) {
  list.sort(function (a, b) {
    // Parts without a price always go to the end
    if (!a.price !== !b.price) return a.price ? -1 : 1;

    if (sort.value === "priceLow") return a.price - b.price;
    if (sort.value === "priceHigh") return b.price - a.price;
    if (sort.value === "performance") return getPerformance(b) - getPerformance(a);
    if (sort.value === "value") return getPerformance(b) / b.price - getPerformance(a) / a.price;
    return a.rank - b.rank; // popular
  });
}

/* ---------- Animations ---------- */

// Count a number smoothly from "from" to "to"
function animateNumber(from, to, onUpdate) {
  const start = performance.now();
  const duration = 800;

  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // fast at the start, slow at the end
    onUpdate(from + (to - from) * eased);
    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

// Typewriter effect in the hero title
const typedWords = ["Gaming-PC", "Traum-PC", "Streaming-PC", "Budget-PC"];
let wordIndex = 0;
let letterIndex = 0;
let deleting = false;

function typeWriter() {
  const word = typedWords[wordIndex];
  letterIndex += deleting ? -1 : 1;
  document.getElementById("typed").textContent = word.slice(0, letterIndex);

  let delay = deleting ? 50 : 110;

  if (!deleting && letterIndex === word.length) {
    deleting = true;
    delay = 1800; // wait before deleting
  } else if (deleting && letterIndex === 0) {
    deleting = false;
    wordIndex = (wordIndex + 1) % typedWords.length;
    delay = 300;
  }

  setTimeout(typeWriter, delay);
}

// Count up the numbers in the hero
function startCounters() {
  const counters = document.querySelectorAll(".count");

  for (const counter of counters) {
    const target = Number(counter.dataset.count);
    animateNumber(0, target, function (value) {
      counter.textContent = Math.round(value).toLocaleString("de-DE") + (target > 1000 ? "+" : "");
    });
  }
}

function getScoreColor(score) {
  if (score >= 70) return "#10b981";
  if (score >= 40) return "#f59e0b";
  return "#ef4444";
}

/* ---------- Showing everything on the page ---------- */

function formatPrice(price) {
  return price ? "$" + price.toFixed(2) : "Preis unbekannt";
}

// Left side: categories with the chosen part.
// "animate" is only true when the page opens.
function showCategories(animate = false) {
  categoryList.innerHTML = "";
  let index = 0;

  for (const category in categories) {
    const info = categories[category];

    const button = document.createElement("button");
    button.className = "category";
    if (animate) button.style.animationDelay = index * 0.06 + "s";
    else button.classList.add("no-animation");
    if (category === currentCategory) button.classList.add("active");
    if (build[category]) button.classList.add("done");

    const icon = document.createElement("div");
    icon.className = "icon";
    icon.style.backgroundColor = info.color;
    icon.textContent = info.icon;

    const text = document.createElement("div");
    text.className = "category-text";

    const label = document.createElement("b");
    label.textContent = info.label;

    const chosen = document.createElement("span");
    chosen.textContent = build[category] ? build[category].name : "Noch nicht gewählt";

    text.append(label, chosen);
    button.append(icon, text);

    if (build[category]) {
      const check = document.createElement("div");
      check.className = "check";
      check.textContent = "✓";
      button.appendChild(check);
    }

    button.addEventListener("click", function () {
      openCategory(category);
    });

    categoryList.appendChild(button);
    index++;
  }

  const count = Object.keys(build).length;
  document.getElementById("progressText").textContent = count + " von 7 Teilen";
  document.getElementById("progressFill").style.width = (count / 7) * 100 + "%";
}

// Middle: the parts you can pick.
// "animate" is false when we only refresh the list after a click.
function showParts(animate = true) {
  const all = loadedParts[currentCategory];
  if (!all) return;

  const searchWords = search.value.toLowerCase().split(" ");
  const priceLimit = Number(maxPrice.value);
  const matches = [];

  for (const part of all) {
    const text = (part.name + " " + part.details).toLowerCase();
    const found = searchWords.every(function (word) {
      return text.includes(word);
    });
    if (!found) continue;
    if (priceLimit && (!part.price || part.price > priceLimit)) continue;
    if (onlyCompatible.checked && !fitsBuild(currentCategory, part)) continue;
    matches.push(part);
  }

  sortParts(matches);
  partList.innerHTML = "";

  const shown = matches.slice(0, MAX_RESULTS);

  for (let i = 0; i < shown.length; i++) {
    const part = shown[i];

    const card = document.createElement("div");
    card.className = "part";
    card.style.animationDelay = i * 0.03 + "s"; // cards appear one after another

    if (build[currentCategory] === part) card.classList.add("selected");
    else if (!animate) card.classList.add("no-animation");
    if (!fitsBuild(currentCategory, part)) card.classList.add("warning");

    const name = document.createElement("h3");
    name.textContent = part.name;

    const details = document.createElement("p");
    details.className = "details";
    details.textContent = part.details;

    const bottom = document.createElement("div");
    bottom.className = "card-bottom";

    const price = document.createElement("p");
    price.className = "price";
    price.textContent = formatPrice(part.price);
    bottom.appendChild(price);

    if (part.score !== undefined) {
      const badge = document.createElement("span");
      badge.className = "badge " + (part.score >= 70 ? "high" : part.score >= 40 ? "mid" : "low");
      badge.textContent = "Leistung " + part.score;
      bottom.appendChild(badge);
    }

    card.append(name, details, bottom);
    card.addEventListener("click", function () {
      selectPart(part);
    });

    partList.appendChild(card);
  }

  resultInfo.textContent = matches.length > MAX_RESULTS
    ? MAX_RESULTS + " von " + matches.length + " Treffern. Suche genauer, um mehr zu finden."
    : matches.length + " Treffer";
}

// Right side: score, tips and FPS
function showSummary() {
  // Price counts up to the new total
  let total = 0;
  for (const category in build) {
    total += build[category].price || 0;
  }
  animateNumber(shownPrice, total, function (value) {
    document.getElementById("totalPrice").textContent = "$" + Math.round(value);
  });
  shownPrice = total;

  document.getElementById("power").textContent = getPower(build) + " W";

  // Score ring fills up and changes color
  const score = getScore();
  const scoreText = document.getElementById("score");
  const ring = document.getElementById("scoreRing");

  if (score === null) {
    scoreText.textContent = "-";
    ring.style.background = "conic-gradient(#e6e8f2 0deg, #e6e8f2 0deg)";
    shownScore = 0;
  } else {
    const color = getScoreColor(score);
    scoreText.style.color = color;
    animateNumber(shownScore, score, function (value) {
      scoreText.textContent = Math.round(value);
      ring.style.background = "conic-gradient(" + color + " " + value * 3.6 + "deg, #e6e8f2 0deg)";
    });
    shownScore = score;
  }

  // Errors and tips slide in one after another
  const messages = document.getElementById("messages");
  messages.innerHTML = "";
  let messageCount = 0;

  function addMessage(type, text) {
    const p = document.createElement("p");
    p.className = "message " + type;
    p.style.animationDelay = messageCount * 0.1 + "s";
    p.textContent = text;
    messages.appendChild(p);
    messageCount++;
  }

  const errors = getErrors(build);
  for (const error of errors) addMessage("error", error);
  for (const tip of getTips()) addMessage("tip", tip);

  const missing = 7 - Object.keys(build).length;
  if (missing === 0 && errors.length === 0) {
    addMessage("ok", "Alle Teile passen zusammen!");
  }

  // FPS bars
  const fpsList = document.getElementById("fpsList");
  fpsList.innerHTML = "";

  if (!build.cpu || !build.gpu) {
    fpsList.innerHTML = "<p class='hint'>Wähle Prozessor und Grafikkarte, um FPS zu sehen.</p>";
    return;
  }

  for (let i = 0; i < games.length; i++) {
    const game = games[i];
    const fps = getFps(game);
    const color = fps >= 100 ? "good" : fps >= 60 ? "medium" : "bad";

    const row = document.createElement("div");
    row.className = "fps-row";
    row.style.animationDelay = i * 0.08 + "s";
    row.innerHTML =
      "<div class='fps-label'><span>" + game.name + "</span><b>" + fps + " FPS</b></div>" +
      "<div class='fps-bar'><div class='fps-fill " + color + "'></div></div>";
    fpsList.appendChild(row);

    // Set the width a moment later so the bar grows
    const fill = row.querySelector(".fps-fill");
    setTimeout(function () {
      fill.style.width = Math.min(100, (fps / 240) * 100) + "%";
    }, 100 + i * 80);
  }
}

/* ---------- Actions ---------- */

async function openCategory(category) {
  currentCategory = category;
  search.value = "";

  // The color of the category is used for the card borders in style.css
  document.getElementById("shop").style.setProperty("--category-color", categories[category].color);

  const title = document.getElementById("shopTitle");
  title.textContent = categories[category].label + " auswählen";
  title.style.animation = "none";
  title.offsetHeight; // restart the title animation
  title.style.animation = "";

  showCategories();

  try {
    await loadCategory(category);
    showParts();
  } catch (error) {
    partList.innerHTML = "<p class='message error'>Die Teile konnten nicht geladen werden. Prüfe deine Internetverbindung.</p>";
    resultInfo.textContent = "";
  }
}

function selectPart(part) {
  // Click a selected part again to remove it
  if (build[currentCategory] === part) {
    delete build[currentCategory];
  } else {
    build[currentCategory] = part;
  }
  showCategories();
  showParts(false);
  showSummary();
}

search.addEventListener("input", function () { showParts(); });
onlyCompatible.addEventListener("change", function () { showParts(); });
sort.addEventListener("change", function () { showParts(); });
maxPrice.addEventListener("input", function () { showParts(); });
resolution.addEventListener("change", showSummary);

document.getElementById("resetBtn").addEventListener("click", function () {
  build = {};
  showCategories();
  showParts();
  showSummary();
});

// Start
typeWriter();
startCounters();
openCategory("cpu");
showCategories(true);
showSummary();