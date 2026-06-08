// HistoryDex — Image Review App (vanilla JS, pas de build).
// Trois colonnes : sidebar liste · éditeur image (source + crop + aperçus
// multiples + toolbar) · panneau métadonnées (édition textes + carte Leaflet
// pour lat/lon/whereRadiusKm).
//
// Chargé en module pour pouvoir utiliser globalThis.L (Leaflet est déjà sur
// window grâce au <script> CDN dans index.html).

const TARGET_RATIO = 1.37; // paysage HDCard zoom

// Canvases d'aperçu à l'écran (CSS) : mêmes valeurs que dans style.css.
const PREVIEWS = {
  zoom:  { w: 224, h: 164 }, // ratio 1.366, simule HDCard contain
  mini:  { w: 130, h: 110 }, // ratio 1.181, simule HDMiniCard cover
  thumb: { w: 80,  h: 80 },  // ratio 1.0, simule CardThumb cover
};

const MIN_CROP_PX = 40;

const els = {
  list: document.getElementById("card-list"),
  filterPending: document.getElementById("filter-pending"),
  filterReviewed: document.getElementById("filter-reviewed"),
  filterStatus: document.getElementById("filter-status"),
  progress: document.getElementById("progress-count"),
  title: document.getElementById("card-title"),
  meta: document.getElementById("card-meta"),
  sourceWrap: document.getElementById("source-wrap"),
  sourceCanvas: document.getElementById("source-canvas"),
  cropRect: document.getElementById("crop-rect"),
  cropDims: document.getElementById("crop-dims"),
  previewZoom: document.getElementById("preview-zoom"),
  previewMini: document.getElementById("preview-mini"),
  previewThumb: document.getElementById("preview-thumb"),
  cropInfo: document.getElementById("crop-info"),
  pushBanner: document.getElementById("push-banner"),
  bannerClose: document.getElementById("btn-banner-close"),
  // Toolbar
  btnPrev: document.getElementById("btn-prev"),
  btnNext: document.getElementById("btn-next"),
  btnCenter: document.getElementById("btn-center"),
  btnReset: document.getElementById("btn-reset"),
  btnSaveManual: document.getElementById("btn-save-manual"),
  btnApprove: document.getElementById("btn-approve"),
  btnUnapprove: document.getElementById("btn-unapprove"),
  btnOpenUpload: document.getElementById("btn-open-upload"),
  // Push to DB modal
  btnPushDb: document.getElementById("btn-push-db"),
  pushModal: document.getElementById("push-modal"),
  btnClosePush: document.getElementById("btn-close-push"),
  btnPushCancel: document.getElementById("btn-push-cancel"),
  btnPushConfirm: document.getElementById("btn-push-confirm"),
  pushConfirmCheck: document.getElementById("push-confirm-check"),
  pushStepDiff: document.getElementById("push-step-diff"),
  pushStepProgress: document.getElementById("push-step-progress"),
  pushDiffPreview: document.getElementById("push-diff-preview"),
  pushBarFill: document.getElementById("push-bar-fill"),
  pushProgressTitle: document.getElementById("push-progress-title"),
  pushProgressText: document.getElementById("push-progress-text"),
  pushProgressErrors: document.getElementById("push-progress-errors"),
  toast: document.getElementById("toast"),
  // Métadonnées
  metaForm: document.getElementById("meta-form"),
  metaEmpty: document.getElementById("meta-empty"),
  btnSaveMeta: document.getElementById("btn-save-meta"),
  // Modal upload
  uploadModal: document.getElementById("upload-modal"),
  btnCloseUpload: document.getElementById("btn-close-upload"),
  btnUploadCancel: document.getElementById("btn-upload-cancel"),
  btnUploadGo: document.getElementById("btn-upload-go"),
  uploadFile: document.getElementById("upload-file"),
  uploadAttribution: document.getElementById("upload-attribution"),
  uploadSourcePageUrl: document.getElementById("upload-sourcePageUrl"),
  dropZone: document.getElementById("drop-zone"),
  uploadPreview: document.getElementById("upload-preview"),
  uploadPreviewImg: document.getElementById("upload-preview-img"),
  uploadPreviewName: document.getElementById("upload-preview-name"),
};

// Set CSS sizes also on the canvas backing buffers (HiDPI agnostic).
els.previewZoom.width = PREVIEWS.zoom.w;
els.previewZoom.height = PREVIEWS.zoom.h;
els.previewMini.width = PREVIEWS.mini.w;
els.previewMini.height = PREVIEWS.mini.h;
els.previewThumb.width = PREVIEWS.thumb.w;
els.previewThumb.height = PREVIEWS.thumb.h;

// État global
let cards = [];
let activeDexNum = null;
let activeDetail = null;
let sourceImage = null;
let sourceNaturalSize = { width: 0, height: 0 };
let displayedSize = { width: 0, height: 0 };
let cropPx = null; // crop courant en pixels source
let cropDirty = false; // true dès que l'utilisateur touche au rectangle
let dragging = null;

// État édition métadonnées
let metaPending = {}; // { fieldId: newValue } pour les champs modifiés
let map = null;
let mapMarker = null;
let mapCircle = null;
let pendingUploadFile = null;

// ───── Boot ───────────────────────────────────────────────────────────
async function boot() {
  await fetch("/api/health").then((r) => r.json());
  await loadCards();
  if (cards.length > 0) {
    const first = pickInitial();
    if (first) selectCard(first.dexNum);
  }
  bindKeys();
  bindFilters();
  bindToolbar();
  bindCropInteraction();
  bindMetaForm();
  bindUploadModal();
  bindPushModal();
  els.bannerClose.addEventListener("click", () => {
    els.pushBanner.classList.add("hidden");
  });
}

// ───── Push to DB modal ─────────────────────────────────────────────────
//
// Workflow :
//   1. Clic "Push to DB" → ouvre le modal, lance dry-run automatiquement
//   2. Affiche le diff dans <pre>
//   3. Utilisateur coche "Je confirme" → bouton Confirmer activé
//   4. Clic Confirmer → POST /api/push-db { dryRun: false } → 200 immédiat
//   5. Polling /api/push-db/progress toutes les 700ms jusqu'à phase=done|error
//   6. Affichage final + bouton Fermer

let pushPollTimer = null;

function bindPushModal() {
  if (!els.btnPushDb) return;
  els.btnPushDb.addEventListener("click", openPushModal);
  els.btnClosePush.addEventListener("click", closePushModal);
  els.btnPushCancel.addEventListener("click", closePushModal);
  els.pushConfirmCheck.addEventListener("change", () => {
    els.btnPushConfirm.disabled = !els.pushConfirmCheck.checked;
  });
  els.btnPushConfirm.addEventListener("click", confirmPush);
}

async function openPushModal() {
  // Reset state
  els.pushConfirmCheck.checked = false;
  els.btnPushConfirm.disabled = true;
  els.pushStepDiff.classList.remove("hidden");
  els.pushStepProgress.classList.add("hidden");
  els.pushDiffPreview.textContent = "Calcul du diff…";
  els.pushProgressErrors.classList.add("hidden");
  els.pushProgressErrors.textContent = "";
  els.pushBarFill.style.width = "0%";
  els.pushProgressTitle.textContent = "Push en cours…";
  els.btnPushCancel.textContent = "Annuler";
  els.pushModal.classList.remove("hidden");

  try {
    const res = await fetch("/api/push-db", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dryRun: true }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      els.pushDiffPreview.textContent = `✗ Erreur dry-run :\n${data.error ?? "inconnue"}${data.detail ? `\n${data.detail}` : ""}`;
      return;
    }
    const data = await res.json();
    renderDiffPreview(data.diff);
  } catch (err) {
    els.pushDiffPreview.textContent = `✗ Erreur réseau : ${err.message}`;
  }
}

function renderDiffPreview(diff) {
  const lines = [];
  lines.push(`Cartes à créer       : ${diff.created}${diff.newDexNums.length > 0 ? ` (${diff.newDexNums.slice(0, 8).join(", ")}${diff.newDexNums.length > 8 ? "…" : ""})` : ""}`);
  lines.push(`Mises à jour texte   : ${diff.updatedText}${diff.updatedDexNums.length > 0 ? ` (${diff.updatedDexNums.slice(0, 5).map((u) => `${u.dexNum} v${u.from ?? "—"}→v${u.to}`).join(", ")}${diff.updatedDexNums.length > 5 ? "…" : ""})` : ""}`);
  lines.push(`Images à uploader    : ${diff.uploadedImage}${diff.imageDexNums.length > 0 ? ` (${diff.imageDexNums.slice(0, 8).join(", ")}${diff.imageDexNums.length > 8 ? "…" : ""})` : ""}`);
  lines.push(`Cartes inchangées    : ${diff.unchanged} (skip)`);
  if (diff.countryFallbacks.length > 0) {
    lines.push("");
    lines.push(`⚠️  ${diff.countryFallbacks.length} country fallback(s) :`);
    for (const c of diff.countryFallbacks.slice(0, 5)) lines.push(`  ${c}`);
  }
  if (diff.warnings && diff.warnings.length > 0) {
    lines.push("");
    lines.push(`⚠️  ${diff.warnings.length} avertissement(s) :`);
    for (const w of diff.warnings.slice(0, 8)) lines.push(`  ${w}`);
    if (diff.warnings.length > 8) lines.push(`  …et ${diff.warnings.length - 8} de plus`);
  }
  const total = diff.created + diff.updatedText + diff.uploadedImage;
  if (total === 0) {
    lines.push("");
    lines.push("✓ Aucun changement à pousser, tout est à jour.");
    els.btnPushConfirm.disabled = true;
    els.pushConfirmCheck.disabled = true;
  } else {
    els.pushConfirmCheck.disabled = false;
  }
  els.pushDiffPreview.textContent = lines.join("\n");
}

async function confirmPush() {
  if (!els.pushConfirmCheck.checked) return;
  els.btnPushConfirm.disabled = true;
  els.btnPushCancel.disabled = true;
  els.pushStepDiff.classList.add("hidden");
  els.pushStepProgress.classList.remove("hidden");
  els.pushProgressText.textContent = "Démarrage…";

  try {
    const res = await fetch("/api/push-db", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dryRun: false }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      els.pushProgressText.textContent = `✗ Échec démarrage : ${data.error ?? res.statusText}`;
      els.btnPushCancel.disabled = false;
      return;
    }
  } catch (err) {
    els.pushProgressText.textContent = `✗ Erreur réseau : ${err.message}`;
    els.btnPushCancel.disabled = false;
    return;
  }

  // Polling
  pushPollTimer = setInterval(pollPushProgress, 700);
  await pollPushProgress();
}

async function pollPushProgress() {
  try {
    const res = await fetch("/api/push-db/progress");
    const p = await res.json();
    const pct = p.total > 0 ? Math.round((p.processed / p.total) * 100) : 0;
    els.pushBarFill.style.width = `${pct}%`;
    let phaseLabel = "—";
    switch (p.phase) {
      case "diff": phaseLabel = "Calcul du diff"; break;
      case "text": phaseLabel = "Push texte"; break;
      case "image": phaseLabel = `Upload images${p.lastDexNum ? ` (${p.lastDexNum})` : ""}`; break;
      case "done": phaseLabel = "Terminé"; break;
      case "error": phaseLabel = "Erreur"; break;
    }
    const errSuffix = p.errors && p.errors.length > 0 ? ` · ${p.errors.length} erreur(s)` : "";
    els.pushProgressText.textContent = `${phaseLabel} — ${p.processed} / ${p.total} (${pct}%)${errSuffix}`;

    if (p.phase === "done" || p.phase === "error") {
      clearInterval(pushPollTimer);
      pushPollTimer = null;
      els.btnPushCancel.disabled = false;
      els.btnPushCancel.textContent = "Fermer";
      els.pushProgressTitle.textContent = p.phase === "done"
        ? "✓ Push terminé avec succès"
        : `✗ Push terminé avec ${p.errors?.length ?? 0} erreur(s)`;
      if (p.errors && p.errors.length > 0) {
        els.pushProgressErrors.classList.remove("hidden");
        els.pushProgressErrors.textContent = `Erreurs (${p.errors.length}) :\n${p.errors.join("\n")}`;
      }
      const successLabel = p.phase === "done" ? "✓ Push terminé avec succès" : `✗ Push terminé avec ${p.errors?.length ?? 0} erreur(s)`;
      toast(successLabel, p.phase === "error");
      // Refresh la liste pour mettre à jour les indicateurs.
      await refreshActiveInList();
    }
  } catch (err) {
    console.warn("Polling push progress failed:", err);
  }
}

function closePushModal() {
  if (pushPollTimer) {
    clearInterval(pushPollTimer);
    pushPollTimer = null;
  }
  els.pushModal.classList.add("hidden");
  els.btnPushCancel.textContent = "Annuler";
  els.btnPushCancel.disabled = false;
  els.pushConfirmCheck.disabled = false;
}

function pickInitial() {
  return cards.find((c) => c.hasSource && !c.reviewed) ?? cards[0];
}

async function loadCards() {
  const res = await fetch("/api/cards").then((r) => r.json());
  cards = res.cards;
  renderList();
  renderProgress();
}

function renderProgress() {
  const total = cards.filter((c) => c.hasSource).length;
  const reviewed = cards.filter((c) => c.reviewed).length;
  els.progress.textContent = `${reviewed} / ${total}`;
}

function renderList() {
  const showPending = els.filterPending.checked;
  const showReviewed = els.filterReviewed.checked;
  const statusFilter = els.filterStatus?.value ?? "all";
  els.list.innerHTML = "";
  for (const c of cards) {
    // Filtre crop d'image
    if (c.reviewed && !showReviewed) continue;
    if (!c.reviewed && !showPending) continue;
    // Filtre statut éditorial
    if (statusFilter !== "all" && c.editorialStatus !== statusFilter) continue;

    const li = document.createElement("li");
    li.dataset.dexNum = c.dexNum;
    if (c.dexNum === activeDexNum) li.classList.add("active");
    if (c.editorialStatus === "reviewed") li.classList.add("source-normalized");
    if (c.editorialStatus === "approved") li.classList.add("source-approved");

    const badge = document.createElement("span");
    badge.className = "badge " + badgeClass(c);
    const dex = document.createElement("span");
    dex.className = "dex";
    dex.textContent = c.dexNum;
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = c.title;
    li.append(badge, dex, label);

    // Tag statut éditorial
    if (c.editorialStatus === "reviewed") {
      const tag = document.createElement("span");
      tag.className = "src-tag tag-reviewed";
      tag.textContent = "reviewed";
      tag.title = "À reviewer — clique \"Approuver\" pour passer au statut approved.";
      li.appendChild(tag);
    } else if (c.editorialStatus === "approved") {
      const tag = document.createElement("span");
      tag.className = "src-tag tag-approved";
      tag.textContent = "approved";
      tag.title = "Approuvée — sera poussée au prochain npm run push:db.";
      li.appendChild(tag);
    }

    li.addEventListener("click", () => selectCard(c.dexNum));
    els.list.appendChild(li);
  }
}

function badgeClass(c) {
  if (!c.hasSource) return "b-error";
  if (c.reviewed) return "b-reviewed";
  if (c.centeringScore != null && c.centeringScore < 7) return "b-warning";
  return "b-pending";
}

// ───── Sélection carte ─────────────────────────────────────────────────
async function selectCard(dexNum) {
  // Avertit si modifs (crop ou métadonnées) non sauvegardées.
  const dirtyParts = [];
  if (cropDirty) dirtyParts.push("crop");
  if (Object.keys(metaPending).length > 0) dirtyParts.push("métadonnées");
  if (dirtyParts.length > 0 && dexNum !== activeDexNum) {
    const ok = confirm(
      `Tu as des modifications non sauvegardées (${dirtyParts.join(" + ")}). Les abandonner ? (Approuver les sauverait)`,
    );
    if (!ok) return;
  }
  metaPending = {};
  cropDirty = false;
  els.btnSaveMeta.disabled = true;

  activeDexNum = dexNum;
  for (const li of els.list.querySelectorAll("li")) {
    li.classList.toggle("active", li.dataset.dexNum === dexNum);
  }
  const detail = await fetch(`/api/cards/${dexNum}`).then((r) => r.json());
  activeDetail = detail;

  els.title.textContent = `${detail.dexNum} · ${detail.title}`;
  const metaParts = [];
  if (detail.attribution) metaParts.push(escapeHtml(detail.attribution));
  if (detail.sourcePageUrl) {
    metaParts.push(
      `<a href="${escapeAttr(detail.sourcePageUrl)}" target="_blank" rel="noopener">Source ↗</a>`,
    );
  }
  els.meta.innerHTML = metaParts.join(" · ");

  renderMetaForm(detail);
  updateEditorialStatusUI();

  if (!detail.hasSource) {
    clearCanvases();
    showCropInfo(null, "Pas d'image source en cache. Upload une image pour démarrer.");
    setToolbarEnabled(false);
    els.btnOpenUpload.disabled = false;
    return;
  }

  setToolbarEnabled(true);
  els.btnOpenUpload.disabled = false;
  await loadSourceImage(dexNum);
  cropPx = computeInitialCrop(detail);
  cropDirty = false; // fresh load = aligné avec le serveur
  drawSource();
  drawCropOverlay();
  drawAllPreviews();
  updateDimsBadge();
  showCropInfo(detail.crop);
}

function clearCanvases() {
  const sc = els.sourceCanvas;
  sc.getContext("2d").clearRect(0, 0, sc.width, sc.height);
  sc.width = 0;
  sc.height = 0;
  sourceImage = null;
  sourceNaturalSize = { width: 0, height: 0 };
  cropPx = null;
  els.cropRect.style.display = "none";
  els.cropDims.classList.add("empty");
  for (const c of [els.previewZoom, els.previewMini, els.previewThumb]) {
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#1d1a16";
    ctx.fillRect(0, 0, c.width, c.height);
  }
}

async function loadSourceImage(dexNum) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      sourceImage = img;
      sourceNaturalSize = { width: img.naturalWidth, height: img.naturalHeight };
      resolve();
    };
    img.onerror = reject;
    img.src = `/images/source/${dexNum}?_=${Date.now()}`;
  });
}

function computeInitialCrop(detail) {
  const { width: sw, height: sh } = sourceNaturalSize;
  if (detail.crop?.manualExtract) {
    return { ...detail.crop.manualExtract };
  }
  if (detail.crop?.subjectBoundingBox && detail.crop?.focalPoint) {
    return planFromVision(detail.crop, sw, sh);
  }
  return centeredCrop(sw, sh);
}

function centeredCrop(sw, sh) {
  const sourceRatio = sw / sh;
  let cw, ch;
  if (sourceRatio > TARGET_RATIO) {
    ch = sh;
    cw = Math.round(ch * TARGET_RATIO);
  } else {
    cw = sw;
    ch = Math.round(cw / TARGET_RATIO);
  }
  return {
    left: Math.round((sw - cw) / 2),
    top: Math.round((sh - ch) / 2),
    width: cw,
    height: ch,
  };
}

function planFromVision(crop, sw, sh) {
  const focal = crop.focalPoint;
  const bbox = crop.subjectBoundingBox;
  const sourceRatio = sw / sh;
  let cw, ch;
  if (sourceRatio > TARGET_RATIO) {
    ch = sh;
    cw = Math.round(ch * TARGET_RATIO);
  } else {
    cw = sw;
    ch = Math.round(cw / TARGET_RATIO);
  }
  let left = Math.round(focal.x * sw - cw / 2);
  let top = Math.round(focal.y * sh - ch / 2);
  if (bbox) {
    const bx = bbox.x * sw;
    const by = bbox.y * sh;
    const bw = bbox.width * sw;
    const bh = bbox.height * sh;
    if (left > bx) left = Math.round(bx);
    if (top > by) top = Math.round(by);
    if (left + cw < bx + bw) left = Math.round(bx + bw - cw);
    if (top + ch < by + bh) top = Math.round(by + bh - ch);
  }
  left = Math.max(0, Math.min(left, sw - cw));
  top = Math.max(0, Math.min(top, sh - ch));
  return { left, top, width: cw, height: ch };
}

// ───── Rendu source + crop overlay ─────────────────────────────────────
function drawSource() {
  if (!sourceImage) return;
  const wrap = els.sourceWrap;
  const wrapRect = wrap.getBoundingClientRect();
  const wrapW = wrapRect.width;
  const wrapH = wrapRect.height;
  const imgRatio = sourceNaturalSize.width / sourceNaturalSize.height;
  const wrapRatio = wrapW / wrapH;
  let dispW, dispH;
  if (imgRatio > wrapRatio) {
    dispW = wrapW;
    dispH = wrapW / imgRatio;
  } else {
    dispH = wrapH;
    dispW = wrapH * imgRatio;
  }
  displayedSize = { width: dispW, height: dispH };
  els.sourceCanvas.width = dispW;
  els.sourceCanvas.height = dispH;
  const offsetX = (wrapW - dispW) / 2;
  const offsetY = (wrapH - dispH) / 2;
  els.sourceCanvas.style.left = `${offsetX}px`;
  els.sourceCanvas.style.top = `${offsetY}px`;
  els.sourceCanvas.style.width = `${dispW}px`;
  els.sourceCanvas.style.height = `${dispH}px`;
  els.sourceCanvas.style.right = "auto";
  els.sourceCanvas.style.bottom = "auto";
  const ctx = els.sourceCanvas.getContext("2d");
  ctx.drawImage(sourceImage, 0, 0, dispW, dispH);
}

function drawCropOverlay() {
  if (!cropPx) {
    els.cropRect.style.display = "none";
    return;
  }
  const wrapRect = els.sourceWrap.getBoundingClientRect();
  const offsetX = (wrapRect.width - displayedSize.width) / 2;
  const offsetY = (wrapRect.height - displayedSize.height) / 2;
  const scaleX = displayedSize.width / sourceNaturalSize.width;
  const scaleY = displayedSize.height / sourceNaturalSize.height;
  els.cropRect.style.display = "block";
  els.cropRect.style.left = `${offsetX + cropPx.left * scaleX}px`;
  els.cropRect.style.top = `${offsetY + cropPx.top * scaleY}px`;
  els.cropRect.style.width = `${cropPx.width * scaleX}px`;
  els.cropRect.style.height = `${cropPx.height * scaleY}px`;
}

// ───── Aperçus multiples ────────────────────────────────────────────────
function drawAllPreviews() {
  drawPreviewZoom();
  drawPreviewCover(els.previewMini);
  drawPreviewCover(els.previewThumb);
}

// Zoom : "contain" — l'image cropée occupe toute la zone, fond noir si
// letterboxing (rare car ratios proches).
function drawPreviewZoom() {
  const c = els.previewZoom;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#1d1a16";
  ctx.fillRect(0, 0, c.width, c.height);
  if (!sourceImage || !cropPx) return;
  // Le crop a un ratio que l'utilisateur a éventuellement modifié — on respecte
  // le contain : centrer l'image dans la canvas en gardant son ratio.
  const cropRatio = cropPx.width / cropPx.height;
  const canvasRatio = c.width / c.height;
  let dw, dh;
  if (cropRatio > canvasRatio) {
    dw = c.width;
    dh = c.width / cropRatio;
  } else {
    dh = c.height;
    dw = c.height * cropRatio;
  }
  const dx = (c.width - dw) / 2;
  const dy = (c.height - dh) / 2;
  ctx.drawImage(
    sourceImage,
    cropPx.left, cropPx.top, cropPx.width, cropPx.height,
    dx, dy, dw, dh,
  );
}

// Mini & thumb : "cover" — re-recadre le crop (déjà 1.37) pour remplir la
// canvas. Si la canvas est plus carrée, on coupe les côtés.
function drawPreviewCover(canvas) {
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#1d1a16";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!sourceImage || !cropPx) return;
  const targetRatio = canvas.width / canvas.height;
  const cropRatio = cropPx.width / cropPx.height;
  // Sous-rectangle du crop à utiliser pour "cover" la canvas.
  let srcW = cropPx.width;
  let srcH = cropPx.height;
  let srcX = cropPx.left;
  let srcY = cropPx.top;
  if (cropRatio > targetRatio) {
    // crop trop large par rapport à la cible : trim sides
    srcW = Math.round(cropPx.height * targetRatio);
    srcX = cropPx.left + Math.round((cropPx.width - srcW) / 2);
  } else if (cropRatio < targetRatio) {
    // crop trop haut : trim haut/bas
    srcH = Math.round(cropPx.width / targetRatio);
    srcY = cropPx.top + Math.round((cropPx.height - srcH) / 2);
  }
  ctx.drawImage(
    sourceImage,
    srcX, srcY, srcW, srcH,
    0, 0, canvas.width, canvas.height,
  );
}

// ───── Crop info ───────────────────────────────────────────────────────
function showCropInfo(crop, fallbackText) {
  const el = els.cropInfo;
  if (!crop && !fallbackText) {
    el.classList.add("empty");
    el.innerHTML = "";
    return;
  }
  el.classList.remove("empty");
  if (fallbackText) {
    el.textContent = fallbackText;
    return;
  }
  const rows = [];
  rows.push(
    `<div class="row"><span>Source crop</span><strong>${crop.source ?? "—"}</strong></div>`,
  );
  if (crop.reviewed && crop.reviewedAt) {
    rows.push(
      `<div class="row"><span>Reviewed</span><strong>${new Date(crop.reviewedAt).toLocaleString("fr-FR")}</strong></div>`,
    );
  }
  el.innerHTML = rows.join("");
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}
function escapeAttr(s) {
  return escapeHtml(s);
}

// ───── Interaction crop (drag/resize) ───────────────────────────────────
function bindCropInteraction() {
  els.cropRect.addEventListener("pointerdown", onCropPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("resize", () => {
    if (sourceImage) {
      drawSource();
      drawCropOverlay();
    }
  });
}

function clientToSource(clientX, clientY) {
  const wrapRect = els.sourceWrap.getBoundingClientRect();
  const offsetX = (wrapRect.width - displayedSize.width) / 2;
  const offsetY = (wrapRect.height - displayedSize.height) / 2;
  const localX = clientX - wrapRect.left - offsetX;
  const localY = clientY - wrapRect.top - offsetY;
  const scaleX = sourceNaturalSize.width / displayedSize.width;
  const scaleY = sourceNaturalSize.height / displayedSize.height;
  return { x: localX * scaleX, y: localY * scaleY };
}

function onCropPointerDown(e) {
  if (!sourceImage || !cropPx) return;
  const target = e.target;
  let mode = "move";
  if (target?.classList?.contains("handle")) {
    mode = `resize-${target.dataset.h}`;
  }
  e.preventDefault();
  e.stopPropagation();
  els.cropRect.setPointerCapture(e.pointerId);
  const start = clientToSource(e.clientX, e.clientY);
  dragging = { mode, start, originalRect: { ...cropPx } };
}

function onPointerMove(e) {
  if (!dragging || !sourceImage) return;
  const cur = clientToSource(e.clientX, e.clientY);
  const orig = dragging.originalRect;
  if (dragging.mode === "move") {
    const dx = cur.x - dragging.start.x;
    const dy = cur.y - dragging.start.y;
    cropPx = clampToBounds({
      left: orig.left + dx,
      top: orig.top + dy,
      width: orig.width,
      height: orig.height,
    });
  } else {
    cropPx = applyResize(dragging.mode, orig, cur);
  }
  cropDirty = true;
  drawCropOverlay();
  drawAllPreviews();
  updateDimsBadge();
}

function onPointerUp(e) {
  if (!dragging) return;
  if (els.cropRect.hasPointerCapture(e.pointerId)) {
    els.cropRect.releasePointerCapture(e.pointerId);
  }
  dragging = null;
}

function applyResize(mode, orig, cur) {
  const right = orig.left + orig.width;
  const bottom = orig.top + orig.height;
  const cx = orig.left + orig.width / 2;
  const cy = orig.top + orig.height / 2;

  let newLeft = orig.left;
  let newTop = orig.top;
  let newWidth = orig.width;
  let newHeight = orig.height;

  switch (mode) {
    case "resize-nw": {
      const w = Math.max(MIN_CROP_PX, right - cur.x);
      const h = Math.max(MIN_CROP_PX, bottom - cur.y);
      [newWidth, newHeight] = lockToRatio(w, h);
      newLeft = right - newWidth;
      newTop = bottom - newHeight;
      break;
    }
    case "resize-ne": {
      const w = Math.max(MIN_CROP_PX, cur.x - orig.left);
      const h = Math.max(MIN_CROP_PX, bottom - cur.y);
      [newWidth, newHeight] = lockToRatio(w, h);
      newLeft = orig.left;
      newTop = bottom - newHeight;
      break;
    }
    case "resize-sw": {
      const w = Math.max(MIN_CROP_PX, right - cur.x);
      const h = Math.max(MIN_CROP_PX, cur.y - orig.top);
      [newWidth, newHeight] = lockToRatio(w, h);
      newLeft = right - newWidth;
      newTop = orig.top;
      break;
    }
    case "resize-se": {
      const w = Math.max(MIN_CROP_PX, cur.x - orig.left);
      const h = Math.max(MIN_CROP_PX, cur.y - orig.top);
      [newWidth, newHeight] = lockToRatio(w, h);
      newLeft = orig.left;
      newTop = orig.top;
      break;
    }
    case "resize-n": {
      newHeight = Math.max(MIN_CROP_PX, bottom - cur.y);
      newWidth = newHeight * TARGET_RATIO;
      newLeft = cx - newWidth / 2;
      newTop = bottom - newHeight;
      break;
    }
    case "resize-s": {
      newHeight = Math.max(MIN_CROP_PX, cur.y - orig.top);
      newWidth = newHeight * TARGET_RATIO;
      newLeft = cx - newWidth / 2;
      newTop = orig.top;
      break;
    }
    case "resize-w": {
      newWidth = Math.max(MIN_CROP_PX, right - cur.x);
      newHeight = newWidth / TARGET_RATIO;
      newLeft = right - newWidth;
      newTop = cy - newHeight / 2;
      break;
    }
    case "resize-e": {
      newWidth = Math.max(MIN_CROP_PX, cur.x - orig.left);
      newHeight = newWidth / TARGET_RATIO;
      newLeft = orig.left;
      newTop = cy - newHeight / 2;
      break;
    }
    default:
      return orig;
  }

  return clampToBounds({
    left: newLeft,
    top: newTop,
    width: newWidth,
    height: newHeight,
  });
}

function lockToRatio(w, h) {
  if (w / h > TARGET_RATIO) return [w, w / TARGET_RATIO];
  return [h * TARGET_RATIO, h];
}

function clampToBounds(rect) {
  const sw = sourceNaturalSize.width;
  const sh = sourceNaturalSize.height;
  let { left, top, width, height } = rect;
  if (width > sw) {
    width = sw;
    height = width / TARGET_RATIO;
  }
  if (height > sh) {
    height = sh;
    width = height * TARGET_RATIO;
  }
  width = Math.max(MIN_CROP_PX, width);
  height = Math.max(MIN_CROP_PX / TARGET_RATIO, height);
  left = Math.max(0, Math.min(left, sw - width));
  top = Math.max(0, Math.min(top, sh - height));
  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(width),
    height: Math.round(height),
  };
}

function nudgeCrop(dx, dy) {
  if (!cropPx) return;
  cropPx = clampToBounds({
    left: cropPx.left + dx,
    top: cropPx.top + dy,
    width: cropPx.width,
    height: cropPx.height,
  });
  cropDirty = true;
  drawCropOverlay();
  drawAllPreviews();
  updateDimsBadge();
}

function scaleCrop(factor) {
  if (!cropPx) return;
  const cx = cropPx.left + cropPx.width / 2;
  const cy = cropPx.top + cropPx.height / 2;
  let w = cropPx.width * factor;
  let h = cropPx.height * factor;
  cropPx = clampToBounds({
    left: cx - w / 2,
    top: cy - h / 2,
    width: w,
    height: h,
  });
  cropDirty = true;
  drawCropOverlay();
  drawAllPreviews();
  updateDimsBadge();
}

function updateDimsBadge() {
  if (!cropPx || !els.cropDims) return;
  els.cropDims.classList.remove("empty");
  const ratio = (cropPx.width / cropPx.height).toFixed(3);
  els.cropDims.textContent = `${cropPx.width} × ${cropPx.height} px · ratio ${ratio}`;
}

// ───── Toolbar ─────────────────────────────────────────────────────────
function setToolbarEnabled(on) {
  for (const b of [
    els.btnCenter,
    els.btnReset,
    els.btnSaveManual,
    els.btnApprove,
  ]) {
    b.disabled = !on;
  }
}

function bindToolbar() {
  els.btnCenter.addEventListener("click", async () => {
    if (!sourceImage) return;
    cropPx = centeredCrop(sourceNaturalSize.width, sourceNaturalSize.height);
    drawCropOverlay();
    drawAllPreviews();
    await postCenter();
  });

  els.btnReset.addEventListener("click", async () => {
    if (!confirm("Supprimer le crop courant ?")) return;
    const res = await fetch(`/api/cards/${activeDexNum}/reset`, {
      method: "POST",
    });
    if (res.ok) {
      await selectCard(activeDexNum);
      await refreshActiveInList();
      toast("Crop supprimé");
    }
  });

  els.btnSaveManual.addEventListener("click", () => saveManual());
  els.btnApprove.addEventListener("click", () => approveAndNext());
  if (els.btnUnapprove) els.btnUnapprove.addEventListener("click", () => unapproveActive());
  els.btnPrev.addEventListener("click", () => navigate(-1));
  els.btnNext.addEventListener("click", () => navigate(1));
  els.btnOpenUpload.addEventListener("click", () => openUploadModal());
}

async function postCenter() {
  const res = await fetch(`/api/cards/${activeDexNum}/center`, {
    method: "POST",
  });
  if (res.ok) {
    activeDetail = await fetch(`/api/cards/${activeDexNum}`).then((r) => r.json());
    cropDirty = false;
    showCropInfo(activeDetail.crop);
    await refreshActiveInList();
    showPushBanner();
    toast("Crop centré enregistré");
  }
}

async function saveManual() {
  if (!cropPx) return;
  const res = await fetch(`/api/cards/${activeDexNum}/crop`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cropPx),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    toast(data.error ?? "Échec enregistrement", true);
    return;
  }
  activeDetail = await fetch(`/api/cards/${activeDexNum}`).then((r) => r.json());
  cropDirty = false;
  showCropInfo(activeDetail.crop);
  await refreshActiveInList();
  showPushBanner();
  toast("Crop manuel enregistré");
}

async function approveAndNext() {
  // 1. Si métadonnées dirty → save d'abord. En cas d'échec Zod, on s'arrête.
  if (Object.keys(metaPending).length > 0) {
    await saveMetadata();
    if (Object.keys(metaPending).length > 0) {
      return; // erreur déjà affichée
    }
  }
  // 2. Crop dirty ou pas encore de finalFile → sauve. saveManual() ne marque
  //    pas le statut éditorial, seulement le crop.
  if (cropDirty || !activeDetail.crop?.finalFile) {
    await saveManual();
    if (cropDirty) {
      return; // saveManual a échoué
    }
  }
  // 3. Approuver la carte côté éditorial (D1 du plan refonte) :
  //    POST /approve vérifie toutes les pré-conditions et flip editorial.status
  //    à "approved". 422 si bloqueurs.
  const res = await fetch(`/api/cards/${activeDexNum}/approve`, {
    method: "POST",
  });
  if (res.status === 422) {
    const data = await res.json().catch(() => ({}));
    showBlockersModal(data.blockers ?? []);
    return;
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    toast(data.error ?? "Échec approbation", true);
    return;
  }
  const data = await res.json();
  if (data.noop) {
    toast(`✓ Modifications enregistrées (v${data.contentVersion})`);
  } else {
    toast(`✓ Carte approuvée (v${data.contentVersion})`);
  }
  // 4. Liste + navigation.
  await refreshActiveInList();
  // Reload detail pour rafraîchir le statut éditorial affiché.
  if (activeDetail) activeDetail.editorial = { ...(activeDetail.editorial ?? {}), status: "approved", contentVersion: data.contentVersion };
  updateEditorialStatusUI();
  // Sur "Mettre à jour" (noop), on reste sur la carte courante pour permettre
  // d'enchaîner les micro-corrections. Sur première approbation, on avance.
  if (!data.noop) navigate(1);
}

async function unapproveActive() {
  if (!activeDexNum) return;
  if (!confirm("Repasser cette carte en \"reviewed\" ? Elle ne sera plus poussée tant que tu ne l'approuves pas à nouveau.")) return;
  const res = await fetch(`/api/cards/${activeDexNum}/unapprove`, {
    method: "POST",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    toast(data.error ?? "Échec dé-approbation", true);
    return;
  }
  const data = await res.json();
  toast(`↩ Carte repassée en "reviewed" (v${data.contentVersion})`);
  if (activeDetail) activeDetail.editorial = { ...(activeDetail.editorial ?? {}), status: "reviewed" };
  updateEditorialStatusUI();
  await refreshActiveInList();
}

// Affiche les bloqueurs d'approbation dans un dialog natif lisible.
function showBlockersModal(blockers) {
  if (!blockers || blockers.length === 0) {
    toast("Approbation échouée mais aucun bloqueur reporté.", true);
    return;
  }
  const lines = blockers.map((b) => `  • [${b.rule}] ${b.message}`).join("\n");
  alert(
    `Cette carte ne peut pas être approuvée pour ${blockers.length} raison(s) :\n\n${lines}\n\nCorrige les points ci-dessus puis réessaie.`,
  );
}

// Synchronise les boutons Approuver/Mettre à jour/Revenir en review et le
// badge status avec activeDetail.editorial.status.
//
// - status=reviewed  → "✓ Approuver"     (vérifie pré-conditions + flip status)
// - status=approved  → "✓ Mettre à jour" (sauve modifs, statut reste approved)
//                       + bouton "↩ Revenir en review" visible
function updateEditorialStatusUI() {
  const status = activeDetail?.editorial?.status ?? null;
  els.btnApprove.style.display = "";
  if (status === "approved") {
    els.btnApprove.textContent = "✓ Mettre à jour";
    els.btnApprove.title = "Sauve les modifs (texte + crop). La carte reste au statut approved. (Entrée)";
    els.btnApprove.classList.remove("btn-success");
    els.btnApprove.classList.add("btn-primary");
    if (els.btnUnapprove) els.btnUnapprove.style.display = "";
  } else {
    els.btnApprove.textContent = "✓ Approuver";
    els.btnApprove.title = "Vérifie les pré-conditions et passe la carte au statut approved. (Entrée)";
    els.btnApprove.classList.remove("btn-primary");
    els.btnApprove.classList.add("btn-success");
    if (els.btnUnapprove) els.btnUnapprove.style.display = "none";
  }
  const statusEl = document.getElementById("meta-status");
  if (statusEl) statusEl.textContent = status ?? "—";
}

async function refreshActiveInList() {
  const updated = await fetch("/api/cards").then((r) => r.json());
  cards = updated.cards;
  renderList();
  renderProgress();
}

function navigate(dir) {
  const showPending = els.filterPending.checked;
  const showReviewed = els.filterReviewed.checked;
  const visible = cards.filter((c) => {
    if (c.reviewed && !showReviewed) return false;
    if (!c.reviewed && !showPending) return false;
    return true;
  });
  if (visible.length === 0) return;
  const idx = visible.findIndex((c) => c.dexNum === activeDexNum);
  if (idx === -1) {
    selectCard(visible[0].dexNum);
    return;
  }
  const next = visible[(idx + dir + visible.length) % visible.length];
  selectCard(next.dexNum);
}

// ───── Filtres ─────────────────────────────────────────────────────────
function bindFilters() {
  els.filterPending.addEventListener("change", renderList);
  els.filterReviewed.addEventListener("change", renderList);
  if (els.filterStatus) els.filterStatus.addEventListener("change", renderList);
}

// ───── Clavier ─────────────────────────────────────────────────────────
//
// Flèches simples           → navigation entre cartes (← / →) ou liste (↑ / ↓)
// Alt + flèches             → nudge fin du crop (1px, ×10 avec Shift)
// j / k                     → suivant / précédent (alias vim)
// Enter                     → approuver et passer à la suivante
// c / s                     → centrer / save crop
// + / -                     → zoom du crop (5%)
function bindKeys() {
  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    // Alt + flèches → nudge crop (le seul cas où les flèches modifient le crop)
    if (e.altKey && e.key.startsWith("Arrow")) {
      const step = e.shiftKey ? 10 : 1;
      e.preventDefault();
      switch (e.key) {
        case "ArrowLeft": nudgeCrop(-step, 0); return;
        case "ArrowRight": nudgeCrop(step, 0); return;
        case "ArrowUp": nudgeCrop(0, -step); return;
        case "ArrowDown": nudgeCrop(0, step); return;
      }
      return;
    }

    switch (e.key) {
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        navigate(-1);
        break;
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        navigate(1);
        break;
      case "j":
      case "PageDown":
        e.preventDefault();
        navigate(1);
        break;
      case "k":
      case "PageUp":
        e.preventDefault();
        navigate(-1);
        break;
      case "Enter":
        e.preventDefault();
        approveAndNext();
        break;
      case "+":
      case "=":
        e.preventDefault();
        scaleCrop(1.05);
        break;
      case "-":
      case "_":
        e.preventDefault();
        scaleCrop(1 / 1.05);
        break;
      case "c":
        if (!e.ctrlKey && !e.metaKey) els.btnCenter.click();
        break;
      case "s":
        if (!e.ctrlKey && !e.metaKey) els.btnSaveManual.click();
        break;
    }
  });
}

// ───── Toast ───────────────────────────────────────────────────────────
let toastTimer = null;
function toast(msg, isError = false) {
  els.toast.textContent = msg;
  els.toast.classList.toggle("error", isError);
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 3000);
}

function showPushBanner() {
  els.pushBanner.classList.remove("hidden");
}

// ───── Panneau métadonnées : binding et rendu ───────────────────────────
//
// Inputs DOM tracés par leur id, mappés au champ logique :
//   f-title          → title
//   f-blurb          → blurb
//   f-body           → body
//   f-imageLabel     → imageLabel
//   f-attribution    → attribution         (source-meta, pas card)
//   f-sourcePageUrl  → sourcePageUrl       (source-meta)
//   f-placeLabel     → placeLabel
//   f-timeDisplayLabel → timeDisplayLabel
//   f-wp-pre/verb/post → wherePrompt.{pre,verb,post}
//   f-lat / f-lon / f-radius → lat / lon / whereRadiusKm
//
// Tout passe par un dirty-tracking : onInput, on compare au baseline et on
// stocke dans metaPending si différent. Save: PATCH /metadata + éventuel PATCH
// /source-meta si attribution/sourcePageUrl ont changé.

const META_FIELDS = [
  // [domId, key, kind] — kind: 'card' | 'source'
  ["f-title", "title", "card"],
  ["f-blurb", "blurb", "card"],
  ["f-body", "body", "card"],
  ["f-imageLabel", "imageLabel", "card"],
  ["f-attribution", "attribution", "source"],
  ["f-sourcePageUrl", "sourcePageUrl", "source"],
  ["f-placeLabel", "placeLabel", "card"],
  ["f-timeDisplayLabel", "timeDisplayLabel", "card"],
  ["f-wp-pre", "wp_pre", "card"],
  ["f-wp-verb", "wp_verb", "card"],
  ["f-wp-post", "wp_post", "card"],
  ["f-whenp-pre", "whenp_pre", "card"],
  ["f-whenp-verb", "whenp_verb", "card"],
  ["f-whenp-post", "whenp_post", "card"],
  // whenDelta : read-only depuis l'UI (D4 du plan refonte). Dérivé serveur via
  // HD_ERA_WHEN_DELTAS[era]. Délibérément absent du PATCH metadata.
  ["f-lat", "lat", "card"],
  ["f-lon", "lon", "card"],
  ["f-radius", "whereRadiusKm", "card"],
  // Temporalité
  ["f-tag", "tag", "card"],
  ["f-timeKind", "timeKind", "card"],
  ["f-pivotYear", "pivotYear", "card"],
  ["f-startYear", "startYear", "card"],
  ["f-endYear", "endYear", "card"],
  ["f-timeJustification", "timeJustification", "card"],
];

function bindMetaForm() {
  for (const [id, key] of META_FIELDS) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.addEventListener("input", () => onMetaFieldChange(key, el));
    el.addEventListener("change", () => onMetaFieldChange(key, el));
  }
  // Compteurs blurb/body
  document.getElementById("f-blurb").addEventListener("input", () => {
    document.getElementById("f-blurb-count").textContent =
      document.getElementById("f-blurb").value.length;
  });
  document.getElementById("f-body").addEventListener("input", () => {
    document.getElementById("f-body-count").textContent =
      document.getElementById("f-body").value.length;
  });

  // Bouton enregistrer
  els.btnSaveMeta.addEventListener("click", saveMetadata);

  // Chips radius
  for (const chip of document.querySelectorAll(".radius-presets .chip[data-radius]")) {
    chip.addEventListener("click", () => {
      const v = Number(chip.dataset.radius);
      const inp = document.getElementById("f-radius");
      inp.value = String(v);
      onMetaFieldChange("whereRadiusKm", inp);
      updateMapCircle();
      updateRadiusChipsActive();
    });
  }

  // Chips whenDelta
  for (const chip of document.querySelectorAll(".when-delta-presets .chip[data-when-delta]")) {
    chip.addEventListener("click", () => {
      const v = Number(chip.dataset.whenDelta);
      const inp = document.getElementById("f-whenDelta");
      inp.value = String(v);
      onMetaFieldChange("whenDelta", inp);
      updateWhenDeltaChipsActive();
    });
  }
  document.getElementById("btn-fit-radius").addEventListener("click", () => {
    if (map && mapCircle) map.fitBounds(mapCircle.getBounds(), { padding: [10, 10] });
  });
  document.getElementById("btn-recenter-map").addEventListener("click", () => {
    if (map && mapMarker) map.setView(mapMarker.getLatLng(), Math.max(map.getZoom(), 6));
  });

  // Bouton pivot = milieu de [startYear, endYear] (uniquement pour periodique).
  document.getElementById("btn-pivot-midpoint").addEventListener("click", () => {
    const sy = Number(document.getElementById("f-startYear").value);
    const ey = Number(document.getElementById("f-endYear").value);
    if (!Number.isFinite(sy) || !Number.isFinite(ey)) {
      toast("Renseigne d'abord startYear et endYear", true);
      return;
    }
    if (sy > ey) {
      toast("startYear > endYear, corrige avant de calculer", true);
      return;
    }
    const mid = Math.round((sy + ey) / 2);
    const inp = document.getElementById("f-pivotYear");
    inp.value = String(mid);
    onMetaFieldChange("pivotYear", inp);
    toast(`pivotYear = ${mid} (milieu de ${sy}-${ey})`);
  });
}

function onMetaFieldChange(key, el) {
  if (!activeDetail) return;
  const baseline = getBaseline(key);
  const current = readField(key, el);
  const changed = !valuesEqual(baseline, current);

  el.classList.toggle("dirty", changed);
  if (changed) metaPending[key] = current;
  else delete metaPending[key];

  // Validation côté client minimale (les vraies erreurs viennent de Zod au save)
  el.classList.remove("invalid");
  const issue = validateField(key, current);
  if (issue) el.classList.add("invalid");

  els.btnSaveMeta.disabled = Object.keys(metaPending).length === 0;

  // Sync géo : si lat/lon/radius changent, MAJ la carte sans toucher au crop.
  if (key === "lat" || key === "lon") updateMapMarker();
  if (key === "whereRadiusKm") {
    updateMapCircle();
    updateRadiusChipsActive();
  }
  if (key === "whenDelta") updateWhenDeltaChipsActive();
  if (key === "tag") {
    updateTagDependentUI();
    updateWhenPromptPreWarn();
  }
  if (key === "whenp_pre" || key === "whenp_verb" || key === "whenp_post") {
    updateWhenPromptPreview();
  }
  if (key === "wp_pre" || key === "wp_verb" || key === "wp_post") {
    updateWherePromptPreview();
  }
  if (
    key === "tag" || key === "pivotYear" || key === "startYear" ||
    key === "endYear" || key === "whenDelta"
  ) {
    updateWhenWindowPreview();
  }
}

function updateWhenPromptPreview() {
  const preview = document.getElementById("whenp-preview-text");
  if (!preview) return;
  const pre = document.getElementById("f-whenp-pre")?.value ?? "";
  const verb = document.getElementById("f-whenp-verb")?.value ?? "";
  const post = document.getElementById("f-whenp-post")?.value ?? "";
  if (!pre && !verb && !post) {
    preview.textContent = "—";
  } else {
    preview.innerHTML =
      escapeHtml(pre) + "<strong>" + escapeHtml(verb) + "</strong>" + escapeHtml(post);
  }
  updateWhenPromptPreWarn();
}

// Avertit inline si `whenPrompt.pre` ne correspond pas au tag — mêmes règles
// que l'invariant whenPrompt-periodique-pre/ponctuelle-pre dans invariants.ts.
function updateWhenPromptPreWarn() {
  const warn = document.getElementById("whenp-pre-warn");
  if (!warn) return;
  const tag = document.getElementById("f-tag")?.value ?? "";
  const pre = (document.getElementById("f-whenp-pre")?.value ?? "").trim().toLowerCase();
  let msg = "";
  if (tag === "ponctuelle" && pre && !pre.startsWith("quand")) {
    msg = "⚠ tag=ponctuelle : pre devrait commencer par « Quand … »";
  } else if (tag === "periodique" && pre && !pre.startsWith("vers quelle période")) {
    msg = "⚠ tag=periodique : pre devrait commencer par « Vers quelle période … »";
  }
  if (msg) {
    warn.textContent = msg;
    warn.classList.remove("hidden");
  } else {
    warn.textContent = "";
    warn.classList.add("hidden");
  }
}

// Affiche l'intervalle d'acceptation effectif :
//   ponctuelle : [pivotYear - whenDelta, pivotYear + whenDelta]
//   periodique : [startYear - whenDelta, endYear + whenDelta]
function updateWhenWindowPreview() {
  const out = document.getElementById("when-window-text");
  if (!out) return;
  const tag = document.getElementById("f-tag")?.value ?? "";
  const delta = Number(document.getElementById("f-whenDelta")?.value);
  if (!Number.isFinite(delta) || delta <= 0) {
    out.textContent = "—";
    return;
  }
  const fmt = (n) => (n < 0 ? `${-n} av. J.-C.` : `${n}`);
  if (tag === "ponctuelle") {
    const pivot = Number(document.getElementById("f-pivotYear")?.value);
    if (!Number.isFinite(pivot)) {
      out.textContent = "— (pivotYear manquant)";
      return;
    }
    out.textContent = `${fmt(pivot - delta)} → ${fmt(pivot + delta)}  (largeur ${2 * delta} ans)`;
  } else if (tag === "periodique") {
    const sy = Number(document.getElementById("f-startYear")?.value);
    const ey = Number(document.getElementById("f-endYear")?.value);
    if (!Number.isFinite(sy) || !Number.isFinite(ey)) {
      out.textContent = "— (startYear et endYear requis)";
      return;
    }
    out.textContent = `${fmt(sy - delta)} → ${fmt(ey + delta)}  (largeur ${ey - sy + 2 * delta} ans)`;
  } else {
    out.textContent = "—";
  }
}

function updateWherePromptPreview() {
  const preview = document.getElementById("wp-preview-text");
  if (!preview) return;
  const pre = document.getElementById("f-wp-pre")?.value ?? "";
  const verb = document.getElementById("f-wp-verb")?.value ?? "";
  const post = document.getElementById("f-wp-post")?.value ?? "";
  if (!pre && !verb && !post) {
    preview.textContent = "—";
    return;
  }
  preview.innerHTML =
    escapeHtml(pre) + "<strong>" + escapeHtml(verb) + "</strong>" + escapeHtml(post);
}

// Met à jour l'UI temporalité selon le tag courant : si "ponctuelle",
// startYear/endYear deviennent grisés (toujours éditables — Zod tolère null
// quand ponctuelle, exige les deux quand periodique).
// Le bouton "milieu" pour calculer pivotYear n'apparaît que pour periodique.
function updateTagDependentUI() {
  const tag = document.getElementById("f-tag")?.value;
  const isPeriodique = tag === "periodique";
  const sy = document.getElementById("f-startYear");
  const ey = document.getElementById("f-endYear");
  const syHint = document.getElementById("f-startYear-hint");
  const eyHint = document.getElementById("f-endYear-hint");
  const btnMid = document.getElementById("btn-pivot-midpoint");
  if (sy) sy.style.opacity = isPeriodique ? "1" : "0.5";
  if (ey) ey.style.opacity = isPeriodique ? "1" : "0.5";
  if (syHint) syHint.textContent = isPeriodique ? "(requis)" : "(null si ponctuelle)";
  if (eyHint) eyHint.textContent = isPeriodique ? "(requis)" : "(null si ponctuelle)";
  if (btnMid) btnMid.classList.toggle("hidden", !isPeriodique);
}

function valuesEqual(a, b) {
  if (typeof a === "number" && typeof b === "number") {
    return Math.abs(a - b) < 1e-9;
  }
  return a === b;
}

function readField(key, el) {
  if (
    key === "lat" || key === "lon" || key === "whereRadiusKm" ||
    key === "whenDelta" || key === "pivotYear"
  ) {
    const n = Number(el.value);
    return Number.isFinite(n) ? n : null;
  }
  if (key === "startYear" || key === "endYear") {
    if (el.value === "" || el.value == null) return null;
    const n = Number(el.value);
    return Number.isFinite(n) ? n : null;
  }
  return el.value;
}

function getBaseline(key) {
  const d = activeDetail;
  if (!d) return null;
  switch (key) {
    case "title": return d.title;
    case "blurb": return d.blurb;
    case "body": return d.body;
    case "imageLabel": return d.imageLabel;
    case "attribution": return d.attribution ?? "";
    case "sourcePageUrl": return d.sourcePageUrl ?? "";
    case "placeLabel": return d.placeLabel;
    case "timeDisplayLabel": return d.timeDisplayLabel;
    case "wp_pre": return d.wherePrompt?.pre ?? "";
    case "wp_verb": return d.wherePrompt?.verb ?? "";
    case "wp_post": return d.wherePrompt?.post ?? "";
    case "whenp_pre": return d.whenPrompt?.pre ?? "";
    case "whenp_verb": return d.whenPrompt?.verb ?? "";
    case "whenp_post": return d.whenPrompt?.post ?? "";
    case "lat": return d.place?.lat ?? null;
    case "lon": return d.place?.lon ?? null;
    case "whereRadiusKm": return d.gameplay?.whereRadiusKm ?? null;
    case "whenDelta": return d.gameplay?.whenDelta ?? null;
    case "tag": return d.time?.tag ?? "ponctuelle";
    case "timeKind": return d.time?.timeKind ?? "single_year";
    case "pivotYear": return d.time?.pivotYear ?? null;
    case "startYear": return d.time?.startYear ?? null;
    case "endYear": return d.time?.endYear ?? null;
    case "timeJustification": return d.time?.justification ?? "";
    default: return null;
  }
}

function validateField(key, v) {
  if (key === "title" && (typeof v !== "string" || v.length < 2 || v.length > 80))
    return "title 2-80";
  if (key === "blurb" && (typeof v !== "string" || v.length < 20 || v.length > 220))
    return "blurb 20-220";
  if (key === "body" && (typeof v !== "string" || v.length < 40 || v.length > 800))
    return "body 40-800";
  if (key === "imageLabel" && (typeof v !== "string" || v.length < 1 || v.length > 16))
    return "imageLabel 1-16";
  if (key === "lat" && (typeof v !== "number" || v < -90 || v > 90))
    return "lat -90..90";
  if (key === "lon" && (typeof v !== "number" || v < -180 || v > 180))
    return "lon -180..180";
  if (key === "whereRadiusKm" && (typeof v !== "number" || v <= 0 || !Number.isInteger(Math.round(v))))
    return "radius > 0";
  if (key === "whenDelta" && (typeof v !== "number" || v <= 0 || !Number.isInteger(Math.round(v))))
    return "whenDelta entier > 0";
  if (key === "pivotYear" && (typeof v !== "number" || !Number.isInteger(Math.round(v))))
    return "pivotYear entier requis";
  if ((key === "startYear" || key === "endYear") && v !== null && typeof v === "number" && !Number.isInteger(Math.round(v)))
    return `${key} entier ou vide`;
  if (key === "timeJustification" && (typeof v !== "string" || v.length < 3))
    return "justification min 3 chars";
  return null;
}

function renderMetaForm(detail) {
  els.metaEmpty.classList.add("hidden");
  els.metaForm.classList.remove("hidden");

  // Read-only DD
  document.getElementById("meta-dexNum").textContent = detail.dexNum;
  document.getElementById("meta-cardId").textContent = detail.cardId;
  document.getElementById("meta-type").textContent = detail.type;
  document.getElementById("meta-era").textContent = detail.era;
  document.getElementById("meta-region").textContent =
    detail.regionLabel ? `${detail.region} — ${detail.regionLabel}` : String(detail.region);
  document.getElementById("meta-country").textContent =
    detail.countryName ?? detail.countryCode ?? "—";
  document.getElementById("meta-subjectKey").textContent = detail.subjectKey ?? "—";
  document.getElementById("meta-aliases").textContent =
    (detail.aliases?.length ?? 0) > 0 ? detail.aliases.join(", ") : "—";
  document.getElementById("meta-placeKind").textContent = detail.place?.placeKind ?? "—";
  document.getElementById("meta-placeCanonicalName").textContent =
    detail.place?.placeCanonicalName ?? "—";
  document.getElementById("meta-geoKind").textContent = detail.place?.geoKind ?? "—";
  document.getElementById("meta-difficultyWhen").textContent = detail.gameplay?.difficultyWhen ?? "—";
  document.getElementById("meta-difficultyWhere").textContent = detail.gameplay?.difficultyWhere ?? "—";
  document.getElementById("meta-eligibleForWhen").textContent =
    detail.gameplay?.eligibleForWhen ? "oui" : "non";
  document.getElementById("meta-eligibleForWhere").textContent =
    detail.gameplay?.eligibleForWhere ? "oui" : "non";
  document.getElementById("meta-status").textContent = detail.editorial?.status ?? "—";
  document.getElementById("meta-confidence").textContent = detail.editorial?.confidence ?? "—";
  document.getElementById("meta-contentVersion").textContent = detail.editorial?.contentVersion ?? "—";
  document.getElementById("meta-sourcesCount").textContent = detail.editorial?.sourcesCount ?? "—";

  const warningsEl = document.getElementById("meta-warnings");
  if (detail.editorial?.warnings?.length > 0) {
    warningsEl.innerHTML =
      "<strong>Warnings :</strong><ul>" +
      detail.editorial.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("") +
      "</ul>";
  } else {
    warningsEl.innerHTML = "";
  }

  // Inputs édition
  setInput("f-title", detail.title);
  setInput("f-blurb", detail.blurb);
  setInput("f-body", detail.body);
  setInput("f-imageLabel", detail.imageLabel);
  setInput("f-attribution", detail.attribution ?? "");
  setInput("f-sourcePageUrl", detail.sourcePageUrl ?? "");
  setInput("f-placeLabel", detail.placeLabel);
  setInput("f-timeDisplayLabel", detail.timeDisplayLabel);
  setInput("f-wp-pre", detail.wherePrompt?.pre ?? "");
  setInput("f-wp-verb", detail.wherePrompt?.verb ?? "");
  setInput("f-wp-post", detail.wherePrompt?.post ?? "");
  setInput("f-whenp-pre", detail.whenPrompt?.pre ?? "");
  setInput("f-whenp-verb", detail.whenPrompt?.verb ?? "");
  setInput("f-whenp-post", detail.whenPrompt?.post ?? "");
  updateWhenPromptPreview();
  updateWherePromptPreview();
  setInput("f-lat", detail.place?.lat ?? "");
  setInput("f-lon", detail.place?.lon ?? "");
  setInput("f-radius", detail.gameplay?.whereRadiusKm ?? "");
  setInput("f-whenDelta", detail.gameplay?.whenDelta ?? "");
  setInput("f-tag", detail.time?.tag ?? "ponctuelle");
  setInput("f-timeKind", detail.time?.timeKind ?? "single_year");
  setInput("f-pivotYear", detail.time?.pivotYear ?? "");
  setInput("f-startYear", detail.time?.startYear ?? "");
  setInput("f-endYear", detail.time?.endYear ?? "");
  setInput("f-timeJustification", detail.time?.justification ?? "");

  document.getElementById("f-blurb-count").textContent = (detail.blurb ?? "").length;
  document.getElementById("f-body-count").textContent = (detail.body ?? "").length;
  updateTagDependentUI();

  // Reset dirty/invalid markers
  for (const [id] of META_FIELDS) {
    document.getElementById(id)?.classList.remove("dirty", "invalid");
  }

  // Carte Leaflet
  ensureMap();
  const lat = detail.place?.lat ?? 0;
  const lon = detail.place?.lon ?? 0;
  const radiusKm = detail.gameplay?.whereRadiusKm ?? 300;
  if (mapMarker) {
    mapMarker.setLatLng([lat, lon]);
  }
  if (mapCircle) {
    mapCircle.setLatLng([lat, lon]);
    mapCircle.setRadius(radiusKm * 1000);
  }
  if (map) {
    setTimeout(() => {
      map.invalidateSize();
      if (mapCircle) map.fitBounds(mapCircle.getBounds(), { padding: [12, 12] });
    }, 50);
  }
  updateRadiusChipsActive();
  updateWhenDeltaChipsActive();
  updateWhenWindowPreview();
  updateWhenPromptPreWarn();
}

function setInput(id, v) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = v == null ? "" : String(v);
}

function updateRadiusChipsActive() {
  const v = Number(document.getElementById("f-radius").value);
  for (const chip of document.querySelectorAll(".radius-presets .chip[data-radius]")) {
    chip.classList.toggle("active", Number(chip.dataset.radius) === v);
  }
}

function updateWhenDeltaChipsActive() {
  const v = Number(document.getElementById("f-whenDelta").value);
  for (const chip of document.querySelectorAll(".when-delta-presets .chip[data-when-delta]")) {
    chip.classList.toggle("active", Number(chip.dataset.whenDelta) === v);
  }
}

// ───── Carte Leaflet (init paresseuse) ─────────────────────────────────
function ensureMap() {
  if (map) return;
  if (typeof window.L === "undefined") {
    console.warn("Leaflet pas chargé");
    return;
  }
  map = window.L.map("map-wrap", {
    zoomControl: true,
    attributionControl: false,
  }).setView([20, 0], 2);
  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "© OpenStreetMap",
  }).addTo(map);
  mapCircle = window.L.circle([0, 0], {
    radius: 100000,
    color: "#b6502a",
    weight: 1.5,
    fillColor: "#b6502a",
    fillOpacity: 0.12,
  }).addTo(map);
  mapMarker = window.L.marker([0, 0], { draggable: true }).addTo(map);
  mapMarker.on("drag", () => {
    const ll = mapMarker.getLatLng();
    if (mapCircle) mapCircle.setLatLng(ll);
    const lat = round4(ll.lat);
    const lon = round4(ll.lng);
    const latInp = document.getElementById("f-lat");
    const lonInp = document.getElementById("f-lon");
    latInp.value = String(lat);
    lonInp.value = String(lon);
    onMetaFieldChange("lat", latInp);
    onMetaFieldChange("lon", lonInp);
  });
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

function updateMapMarker() {
  if (!map || !mapMarker) return;
  const lat = Number(document.getElementById("f-lat").value);
  const lon = Number(document.getElementById("f-lon").value);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return;
  mapMarker.setLatLng([lat, lon]);
  if (mapCircle) mapCircle.setLatLng([lat, lon]);
}

function updateMapCircle() {
  if (!mapCircle) return;
  const r = Number(document.getElementById("f-radius").value);
  if (!Number.isFinite(r) || r <= 0) return;
  mapCircle.setRadius(r * 1000);
}

// ───── Save métadonnées ────────────────────────────────────────────────
async function saveMetadata() {
  if (Object.keys(metaPending).length === 0) return;

  // Split card vs source
  const cardBody = {};
  const sourceBody = {};
  let hasWherePrompt = false;
  const wherePrompt = {};
  let hasWhenPrompt = false;
  const whenPrompt = {};

  for (const [, key, kind] of META_FIELDS) {
    if (!(key in metaPending)) continue;
    const v = metaPending[key];
    if (kind === "source") {
      sourceBody[key] = v;
      continue;
    }
    if (key === "wp_pre") { wherePrompt.pre = v; hasWherePrompt = true; continue; }
    if (key === "wp_verb") { wherePrompt.verb = v; hasWherePrompt = true; continue; }
    if (key === "wp_post") { wherePrompt.post = v; hasWherePrompt = true; continue; }
    if (key === "whenp_pre") { whenPrompt.pre = v; hasWhenPrompt = true; continue; }
    if (key === "whenp_verb") { whenPrompt.verb = v; hasWhenPrompt = true; continue; }
    if (key === "whenp_post") { whenPrompt.post = v; hasWhenPrompt = true; continue; }
    cardBody[key] = v;
  }
  if (hasWherePrompt) cardBody.wherePrompt = wherePrompt;
  if (hasWhenPrompt) cardBody.whenPrompt = whenPrompt;

  els.btnSaveMeta.disabled = true;
  try {
    let allOk = true;

    let invariantWarnings = [];
    let invariantErrors = [];
    if (Object.keys(cardBody).length > 0) {
      const res = await fetch(`/api/cards/${activeDexNum}/metadata`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cardBody),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const issues = data.issues
          ? data.issues.map((e) => `${e.path}: ${e.message}`).join(" · ")
          : data.error ?? "Échec";
        toast(`Métadonnées : ${issues}`, true);
        allOk = false;
      } else {
        const data = await res.json().catch(() => ({}));
        invariantWarnings = data.invariantWarnings ?? [];
        invariantErrors = data.invariantErrors ?? [];
      }
    }

    if (Object.keys(sourceBody).length > 0) {
      // sourcePageUrl vide → null
      if (sourceBody.sourcePageUrl === "") sourceBody.sourcePageUrl = null;
      const res = await fetch(`/api/cards/${activeDexNum}/source-meta`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sourceBody),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast(data.error ?? "Échec source-meta", true);
        allOk = false;
      }
    }

    if (allOk) {
      // Recharge le détail proprement.
      const fresh = await fetch(`/api/cards/${activeDexNum}`).then((r) => r.json());
      activeDetail = fresh;
      metaPending = {};
      renderMetaForm(fresh);
      // MAJ aussi le bandeau header pour attribution
      const metaParts = [];
      if (fresh.attribution) metaParts.push(escapeHtml(fresh.attribution));
      if (fresh.sourcePageUrl) {
        metaParts.push(
          `<a href="${escapeAttr(fresh.sourcePageUrl)}" target="_blank" rel="noopener">Source ↗</a>`,
        );
      }
      els.meta.innerHTML = metaParts.join(" · ");
      els.title.textContent = `${fresh.dexNum} · ${fresh.title}`;
      // MAJ liste si title a changé
      const inList = cards.find((c) => c.dexNum === activeDexNum);
      if (inList && inList.title !== fresh.title) {
        await refreshActiveInList();
      }
      // Affiche les invariants en plus du toast succès.
      if (invariantErrors.length > 0) {
        toast(
          `Sauvé MAIS invariant ${invariantErrors[0].rule} : ${invariantErrors[0].message}`,
          true,
        );
      } else if (invariantWarnings.length > 0) {
        toast(
          `Sauvé · warning ${invariantWarnings[0].rule} : ${invariantWarnings[0].message}`,
        );
      } else {
        toast("Métadonnées enregistrées");
      }
    }
  } catch (err) {
    toast(err.message, true);
  } finally {
    els.btnSaveMeta.disabled = Object.keys(metaPending).length === 0;
  }
}

// ───── Modal upload ────────────────────────────────────────────────────
function bindUploadModal() {
  els.btnCloseUpload.addEventListener("click", closeUploadModal);
  els.btnUploadCancel.addEventListener("click", closeUploadModal);
  els.btnUploadGo.addEventListener("click", doUpload);
  els.dropZone.addEventListener("click", () => els.uploadFile.click());
  els.uploadFile.addEventListener("change", () => {
    const f = els.uploadFile.files?.[0];
    if (f) setUploadFile(f);
  });
  els.dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    els.dropZone.classList.add("drag-over");
  });
  els.dropZone.addEventListener("dragleave", () => {
    els.dropZone.classList.remove("drag-over");
  });
  els.dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    els.dropZone.classList.remove("drag-over");
    const f = e.dataTransfer?.files?.[0];
    if (f) setUploadFile(f);
  });
}

function openUploadModal() {
  if (!activeDexNum) return;
  pendingUploadFile = null;
  els.uploadFile.value = "";
  els.uploadAttribution.value = activeDetail?.attribution ?? "";
  els.uploadSourcePageUrl.value = activeDetail?.sourcePageUrl ?? "";
  els.uploadPreview.classList.add("hidden");
  els.btnUploadGo.disabled = true;
  els.uploadModal.classList.remove("hidden");
}

function closeUploadModal() {
  els.uploadModal.classList.add("hidden");
}

function setUploadFile(file) {
  if (!file.type.startsWith("image/")) {
    toast(`Type non supporté : ${file.type}`, true);
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    toast(`Fichier trop gros : ${(file.size / 1024 / 1024).toFixed(1)} MB > 10 MB`, true);
    return;
  }
  pendingUploadFile = file;
  els.uploadPreviewName.textContent = `${file.name} · ${(file.size / 1024).toFixed(0)} KB`;
  els.uploadPreviewImg.src = URL.createObjectURL(file);
  els.uploadPreview.classList.remove("hidden");
  els.btnUploadGo.disabled = false;
}

async function doUpload() {
  if (!pendingUploadFile || !activeDexNum) return;
  const fd = new FormData();
  fd.append("file", pendingUploadFile);
  if (els.uploadAttribution.value) fd.append("attribution", els.uploadAttribution.value);
  if (els.uploadSourcePageUrl.value) fd.append("sourcePageUrl", els.uploadSourcePageUrl.value);

  els.btnUploadGo.disabled = true;
  els.btnUploadGo.textContent = "Upload…";
  try {
    const res = await fetch(`/api/cards/${activeDexNum}/upload`, {
      method: "POST",
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(data.error ?? "Échec upload", true);
      return;
    }
    closeUploadModal();
    pendingUploadFile = null;
    metaPending = {};
    await selectCard(activeDexNum);
    await refreshActiveInList();
    showPushBanner();
    toast("Image remplacée — re-crop nécessaire");
  } catch (err) {
    toast(err.message, true);
  } finally {
    els.btnUploadGo.disabled = false;
    els.btnUploadGo.textContent = "Uploader & remplacer";
  }
}

boot();
