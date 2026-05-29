// -------------------------------------------------------------
// Smart PDF Multi-Tool Pro - Core Controller & Compile Engine
// -------------------------------------------------------------

// Configure PDF.js global worker path explicitly from stable CDN
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";

// Active State
const state = {
  workspaceMode: "merge", // "merge" vs "split"
  
  // Merge mode states
  mergeFilesList: [], // Array of { name, size, bytes }
  
  // Split mode states
  splitFileBytes: null,
  splitFileName: "document.pdf",
  splitTotalPages: 0,
  selectedPages: [], // 0-indexed array of checked page numbers
  
  // General parameters
  stampPageNumbers: false,
  isProcessing: false
};

// DOM References
let elPresetCards, elDropZone, elFileInput, elFilesListPanel, elFilesListGrid;
let elSectionSplitSettings, elRangePageInput, elCheckStampNumbers;
let elEditorPlaceholder, elPagesGrid, elProcessingOverlay, elBtnReset;
let elSplitActionsBar, elBtnDeselectAll, elBtnExtractSelected, elBtnMergeCompile;
let elDocumentStatusBadge, elWorkspaceTitleText, elDropText, elDropSub;

document.addEventListener("DOMContentLoaded", () => {
  cacheDomElements();
  bindEventHandlers();
});

function cacheDomElements() {
  elPresetCards = document.querySelectorAll(".preset-card");
  elDropZone = document.getElementById("drop-zone");
  elFileInput = document.getElementById("file-input");
  elFilesListPanel = document.getElementById("files-list-panel");
  elFilesListGrid = document.getElementById("files-list-grid");
  
  elSectionSplitSettings = document.getElementById("section-split-settings");
  elRangePageInput = document.getElementById("range-page-input");
  elCheckStampNumbers = document.getElementById("check-stamp-numbers");
  
  elEditorPlaceholder = document.getElementById("editor-placeholder");
  elPagesGrid = document.getElementById("pages-grid-viewport");
  elProcessingOverlay = document.getElementById("processing-overlay");
  elBtnReset = document.getElementById("btn-reset");
  
  elSplitActionsBar = document.getElementById("split-actions-bar");
  elBtnDeselectAll = document.getElementById("btn-deselect-all");
  elBtnExtractSelected = document.getElementById("btn-extract-selected");
  elBtnMergeCompile = document.getElementById("btn-merge-compile");
  
  elDocumentStatusBadge = document.getElementById("document-status-badge");
  elWorkspaceTitleText = document.getElementById("workspace-title-text");
  elDropText = document.getElementById("drop-text");
  elDropSub = document.getElementById("drop-sub");
}

function bindEventHandlers() {
  // Mode selectors
  elPresetCards.forEach(card => {
    card.addEventListener("click", () => {
      elPresetCards.forEach(c => c.classList.remove("active"));
      card.classList.add("active");
      
      const mode = card.dataset.mode;
      handleWorkspaceModeChange(mode);
    });
  });

  // Drag and Drop PDF
  elDropZone.addEventListener("click", () => elFileInput.click());
  elFileInput.addEventListener("change", handleFileSelect);
  
  elDropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    elDropZone.classList.add("dragover");
  });
  
  elDropZone.addEventListener("dragleave", () => {
    elDropZone.classList.remove("dragover");
  });
  
  elDropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    elDropZone.classList.remove("dragover");
    if (e.dataTransfer.files.length > 0) {
      elFileInput.files = e.dataTransfer.files;
      handleFileSelect();
    }
  });

  // Stamp number toggles
  elCheckStampNumbers.addEventListener("change", (e) => {
    state.stampPageNumbers = e.target.checked;
  });

  // Text range inputs
  elRangePageInput.addEventListener("input", handleTextRangeInput);

  // General Actions
  elBtnReset.addEventListener("click", resetWorkspace);
  elBtnDeselectAll.addEventListener("click", deselectAllPages);
  elBtnExtractSelected.addEventListener("click", executeSplitExtraction);
  elBtnMergeCompile.addEventListener("click", executeMergeCompilation);
}

// --- Workspace Mode Managers ---
function handleWorkspaceModeChange(mode) {
  state.workspaceMode = mode;
  resetWorkspace();

  if (mode === "merge") {
    elWorkspaceTitleText.textContent = "Merged PDF Document Studio";
    elDropText.innerHTML = `Drag & drop PDFs here or <span class="highlight">browse</span>`;
    elDropSub.textContent = "Select multiple files for Merge mode";
    elFileInput.multiple = true;
    
    elFilesListPanel.style.display = "flex";
    elSectionSplitSettings.style.display = "none";
    
    elSplitActionsBar.style.display = "none";
    elBtnMergeCompile.style.display = "block";
    
    elPagesGrid.style.display = "none";
    elEditorPlaceholder.style.display = "flex";
    document.getElementById("placeholder-text").textContent = "Drag multiple PDF files into the left panel to arrange, compile, and merge them completely offline.";
  } else {
    elWorkspaceTitleText.textContent = "Visual PDF Page Organizer Studio";
    elDropText.innerHTML = `Drag & drop PDF here or <span class="highlight">browse</span>`;
    elDropSub.textContent = "Select a single document to split and prune pages";
    elFileInput.multiple = false;
    
    elFilesListPanel.style.display = "none";
    elSectionSplitSettings.style.display = "block";
    
    elSplitActionsBar.style.display = "flex";
    elBtnMergeCompile.style.display = "none";
    
    elPagesGrid.style.display = "grid";
    elEditorPlaceholder.style.display = "flex";
    document.getElementById("placeholder-text").textContent = "Upload a single PDF document in the left panel to render and prune pages visually.";
  }
}

function resetWorkspace() {
  state.mergeFilesList = [];
  state.splitFileBytes = null;
  state.splitTotalPages = 0;
  state.selectedPages = [];
  elFileInput.value = "";
  elRangePageInput.value = "";
  
  elBtnReset.disabled = true;
  elBtnMergeCompile.disabled = true;
  
  elFilesListGrid.innerHTML = "";
  elFilesListPanel.style.display = state.workspaceMode === "merge" ? "flex" : "none";
  
  elPagesGrid.innerHTML = "";
  elPagesGrid.style.display = state.workspaceMode === "split" ? "grid" : "none";
  
  elEditorPlaceholder.style.display = "flex";
  
  elDocumentStatusBadge.textContent = "No Document Loaded";
  elDocumentStatusBadge.className = "badge";
}

// --- Loaded files parsers ---
function handleFileSelect() {
  const files = elFileInput.files;
  if (files.length === 0) return;

  if (state.workspaceMode === "merge") {
    // --- MERGE MODE: Decode multiple files ---
    elProcessingOverlay.style.display = "flex";
    
    let loadedCount = 0;
    const targets = Array.from(files).filter(f => f.type === "application/pdf");

    if (targets.length === 0) {
      alert("Unsupported Format: Please upload only PDF files.");
      elProcessingOverlay.style.display = "none";
      return;
    }

    targets.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        state.mergeFilesList.push({
          name: file.name,
          size: file.size,
          bytes: e.target.result // ArrayBuffer
        });
        
        loadedCount++;
        if (loadedCount === targets.length) {
          elProcessingOverlay.style.display = "none";
          renderMergeFilesListUI();
        }
      };
      reader.readAsArrayBuffer(file);
    });
  } else {
    // --- SPLIT MODE: Decode a single file visually ---
    const file = files[0];
    if (file.type !== "application/pdf") {
      alert("Unsupported Format: Please upload a PDF file.");
      return;
    }

    state.splitFileName = file.name;
    elProcessingOverlay.style.display = "flex";

    const reader = new FileReader();
    reader.onload = (e) => {
      state.splitFileBytes = e.target.result; // ArrayBuffer
      
      // Call PDF.js to render page previews visually
      rasterizePdfPagesVisually(e.target.result);
    };
    reader.readAsArrayBuffer(file);
  }
}

// --- Render Loaded Files list UI (Merge Mode) ---
function renderMergeFilesListUI() {
  elFilesListGrid.innerHTML = "";
  
  if (state.mergeFilesList.length === 0) {
    elFilesListPanel.style.display = "none";
    elBtnMergeCompile.disabled = true;
    elBtnReset.disabled = true;
    return;
  }

  elFilesListPanel.style.display = "flex";
  elEditorPlaceholder.style.display = "none";
  elBtnReset.disabled = false;
  elBtnMergeCompile.disabled = false;

  state.mergeFilesList.forEach((file, index) => {
    const item = document.createElement("div");
    item.className = "file-list-item";
    
    // File details
    const info = document.createElement("div");
    info.className = "file-info";
    info.innerHTML = `
      <strong>${file.name}</strong>
      <span>${(file.size / 1024).toFixed(1)} KB</span>
    `;
    item.appendChild(info);

    // Reorder arrow action controls
    const actions = document.createElement("div");
    actions.className = "file-actions";
    
    const upBtn = document.createElement("button");
    upBtn.className = "reorder-btn";
    upBtn.textContent = "▲";
    upBtn.disabled = index === 0;
    upBtn.addEventListener("click", () => swapMergeFilesOrder(index, index - 1));
    
    const downBtn = document.createElement("button");
    downBtn.className = "reorder-btn";
    downBtn.textContent = "▼";
    downBtn.disabled = index === state.mergeFilesList.length - 1;
    downBtn.addEventListener("click", () => swapMergeFilesOrder(index, index + 1));

    const removeBtn = document.createElement("button");
    removeBtn.className = "btn-remove-file";
    removeBtn.textContent = "❌";
    removeBtn.addEventListener("click", () => removeMergeFileItem(index));

    actions.appendChild(upBtn);
    actions.appendChild(downBtn);
    actions.appendChild(removeBtn);
    
    item.appendChild(actions);
    elFilesListGrid.appendChild(item);
  });

  // Update status badge
  elDocumentStatusBadge.textContent = `${state.mergeFilesList.length} Files Loaded`;
  elDocumentStatusBadge.className = "badge";
}

function swapMergeFilesOrder(i1, i2) {
  const temp = state.mergeFilesList[i1];
  state.mergeFilesList[i1] = state.mergeFilesList[i2];
  state.mergeFilesList[i2] = temp;
  renderMergeFilesListUI();
}

function removeMergeFileItem(index) {
  state.mergeFilesList.splice(index, 1);
  renderMergeFilesListUI();
}

// --- Render Visual Page Previews UI (Split Mode) ---
function rasterizePdfPagesVisually(pdfBytes) {
  elPagesGrid.innerHTML = "";
  state.selectedPages = [];
  elRangePageInput.value = "";

  // Call PDF.js core loaders
  pdfjsLib.getDocument({ data: pdfBytes }).promise
    .then(async (pdf) => {
      state.splitTotalPages = pdf.numPages;
      elDocumentStatusBadge.textContent = `${pdf.numPages} Pages Loaded`;
      elDocumentStatusBadge.className = "badge";
      
      elEditorPlaceholder.style.display = "none";
      elPagesGrid.style.display = "grid";
      elBtnReset.disabled = false;

      // Loop and draw all thumbnails asynchronously
      for (let i = 1; i <= pdf.numPages; i++) {
        const pageCard = document.createElement("div");
        pageCard.className = "page-thumbnail-card";
        pageCard.dataset.pageIndex = i - 1;
        
        // Thumbnail structure
        pageCard.innerHTML = `
          <div class="page-badge">Page ${i}</div>
          <div class="page-checkbox">✓</div>
          <canvas id="page-canvas-${i}"></canvas>
        `;
        elPagesGrid.appendChild(pageCard);

        // Bind interactive selection clicks
        pageCard.addEventListener("click", () => togglePageCardSelection(i - 1));

        // Render PDF page onto canvas
        const page = await pdf.getPage(i);
        const canvas = document.getElementById(`page-canvas-${i}`);
        const context = canvas.getContext("2d");
        
        // Downscale thumbnails to render fast and sharp
        const viewport = page.getViewport({ scale: 0.35 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({
          canvasContext: context,
          viewport: viewport
        }).promise;
      }

      elProcessingOverlay.style.display = "none";
    })
    .catch(err => {
      console.error("PDF.js load failed.", err);
      alert("Error: Failed to decode pages visually.");
      elProcessingOverlay.style.display = "none";
      resetWorkspace();
    });
}

function togglePageCardSelection(index) {
  const card = elPagesGrid.querySelector(`[data-page-index="${index}"]`);
  if (!card) return;

  const idx = state.selectedPages.indexOf(index);
  if (idx === -1) {
    state.selectedPages.push(index);
    card.classList.add("checked");
  } else {
    state.selectedPages.splice(idx, 1);
    card.classList.remove("checked");
  }

  // Sort indices chronologically
  state.selectedPages.sort((a, b) => a - b);
  
  // Re-write range selector textbox to match active clicks
  updateRangeInputTextFromClicks();
}

function deselectAllPages() {
  state.selectedPages = [];
  elRangePageInput.value = "";
  
  const cards = elPagesGrid.querySelectorAll(".page-thumbnail-card");
  cards.forEach(c => c.classList.remove("checked"));
}

function updateRangeInputTextFromClicks() {
  if (state.selectedPages.length === 0) {
    elRangePageInput.value = "";
    return;
  }

  // Compile individual elements into standard range blocks: e.g. [0,1,2,4] -> "1-3, 5"
  const ranges = [];
  let start = state.selectedPages[0];
  let prev = start;

  for (let i = 1; i < state.selectedPages.length; i++) {
    const curr = state.selectedPages[i];
    if (curr === prev + 1) {
      prev = curr;
    } else {
      ranges.push(start === prev ? `${start + 1}` : `${start + 1}-${prev + 1}`);
      start = curr;
      prev = curr;
    }
  }
  ranges.push(start === prev ? `${start + 1}` : `${start + 1}-${prev + 1}`);

  elRangePageInput.value = ranges.join(", ");
}

// Map manual range text entries back to click highlights
function handleTextRangeInput() {
  if (state.splitTotalPages === 0) return;

  const text = elRangePageInput.value;
  const parsed = parsePageRangeString(text, state.splitTotalPages);
  
  // Update state selected pages
  state.selectedPages = parsed;

  // Re-render card highlights
  const cards = elPagesGrid.querySelectorAll(".page-thumbnail-card");
  cards.forEach((card, index) => {
    if (state.selectedPages.includes(index)) {
      card.classList.add("checked");
    } else {
      card.classList.remove("checked");
    }
  });
}

function parsePageRangeString(str, maxPages) {
  const pages = new Set();
  const parts = str.split(",");
  
  for (const part of parts) {
    const trim = part.trim();
    if (trim.includes("-")) {
      const bounds = trim.split("-").map(Number);
      const start = bounds[0];
      const end = bounds[1];
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = Math.max(1, start); i <= Math.min(maxPages, end); i++) {
          pages.add(i - 1); // 0-indexed
        }
      }
    } else {
      const num = Number(trim);
      if (!isNaN(num) && num >= 1 && num <= maxPages) {
        pages.add(num - 1);
      }
    }
  }
  return Array.from(pages).sort((a, b) => a - b);
}

// --- Dynamic PDF compiling and processing actions ---

// 1. Merge Mode: Concatenate multiple loaded PDF file buffers
async function executeMergeCompilation() {
  if (state.mergeFilesList.length === 0) return;

  elProcessingOverlay.style.display = "flex";
  document.querySelector("#processing-overlay h3").textContent = "Merging document bytes...";
  document.querySelector("#processing-overlay p").textContent = "Creating fresh PDF layout and copying structures...";

  setTimeout(async () => {
    try {
      const mergedPdf = await PDFLib.PDFDocument.create();

      // Loop and import arrays
      for (const file of state.mergeFilesList) {
        const doc = await PDFLib.PDFDocument.load(file.bytes);
        const copied = await mergedPdf.copyPages(doc, doc.getPageIndices());
        copied.forEach(page => mergedPdf.addPage(page));
      }

      // Stamp page numbers if checked
      if (state.stampPageNumbers) {
        await stampPageNumbersOnDocument(mergedPdf);
      }

      const mergedPdfBytes = await mergedPdf.save();
      const pdfBlob = new Blob([mergedPdfBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(pdfBlob);

      // Trigger download
      const link = document.createElement("a");
      link.href = url;
      link.download = "merged_presentation.pdf";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      document.getElementById("document-status-badge").textContent = "PDF Merged!";
      document.getElementById("document-status-badge").className = "badge green";

    } catch (err) {
      console.error("PDF Merge failed.", err);
      alert("Merge Error: Incompatible file vectors or structures.");
    } finally {
      elProcessingOverlay.style.display = "none";
    }
  }, 100);
}

// 2. Split Mode: Extract selected page numbers from source document
function executeSplitExtraction() {
  if (!state.splitFileBytes || state.selectedPages.length === 0) {
    alert("Pruner Info: Please select at least one page card to extract.");
    return;
  }

  elProcessingOverlay.style.display = "flex";
  document.querySelector("#processing-overlay h3").textContent = "Extracting pages...";
  document.querySelector("#processing-overlay p").textContent = "Pruning source trees and compiling new PDF slices...";

  setTimeout(async () => {
    try {
      const srcDoc = await PDFLib.PDFDocument.load(state.splitFileBytes);
      const splitPdf = await PDFLib.PDFDocument.create();

      // Copy checked indices
      const copied = await splitPdf.copyPages(srcDoc, state.selectedPages);
      copied.forEach(page => splitPdf.addPage(page));

      // Stamp page numbers if checked
      if (state.stampPageNumbers) {
        await stampPageNumbersOnDocument(splitPdf);
      }

      const splitBytes = await splitPdf.save();
      const pdfBlob = new Blob([splitBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(pdfBlob);

      // Format naming convention
      const baseName = state.splitFileName.substring(0, state.splitFileName.lastIndexOf(".")) || "split";
      const downloadName = `${baseName}_pruned.pdf`;

      const link = document.createElement("a");
      link.href = url;
      link.download = downloadName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      document.getElementById("document-status-badge").textContent = "Pages Extracted!";
      document.getElementById("document-status-badge").className = "badge green";

      deselectAllPages();

    } catch (err) {
      console.error("PDF Split failed.", err);
      alert("Split Error: Extraction failed.");
    } finally {
      elProcessingOverlay.style.display = "none";
    }
  }, 100);
}

// Helper: Stamping page numbers using Helvetica fonts centered at the bottom of pages
async function stampPageNumbersOnDocument(pdfDoc) {
  const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const { width, height } = page.getSize();
    
    // Draw centered footers
    const text = `Page ${i + 1} of ${pages.length}`;
    const fontSize = 10;
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    
    page.drawText(text, {
      x: width / 2 - textWidth / 2,
      y: 20,
      size: fontSize,
      font: font,
      color: PDFLib.rgb(0.39, 0.4, 0.95) // Beautiful solid Indigo!
    });
  }
}
