/* ===================================================================
   LearnMap AI — Front-end Application
   =================================================================== */

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const state = {
  currentDocId: null,
  currentDocTitle: "",
  root: null,          // d3-hierarchy root
  svg: null,
  g: null,             // <g> that holds the tree inside the svg
  zoom: null,
  nodeId: 0,
  selectedNode: null,
};

const BRANCH_COLORS = [
  "#6366f1", "#ec4899", "#14b8a6", "#f59e0b",
  "#8b5cf6", "#06b6d4", "#ef4444", "#10b981",
  "#d946ef", "#0ea5e9", "#f97316", "#84cc16",
];
const DURATION = 420;

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  setupUpload();
  setupToolbar();
  loadDocuments();
  loadModels();
  createTooltip();
});

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------
function setupUpload() {
  const area = document.getElementById("upload-area");
  const input = document.getElementById("file-input");

  area.addEventListener("click", () => input.click());

  // Drag & drop
  area.addEventListener("dragover", (e) => { e.preventDefault(); area.classList.add("drag-over"); });
  area.addEventListener("dragleave", () => area.classList.remove("drag-over"));
  area.addEventListener("drop", (e) => {
    e.preventDefault();
    area.classList.remove("drag-over");
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });

  input.addEventListener("change", () => {
    if (input.files.length) handleFile(input.files[0]);
    input.value = "";
  });
}

async function handleFile(file) {
  const allowed = ["pdf", "docx", "doc", "txt"];
  const ext = file.name.split(".").pop().toLowerCase();
  if (!allowed.includes(ext)) {
    showToast("Unsupported file type. Use PDF, DOCX, or TXT.", "error");
    return;
  }

  showLoading("Uploading & analysing document…");

  const form = new FormData();
  form.append("file", file);
  form.append("model", getSelectedModel());

  try {
    const res = await fetch("/upload", { method: "POST", body: form });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { throw new Error(`Server error (${res.status}). The PDF may be too large or unreadable.`); }
    if (!res.ok) throw new Error(data.error || "Upload failed");

    showToast(`"${data.filename}" processed successfully!`, "success");
    await loadDocuments();
    activateDocument(data.id, data.filename, data.mindMap);
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    hideLoading();
  }
}

// ---------------------------------------------------------------------------
// Model selector
// ---------------------------------------------------------------------------
function getSelectedModel() {
  return document.getElementById("model-select").value;
}

async function loadModels() {
  try {
    const res = await fetch("/models");
    const data = await res.json();
    const select = document.getElementById("model-select");
    select.innerHTML = "";
    data.models.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = m.name;
      if (!m.available) {
        opt.disabled = true;
        opt.textContent += " (not configured)";
      }
      if (m.id === data.default) opt.selected = true;
      select.appendChild(opt);
    });
  } catch {
    /* keep defaults */
  }
}

// ---------------------------------------------------------------------------
// Documents list
// ---------------------------------------------------------------------------
async function loadDocuments() {
  try {
    const res = await fetch("/documents");
    const docs = await res.json();
    renderDocList(docs);
  } catch {
    /* silent */
  }
}

function renderDocList(docs) {
  const list = document.getElementById("documents-list");
  if (!docs.length) {
    list.innerHTML = '<p class="empty-hint">No documents yet — upload one above!</p>';
    return;
  }

  list.innerHTML = docs
    .map(
      (d) => `
    <div class="doc-item${d.id === state.currentDocId ? " active" : ""}"
         data-id="${d.id}" data-name="${d.filename}">
      <i class="fas fa-file-alt doc-icon"></i>
      <div class="doc-info">
        <div class="doc-name" title="${d.filename}">${d.filename}</div>
        <div class="doc-date">${new Date(d.uploadDate).toLocaleDateString()}</div>
      </div>
      <button class="doc-delete" title="Delete" data-id="${d.id}">
        <i class="fas fa-trash-alt"></i>
      </button>
    </div>`
    )
    .join("");

  // Click handlers
  list.querySelectorAll(".doc-item").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest(".doc-delete")) return;
      selectDocument(el.dataset.id, el.dataset.name);
    });
  });

  list.querySelectorAll(".doc-delete").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteDocument(btn.dataset.id);
    });
  });
}

async function selectDocument(docId, docName) {
  if (docId === state.currentDocId) return;
  showLoading("Loading mind map…");
  try {
    const res = await fetch(`/mindmap/${docId}`);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { throw new Error(`Server error (${res.status}).`); }
    if (!res.ok) throw new Error(data.error || "Failed to load");
    activateDocument(data.id, data.filename, data.mindMap);
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    hideLoading();
  }
}

async function deleteDocument(docId) {
  if (!confirm("Delete this document and its mind map?")) return;
  try {
    await fetch(`/document/${docId}`, { method: "DELETE" });
    if (state.currentDocId === docId) {
      state.currentDocId = null;
      document.getElementById("welcome-screen").classList.remove("hidden");
      document.getElementById("mindmap-container").classList.add("hidden");
      setToolbarButtons(false);
      document.getElementById("current-doc-title").textContent = "Select a document to begin";
    }
    await loadDocuments();
    showToast("Document deleted.", "success");
  } catch {
    showToast("Delete failed.", "error");
  }
}

// ---------------------------------------------------------------------------
// Activate document & render mind map
// ---------------------------------------------------------------------------
function activateDocument(docId, filename, mindmapData) {
  state.currentDocId = docId;
  state.currentDocTitle = filename;

  document.getElementById("current-doc-title").textContent = filename;
  document.getElementById("welcome-screen").classList.add("hidden");
  document.getElementById("mindmap-container").classList.remove("hidden");
  closeDetailPanel();

  // Mark active in sidebar
  document.querySelectorAll(".doc-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.id === docId);
  });

  setToolbarButtons(true);
  initMindmap(mindmapData);
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------
function setupToolbar() {
  document.getElementById("btn-zoom-fit").addEventListener("click", fitView);
  document.getElementById("btn-download").addEventListener("click", downloadPNG);
  document.getElementById("btn-expand-all").addEventListener("click", expandAll);
  document.getElementById("btn-collapse-all").addEventListener("click", collapseAll);
  document.getElementById("btn-close-panel").addEventListener("click", closeDetailPanel);
  document.getElementById("btn-explore-more").addEventListener("click", exploreMore);
  document.getElementById("btn-quiz").addEventListener("click", openQuiz);
  setupQuizModal();
}

function setToolbarButtons(enabled) {
  ["btn-zoom-fit", "btn-download", "btn-expand-all", "btn-collapse-all", "btn-quiz"].forEach((id) => {
    document.getElementById(id).disabled = !enabled;
  });
}

// ---------------------------------------------------------------------------
// Mind Map — D3 tree
// ---------------------------------------------------------------------------
function initMindmap(data) {
  const wrapper = document.getElementById("mindmap-wrapper");
  wrapper.innerHTML = "";
  state.nodeId = 0;
  state.selectedNode = null;

  const rect = wrapper.getBoundingClientRect();

  state.svg = d3.select(wrapper)
    .append("svg")
    .attr("width", rect.width)
    .attr("height", rect.height);

  // Defs (drop shadow)
  const defs = state.svg.append("defs");
  const filter = defs.append("filter").attr("id", "node-shadow").attr("x", "-20%").attr("y", "-20%").attr("width", "140%").attr("height", "140%");
  filter.append("feDropShadow").attr("dx", 0).attr("dy", 1).attr("stdDeviation", 2).attr("flood-opacity", 0.12);

  state.g = state.svg.append("g");

  // Zoom
  state.zoom = d3.zoom()
    .scaleExtent([0.1, 3])
    .on("zoom", (event) => state.g.attr("transform", event.transform));
  state.svg.call(state.zoom);

  // Build hierarchy
  state.root = d3.hierarchy(data);
  state.root.x0 = 0;
  state.root.y0 = 0;

  // Collapse beyond depth 1
  state.root.descendants().forEach((d) => {
    if (d.depth > 1 && d.children) {
      d._children = d.children;
      d.children = null;
    }
  });

  updateTree(state.root);

  // Fit after a tick
  requestAnimationFrame(() => fitView());
}

function updateTree(source) {
  const treeLayout = d3.tree().nodeSize([48, 300]);
  treeLayout(state.root);

  // Normalise horizontal spacing
  state.root.descendants().forEach((d) => (d.y = d.depth * 280));

  const nodes = state.root.descendants();
  const links = state.root.links();

  // ------------- LINKS -------------
  const link = state.g.selectAll("path.link-path").data(links, (d) => d.target.id || (d.target.id = ++state.nodeId));

  const linkEnter = link
    .enter()
    .insert("path", "g")
    .attr("class", "link-path")
    .attr("d", () => {
      const o = { x: source.x0, y: source.y0 };
      return diagonal(o, o);
    })
    .attr("stroke", (d) => getBranchColor(d.target))
    .attr("stroke-opacity", 0.35)
    .attr("stroke-width", (d) => Math.max(1.2, 3.5 - d.target.depth * 0.7));

  linkEnter.merge(link).transition().duration(DURATION)
    .attr("d", (d) => diagonal(d.source, d.target))
    .attr("stroke", (d) => getBranchColor(d.target));

  link.exit().transition().duration(DURATION)
    .attr("d", () => {
      const o = { x: source.x, y: source.y };
      return diagonal(o, o);
    })
    .remove();

  // ------------- NODES -------------
  const node = state.g.selectAll("g.node").data(nodes, (d) => d.id || (d.id = ++state.nodeId));

  const nodeEnter = node
    .enter()
    .append("g")
    .attr("class", "node")
    .attr("transform", `translate(${source.y0},${source.x0})`)
    .style("opacity", 0);

  // Circle
  nodeEnter
    .append("circle")
    .attr("class", "node-circle")
    .attr("r", (d) => nodeRadius(d))
    .attr("fill", (d) => getBranchColor(d))
    .attr("filter", "url(#node-shadow)")
    .on("click", (event, d) => onNodeClick(event, d))
    .on("mouseover", (event, d) => showTooltipFor(event, d))
    .on("mouseout", hideTooltipEl);

  // Label
  nodeEnter
    .append("text")
    .attr("class", "node-label")
    .attr("dy", "0.35em")
    .attr("x", (d) => (d.depth === 0 ? 0 : 18))
    .attr("text-anchor", (d) => (d.depth === 0 ? "middle" : "start"))
    .attr("font-size", (d) => (d.depth === 0 ? "15px" : d.depth === 1 ? "13px" : "12px"))
    .attr("font-weight", (d) => (d.depth <= 1 ? "600" : "400"))
    .text((d) => truncate(d.data.name, 32))
    .on("click", (event, d) => onNodeClick(event, d))
    .on("mouseover", (event, d) => showTooltipFor(event, d))
    .on("mouseout", hideTooltipEl);

  // Expand / collapse indicator
  nodeEnter
    .filter((d) => d.data.children && d.data.children.length > 0)
    .append("text")
    .attr("class", "node-toggle")
    .attr("dy", "0.35em")
    .attr("x", (d) => (d.depth === 0 ? 22 : -14))
    .attr("text-anchor", "middle")
    .text((d) => (d._children ? "+" : d.children ? "−" : ""))
    .on("click", (event, d) => {
      event.stopPropagation();
      toggleChildren(d);
    });

  // UPDATE
  const nodeUpdate = nodeEnter.merge(node);

  nodeUpdate.transition().duration(DURATION)
    .attr("transform", (d) => `translate(${d.y},${d.x})`)
    .style("opacity", 1);

  nodeUpdate.select("circle.node-circle")
    .attr("r", (d) => nodeRadius(d))
    .attr("fill", (d) => getBranchColor(d));

  nodeUpdate.select("text.node-toggle")
    .text((d) => (d._children ? "+" : d.children ? "−" : ""));

  // EXIT
  node.exit().transition().duration(DURATION)
    .attr("transform", `translate(${source.y},${source.x})`)
    .style("opacity", 0)
    .remove();

  // Stash positions
  nodes.forEach((d) => { d.x0 = d.x; d.y0 = d.y; });
}

function diagonal(s, t) {
  return `M ${s.y} ${s.x}
          C ${(s.y + t.y) / 2} ${s.x},
            ${(s.y + t.y) / 2} ${t.x},
            ${t.y} ${t.x}`;
}

// ---------------------------------------------------------------------------
// Node helpers
// ---------------------------------------------------------------------------
function nodeRadius(d) {
  if (d.depth === 0) return 14;
  if (d.depth === 1) return 9;
  return d.children || d._children ? 6 : 4;
}

function getBranchColor(d) {
  let n = d;
  while (n.depth > 1) n = n.parent;
  if (n.depth === 0) return "#1e293b";
  const idx = n.parent.children ? n.parent.children.indexOf(n) : 0;
  return BRANCH_COLORS[idx % BRANCH_COLORS.length];
}

function toggleChildren(d) {
  if (d.children) {
    d._children = d.children;
    d.children = null;
  } else if (d._children) {
    d.children = d._children;
    d._children = null;
  }
  updateTree(d);
}

function onNodeClick(event, d) {
  event.stopPropagation();

  // Toggle
  if (d.children || d._children) toggleChildren(d);

  // Select
  state.selectedNode = d;
  state.g.selectAll("circle.node-circle").classed("selected", false);
  d3.select(event.currentTarget.tagName === "circle" ? event.currentTarget : event.currentTarget.parentNode.querySelector("circle"))
    .classed("selected", true);

  showDetailPanel(d);
}

// Expand / collapse all
function expandAll() {
  state.root.descendants().forEach((d) => {
    if (d._children) { d.children = d._children; d._children = null; }
  });
  updateTree(state.root);
  setTimeout(fitView, DURATION + 50);
}

function collapseAll() {
  state.root.descendants().forEach((d) => {
    if (d.depth > 0 && d.children) { d._children = d.children; d.children = null; }
  });
  updateTree(state.root);
  setTimeout(fitView, DURATION + 50);
}

// ---------------------------------------------------------------------------
// Fit view
// ---------------------------------------------------------------------------
function fitView() {
  if (!state.g || !state.svg) return;
  const bounds = state.g.node().getBBox();
  if (!bounds.width) return;

  const svgEl = state.svg.node();
  const fullW = svgEl.clientWidth;
  const fullH = svgEl.clientHeight;

  const scale = 0.85 * Math.min(fullW / bounds.width, fullH / bounds.height);
  const tx = fullW / 2 - scale * (bounds.x + bounds.width / 2);
  const ty = fullH / 2 - scale * (bounds.y + bounds.height / 2);

  state.svg.transition().duration(600)
    .call(state.zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------
let tooltipEl;

function createTooltip() {
  tooltipEl = document.createElement("div");
  tooltipEl.className = "node-tooltip";
  document.body.appendChild(tooltipEl);
}

function showTooltipFor(event, d) {
  if (!d.data.summary) return;
  tooltipEl.textContent = d.data.summary;
  tooltipEl.classList.add("visible");

  const x = event.pageX + 14;
  const y = event.pageY - 10;
  tooltipEl.style.left = x + "px";
  tooltipEl.style.top = y + "px";
}

function hideTooltipEl() {
  tooltipEl.classList.remove("visible");
}

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------
function showDetailPanel(d) {
  const panel = document.getElementById("detail-panel");
  panel.classList.add("open");

  document.getElementById("detail-title").textContent = d.data.name;
  document.getElementById("detail-summary").textContent = d.data.summary || "No summary available.";
  document.getElementById("detail-extended").innerHTML = "";
}

function closeDetailPanel() {
  document.getElementById("detail-panel").classList.remove("open");
  state.g && state.g.selectAll("circle.node-circle").classed("selected", false);
}

async function exploreMore() {
  if (!state.selectedNode || !state.currentDocId) return;

  const btn = document.getElementById("btn-explore-more");
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating…';

  try {
    const res = await fetch("/node-details", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nodeName: state.selectedNode.data.name,
        nodeSummary: state.selectedNode.data.summary || "",
        documentId: state.currentDocId,
        model: getSelectedModel(),
      }),
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { throw new Error(`Server error (${res.status}).`); }
    if (!res.ok) throw new Error(data.error);

    document.getElementById("detail-extended").innerHTML = marked.parse(data.details);
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-magic"></i> Explore More with AI';
  }
}

// ---------------------------------------------------------------------------
// Download PNG
// ---------------------------------------------------------------------------
function downloadPNG() {
  if (!state.svg) return;
  const svgEl = state.svg.node();

  // Clone & inline styles
  const clone = svgEl.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  // Inline critical styles
  clone.querySelectorAll(".node-circle").forEach((c) => {
    c.style.stroke = "#fff";
    c.style.strokeWidth = "2.5";
  });
  clone.querySelectorAll(".link-path").forEach((p) => {
    p.style.fill = "none";
  });
  clone.querySelectorAll(".node-label").forEach((t) => {
    t.style.fontFamily = "Inter, system-ui, sans-serif";
  });

  // Get bounds
  const bounds = state.g.node().getBBox();
  const pad = 60;
  clone.setAttribute("viewBox", `${bounds.x - pad} ${bounds.y - pad} ${bounds.width + pad * 2} ${bounds.height + pad * 2}`);
  clone.setAttribute("width", bounds.width + pad * 2);
  clone.setAttribute("height", bounds.height + pad * 2);

  // Reset the <g> transform in clone
  const gClone = clone.querySelector("g");
  if (gClone) gClone.removeAttribute("transform");

  const svgData = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  const img = new Image();
  img.onload = () => {
    const scale = 2; // hi-res
    const canvas = document.createElement("canvas");
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, img.width, img.height);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);

    canvas.toBlob((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${state.currentDocTitle || "mindmap"}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    }, "image/png");
  };
  img.src = url;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function truncate(text, max) {
  return text && text.length > max ? text.substring(0, max) + "…" : text;
}

function showLoading(msg) {
  document.getElementById("loading-message").textContent = msg || "Processing…";
  document.getElementById("loading-overlay").classList.remove("hidden");
}

function hideLoading() {
  document.getElementById("loading-overlay").classList.add("hidden");
}

function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="fas fa-${type === "success" ? "check-circle" : type === "error" ? "exclamation-circle" : "info-circle"}"></i> ${message}`;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 300); }, 4000);
}

// ---------------------------------------------------------------------------
// Quiz
// ---------------------------------------------------------------------------
const quizState = { questions: [], answers: {}, submitted: false };

function setupQuizModal() {
  document.getElementById("btn-quiz-close").addEventListener("click", closeQuiz);
  document.getElementById("btn-quiz-regenerate").addEventListener("click", () => loadQuiz(true));
  document.getElementById("btn-quiz-submit").addEventListener("click", submitQuiz);
  document.getElementById("quiz-modal").addEventListener("click", (e) => {
    if (e.target.id === "quiz-modal") closeQuiz();
  });
}

function openQuiz() {
  if (!state.currentDocId) {
    showToast("Select a document first.", "warning");
    return;
  }
  document.getElementById("quiz-modal").classList.remove("hidden");
  loadQuiz(false);
}

function closeQuiz() {
  document.getElementById("quiz-modal").classList.add("hidden");
}

async function loadQuiz(regenerate) {
  const body = document.getElementById("quiz-body");
  const submitBtn = document.getElementById("btn-quiz-submit");
  const statusEl = document.getElementById("quiz-status");
  const numQuestions = parseInt(document.getElementById("quiz-num-questions").value, 10) || 5;

  quizState.questions = [];
  quizState.answers = {};
  quizState.submitted = false;
  submitBtn.disabled = true;
  statusEl.className = "quiz-status";
  statusEl.textContent = "";
  body.innerHTML = `<div class="quiz-loading"><div class="spinner" style="margin: 0 auto 12px;"></div>Generating ${numQuestions} quiz questions…</div>`;

  try {
    const res = await fetch("/quiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId: state.currentDocId,
        numQuestions: numQuestions,
        model: getSelectedModel(),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to generate quiz");

    quizState.questions = data.questions || [];
    document.getElementById("quiz-title").innerHTML =
      `<i class="fas fa-question-circle"></i> ${escapeHtml(data.title || "Quiz")}`;
    renderQuiz();
    submitBtn.disabled = false;
  } catch (err) {
    body.innerHTML = `<div class="quiz-loading" style="color: var(--error);"><i class="fas fa-exclamation-triangle"></i> ${escapeHtml(err.message)}</div>`;
  }
}

function renderQuiz() {
  const body = document.getElementById("quiz-body");
  body.innerHTML = "";
  quizState.questions.forEach((q, qi) => {
    const block = document.createElement("div");
    block.className = "quiz-question";
    block.innerHTML = `
      <div class="quiz-question-prompt">
        <span class="quiz-num">${qi + 1}</span>${escapeHtml(q.question)}
      </div>
      <div class="quiz-options">
        ${q.options.map((opt, oi) => `
          <label class="quiz-option" data-q="${qi}" data-o="${oi}">
            <input type="radio" name="q-${qi}" value="${oi}" />
            <span>${escapeHtml(opt)}</span>
          </label>
        `).join("")}
      </div>
    `;
    body.appendChild(block);
  });

  body.querySelectorAll('input[type="radio"]').forEach((input) => {
    input.addEventListener("change", (e) => {
      const qi = parseInt(e.target.name.split("-")[1], 10);
      quizState.answers[qi] = parseInt(e.target.value, 10);
    });
  });
}

function submitQuiz() {
  if (quizState.submitted) return;
  const total = quizState.questions.length;
  let correct = 0;

  quizState.questions.forEach((q, qi) => {
    const userAns = quizState.answers[qi];
    const isCorrect = userAns === q.correctIndex;
    if (isCorrect) correct++;

    const optionLabels = document.querySelectorAll(`.quiz-option[data-q="${qi}"]`);
    optionLabels.forEach((label) => {
      const oi = parseInt(label.dataset.o, 10);
      label.classList.add("disabled");
      label.querySelector("input").disabled = true;
      if (oi === q.correctIndex) label.classList.add("correct");
      else if (oi === userAns) label.classList.add("incorrect");
    });

    const block = optionLabels[0]?.closest(".quiz-question");
    if (block && q.explanation) {
      const exp = document.createElement("div");
      exp.className = "quiz-explanation";
      exp.innerHTML = `<strong>${isCorrect ? "✓ Correct." : "✗ Explanation:"}</strong> ${escapeHtml(q.explanation)}`;
      block.appendChild(exp);
    }
  });

  quizState.submitted = true;
  document.getElementById("btn-quiz-submit").disabled = true;

  const pct = Math.round((correct / total) * 100);
  const statusEl = document.getElementById("quiz-status");
  statusEl.textContent = `Score: ${correct}/${total} (${pct}%)`;
  statusEl.classList.add(pct >= 60 ? "passed" : "failed");
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
