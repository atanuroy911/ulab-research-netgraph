"""
ULAB Research Network — Control Panel (PyQt6)
Rewritten from CustomTkinter for significantly better performance,
especially in the Faculty Browser tab which uses QTreeWidget
(paint-based, renders 1000+ items instantly vs Tkinter's per-widget OS objects).
"""

import sys
import os
import json
import subprocess
import threading
import requests
import shutil
from collections import defaultdict
from pathlib import Path

from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QSplitter, QTabWidget, QLabel, QPushButton, QLineEdit, QTextEdit,
    QPlainTextEdit, QCheckBox, QComboBox, QFrame, QTreeWidget,
    QTreeWidgetItem, QHeaderView, QGroupBox, QScrollArea, QSizePolicy,
    QStatusBar, QProgressBar, QMessageBox, QSpinBox, QDoubleSpinBox
)
from PyQt6.QtCore import (
    Qt, QThread, pyqtSignal, QObject, QTimer, QSize
)
from PyQt6.QtGui import (
    QFont, QColor, QPixmap, QIcon, QPalette, QTextCursor
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_OLLAMA_URL = "http://192.168.123.47:11434"

# ── ULAB Colour palette ──────────────────────────────────────────────────────
ULAB_BLUE   = "#002B5C"
ULAB_RED    = "#D32027"
ULAB_YELLOW = "#F0B323"
SLATE_50    = "#f8fafc"
SLATE_100   = "#f1f5f9"
SLATE_200   = "#e2e8f0"
SLATE_400   = "#94a3b8"
SLATE_600   = "#475569"
SLATE_700   = "#334155"
SLATE_900   = "#0f172a"
GREEN       = "#10b981"
AMBER       = "#f59e0b"
RED_LIGHT   = "#f87171"
SKY         = "#0ea5e9"
SKY_DARK    = "#0284c7"

STYLESHEET = f"""
QMainWindow {{ background: {SLATE_100}; }}
QWidget {{ font-family: 'Segoe UI', 'Inter', sans-serif; font-size: 13px; color: #111; }}

/* Header */
#header {{ background: {ULAB_BLUE}; padding: 6px 16px; }}
#header QLabel {{ color: white; }}
#header QLineEdit {{
    background: white; color: #111; border: none;
    border-radius: 4px; padding: 3px 8px;
}}
#header QComboBox {{
    background: white; color: #111; border: none;
    border-radius: 4px; padding: 3px 8px; min-width: 140px;
}}
#header QComboBox::drop-down {{ border: none; }}
#header QPushButton {{
    color: white; border: none; border-radius: 5px;
    padding: 5px 12px; font-weight: bold;
}}

/* Tabs */
QTabWidget::pane {{ border: 1px solid {SLATE_200}; border-radius: 6px; background: white; }}
QTabBar::tab {{
    background: {SLATE_100}; color: {SLATE_600};
    padding: 7px 18px; border-radius: 5px 5px 0 0; margin-right: 2px;
}}
QTabBar::tab:selected {{ background: white; color: {ULAB_BLUE}; font-weight: bold; }}
QTabBar::tab:hover {{ background: {SLATE_200}; }}

/* Buttons */
QPushButton {{
    border-radius: 5px; padding: 6px 14px;
    font-weight: bold; border: none; color: white;
    background: {ULAB_BLUE};
}}
QPushButton:hover {{ background: #1e3a5f; }}
QPushButton:disabled {{ background: {SLATE_400}; color: white; }}
QPushButton#green  {{ background: {GREEN}; }}
QPushButton#green:hover  {{ background: #059669; }}
QPushButton#red    {{ background: {ULAB_RED}; }}
QPushButton#red:hover    {{ background: #b91c1c; }}
QPushButton#sky    {{ background: {SKY}; }}
QPushButton#sky:hover    {{ background: {SKY_DARK}; }}
QPushButton#grey   {{ background: {SLATE_600}; }}
QPushButton#grey:hover   {{ background: {SLATE_700}; }}
QPushButton#slate  {{ background: {SLATE_900}; }}
QPushButton#amber  {{ background: {AMBER}; color: #111; }}

/* GroupBox */
QGroupBox {{
    background: {SLATE_50}; border: 1px solid {SLATE_200};
    border-radius: 6px; margin-top: 10px; padding: 6px;
    font-weight: bold; color: {SLATE_700};
}}
QGroupBox::title {{ subcontrol-origin: margin; padding: 0 6px; left: 12px; }}

/* Log / terminal areas */
QPlainTextEdit#log {{
    background: {SLATE_900}; color: #f8fafc;
    font-family: 'Consolas', 'Courier New', monospace; font-size: 12px;
    border: none; border-radius: 6px; padding: 6px;
}}
QPlainTextEdit#log[readOnly="true"] {{ }}

/* Chat */
QTextEdit#chat {{
    background: white; font-size: 14px; border: none;
}}
QTextEdit#chatInput {{
    background: {SLATE_50}; border: 1px solid {SLATE_200};
    border-radius: 6px; font-size: 14px; padding: 6px;
}}

/* Faculty tree */
QTreeWidget {{
    background: white; border: 1px solid {SLATE_200};
    border-radius: 6px; alternate-background-color: {SLATE_50};
    show-decoration-selected: 1;
    outline: none;
    color: {SLATE_900};
}}
QTreeWidget::item {{ padding: 3px 4px; border-radius: 3px; color: {SLATE_900}; }}
QTreeWidget::item:selected {{
    background: #dbeafe; color: {ULAB_BLUE};
}}
QTreeWidget::item:hover {{ background: {SLATE_100}; }}
QHeaderView::section {{
    background: {SLATE_100}; color: {SLATE_700};
    padding: 5px 8px; font-weight: bold;
    border: none; border-bottom: 1px solid {SLATE_200};
}}

/* Search */
QLineEdit {{
    background: white; border: 1px solid {SLATE_200};
    border-radius: 5px; padding: 5px 10px;
}}
QLineEdit:focus {{ border-color: {SKY}; }}

/* Combo boxes (app-wide — the #header-scoped rule above doesn't reach combos placed
   in the tabs, e.g. the LLM extraction model picker, so those fell back to the OS/Fusion
   default rendering, which reads as a dark/mismatched dropdown on dark-themed systems). */
QComboBox {{
    background: white; color: {SLATE_900}; border: 1px solid {SLATE_200};
    border-radius: 5px; padding: 4px 8px; min-height: 20px;
}}
QComboBox:hover {{ border-color: {SKY}; }}
QComboBox::drop-down {{ border: none; width: 20px; }}
QComboBox QAbstractItemView {{
    background: white; color: {SLATE_900};
    selection-background-color: #dbeafe; selection-color: {ULAB_BLUE};
    border: 1px solid {SLATE_200}; outline: none;
}}
QSpinBox, QDoubleSpinBox {{
    background: white; color: {SLATE_900}; border: 1px solid {SLATE_200};
    border-radius: 5px; padding: 3px 6px;
}}

/* QScrollArea's viewport ignores the app palette by default (Fusion paints it dark) */
QScrollArea {{ background: transparent; border: none; }}

/* Status bar */
QStatusBar {{ background: {SLATE_100}; color: {SLATE_600}; font-size: 12px; }}

/* Splitter */
QSplitter::handle {{ background: {SLATE_200}; }}
QSplitter::handle:horizontal {{ width: 4px; }}
"""


# ── Worker signals ────────────────────────────────────────────────────────────
class WorkerSignals(QObject):
    log      = pyqtSignal(str)
    finished = pyqtSignal(int)          # returncode
    models   = pyqtSignal(list, list)   # all_names, active_names
    faculty  = pyqtSignal(list)         # list of faculty dicts


# ── Background worker threads ─────────────────────────────────────────────────
class ProcessWorker(QThread):
    """Runs a subprocess and emits each output line as a log signal."""
    log      = pyqtSignal(str)
    finished = pyqtSignal(int)

    def __init__(self, cmd, cwd, env=None):
        super().__init__()
        self.cmd  = cmd
        self.cwd  = cwd
        self.env  = env
        self._proc = None

    def run(self):
        process_env = os.environ.copy()
        process_env["PYTHONUNBUFFERED"] = "1"
        if self.env:
            process_env.update(self.env)
        try:
            self._proc = subprocess.Popen(
                self.cmd, cwd=self.cwd,
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, env=process_env,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
            )
            for line in iter(self._proc.stdout.readline, ""):
                self.log.emit(line.rstrip())
            self._proc.stdout.close()
            self._proc.wait()
            self.finished.emit(self._proc.returncode)
        except Exception as e:
            self.log.emit(f"[Error] {e}")
            self.finished.emit(1)

    def stop(self):
        if self._proc:
            if os.name == "nt":
                subprocess.run(
                    ["taskkill", "/F", "/T", "/PID", str(self._proc.pid)],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
                )
            else:
                self._proc.terminate()


class OllamaWorker(QThread):
    """Fetches model list + active models from Ollama."""
    done = pyqtSignal(list, list)  # model_names, active_names
    log  = pyqtSignal(str)

    def __init__(self, base_url):
        super().__init__()
        self.base_url = base_url

    def run(self):
        try:
            r = requests.get(f"{self.base_url}/api/tags", timeout=5)
            r.raise_for_status()
            all_models = [m["name"] for m in r.json().get("models", [])]
            EMBED = ("nomic-embed", "mxbai-embed", "bge-", "all-minilm")
            gen_models = [n for n in all_models if not n.startswith(EMBED)] or all_models
            self.log.emit(f"[Network] {len(gen_models)} generation models ({len(all_models)-len(gen_models)} embed-only filtered).")
        except Exception as e:
            self.log.emit(f"[Network] Error fetching models: {e}")
            gen_models = []

        active = []
        try:
            ps = requests.get(f"{self.base_url}/api/ps", timeout=5)
            if ps.ok:
                active = [m["name"] for m in ps.json().get("models", [])]
                if active:
                    self.log.emit(f"[Network] Active in VRAM: {', '.join(active)}")
        except Exception:
            pass

        self.done.emit(gen_models, active)


class ModelActionWorker(QThread):
    """Load or unload a model via keep_alive."""
    log  = pyqtSignal(str)
    done = pyqtSignal()

    def __init__(self, url, model, keep_alive):
        super().__init__()
        self.url        = url
        self.model      = model
        self.keep_alive = keep_alive   # -1 = pin, 0 = unload

    def run(self):
        action = "Loading" if self.keep_alive == -1 else "Unloading"
        self.log.emit(f"[Network] {action} '{self.model}'...")
        try:
            requests.post(
                self.url,
                json={"model": self.model, "keep_alive": self.keep_alive},
                timeout=120
            )
            result = "pinned in VRAM" if self.keep_alive == -1 else "unloaded from VRAM"
            self.log.emit(f"[Network] '{self.model}' {result}.")
        except Exception as e:
            self.log.emit(f"[Network] Failed: {e}")
        self.done.emit()


class FacultyLoaderWorker(QThread):
    """Loads all faculty JSON files from data/faculty/."""
    done = pyqtSignal(list)
    log  = pyqtSignal(str)

    def __init__(self, faculty_dir):
        super().__init__()
        self.faculty_dir = faculty_dir

    def run(self):
        records = []
        if not os.path.exists(self.faculty_dir):
            self.log.emit("[Browser] data/faculty/ not found. Run the scraper first.")
            self.done.emit([])
            return
        for fname in sorted(os.listdir(self.faculty_dir)):
            if not fname.endswith(".json"):
                continue
            try:
                with open(os.path.join(self.faculty_dir, fname), "r", encoding="utf-8") as f:
                    records.append(json.load(f))
            except Exception:
                pass
        self.log.emit(f"[Browser] Loaded {len(records)} faculty profiles.")
        self.done.emit(records)


# ── Main Window ───────────────────────────────────────────────────────────────
class ControlPanel(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("ULAB Research Network — Control Panel")
        self.resize(1440, 880)
        # 1000px wasn't actually enough for the header's content (logo + title + Ollama
        # URL field + model combo + 3 buttons + status label, ~1200px at natural size),
        # so shrinking toward the old minimum forced Qt to compress buttons below their
        # readable text width instead of wrapping/eliding. 1200 keeps the header's own
        # sizeHint above the floor so that never happens.
        self.setMinimumSize(1200, 650)
        self.setStyleSheet(STYLESHEET)

        self._pipeline_worker = None
        self._nextjs_worker   = None
        self._all_faculty     = []

        central = QWidget()
        self.setCentralWidget(central)
        root = QVBoxLayout(central)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        root.addWidget(self._build_header())
        root.addWidget(self._build_body(), stretch=1)

        self._status = QStatusBar()
        self.setStatusBar(self._status)
        self._status.showMessage("Ready")

        # Buttons don't wrap or ellipsize their text — if a layout compresses one below
        # its natural width the label just overlaps/clips ("squished"). Pin every button
        # to its sizeHint horizontally so the layout has to make room elsewhere instead.
        for btn in self.findChildren(QPushButton):
            btn.setSizePolicy(QSizePolicy.Policy.Minimum, QSizePolicy.Policy.Fixed)

        # Auto-fetch models on startup
        QTimer.singleShot(500, self._refresh_models)

    # ── Header ────────────────────────────────────────────────────────────────
    def _build_header(self):
        header = QWidget()
        header.setObjectName("header")
        h = QHBoxLayout(header)
        h.setContentsMargins(16, 8, 16, 8)
        h.setSpacing(10)

        # Logo
        logo_path = os.path.join(BASE_DIR, "ulab.jpg")
        if os.path.exists(logo_path):
            pix = QPixmap(logo_path).scaledToHeight(44, Qt.TransformationMode.SmoothTransformation)
            logo = QLabel()
            logo.setPixmap(pix)
            h.addWidget(logo)

        title = QLabel("Research Network Orchestrator")
        title.setFont(QFont("Segoe UI", 16, QFont.Weight.Bold))
        title.setStyleSheet("color: white;")
        h.addWidget(title)

        h.addStretch()

        # Ollama URL
        h.addWidget(self._header_label("Ollama URL:"))
        self.url_edit = QLineEdit(DEFAULT_OLLAMA_URL)
        self.url_edit.setFixedWidth(210)
        h.addWidget(self.url_edit)

        # Model dropdown
        self.model_combo = QComboBox()
        self.model_combo.addItem("llama3:8b")
        self.model_combo.setEditable(False)
        h.addWidget(self.model_combo)

        # Model action buttons
        btn_load = self._hbtn("▶ Load", GREEN, "Load model into VRAM")
        btn_load.clicked.connect(self._load_model)
        h.addWidget(btn_load)

        btn_unload = self._hbtn("⏏ Unload", SLATE_600, "Unload model from VRAM")
        btn_unload.clicked.connect(self._unload_model)
        h.addWidget(btn_unload)

        btn_refresh = self._hbtn("🔄 Refresh", SKY, "Refresh model list")
        btn_refresh.clicked.connect(self._refresh_models)
        h.addWidget(btn_refresh)

        self.active_label = QLabel("Loaded: Unknown")
        self.active_label.setStyleSheet(f"color: {GREEN}; font-weight: bold;")
        h.addWidget(self.active_label)

        return header

    def _header_label(self, text):
        l = QLabel(text)
        l.setStyleSheet("color: white;")
        return l

    def _hbtn(self, text, color, tooltip=""):
        b = QPushButton(text)
        b.setStyleSheet(f"QPushButton {{ background: {color}; color: white; border-radius: 5px; padding: 5px 12px; font-weight: bold; }}"
                        f"QPushButton:hover {{ background: #1e3a5f; }}")
        if tooltip:
            b.setToolTip(tooltip)
        return b

    # ── Body (splitter) ───────────────────────────────────────────────────────
    def _build_body(self):
        splitter = QSplitter(Qt.Orientation.Horizontal)
        splitter.setHandleWidth(5)
        # QSplitter defaults to childrenCollapsible=True, which lets a drag squeeze a pane
        # narrower than its own content's minimum size hint — overriding every button's
        # individual size policy and squishing text. False makes the handle stop at each
        # pane's real minimum instead.
        splitter.setChildrenCollapsible(False)

        # Left: tools + log
        left = QWidget()
        left.setMinimumWidth(560)
        lv = QVBoxLayout(left)
        lv.setContentsMargins(12, 12, 6, 12)
        lv.setSpacing(8)

        self.tabs = QTabWidget()
        lv.addWidget(self.tabs, stretch=1)

        self.tabs.addTab(self._build_pipeline_tab(), "⚙ Pipeline & Scraper")
        self.tabs.addTab(self._build_browser_tab(),  "📋 Faculty Browser")
        self.tabs.addTab(self._build_nextjs_tab(),   "🌐 Next.js App")
        self.tabs.addTab(self._build_env_tab(),      "🔧 Environment")

        log_label = QLabel("Live Logs:")
        log_label.setFont(QFont("Segoe UI", 11, QFont.Weight.Bold))
        lv.addWidget(log_label)

        self.log_area = QPlainTextEdit()
        self.log_area.setObjectName("log")
        self.log_area.setReadOnly(True)
        self.log_area.setFixedHeight(250)
        lv.addWidget(self.log_area)

        # Right: chat
        right = self._build_chat_pane()

        splitter.addWidget(left)
        splitter.addWidget(right)
        splitter.setSizes([820, 460])
        return splitter

    # ── Pipeline tab ──────────────────────────────────────────────────────────
    def _build_pipeline_tab(self):
        # This tab has accumulated a lot of stacked group boxes (Full Pipeline, Targeted
        # Scrape, Canonicalize, Graph Builder, LLM Versions). Without a scroll area, once
        # they don't fit the window height, Qt compresses every widget's height to force
        # a fit instead of scrolling — which is what "squished" text actually was.
        tab = QWidget()
        v = QVBoxLayout(tab)
        v.setContentsMargins(10, 10, 10, 10)
        v.setSpacing(10)

        # Full pipeline
        grp = QGroupBox("Full Pipeline Run")
        gv = QVBoxLayout(grp)

        row = QHBoxLayout()
        self.pipe_run_btn = QPushButton("▶ Run All")
        self.pipe_run_btn.setObjectName("green")
        self.pipe_run_btn.clicked.connect(self._run_full_pipeline)
        row.addWidget(self.pipe_run_btn)

        self.pipe_stop_btn = QPushButton("⏹ Stop")
        self.pipe_stop_btn.setObjectName("grey")
        self.pipe_stop_btn.setEnabled(False)
        self.pipe_stop_btn.clicked.connect(self._stop_pipeline)
        row.addWidget(self.pipe_stop_btn)

        self.pipe_progress = QLabel("Ready (0/6 stages)")
        self.pipe_progress.setStyleSheet(f"color: {SLATE_600}; font-weight: bold;")
        row.addWidget(self.pipe_progress)
        row.addStretch()
        gv.addLayout(row)

        self.skip_scrape_chk = QCheckBox("Skip Scraping (jump straight to Ollama extraction)")
        self.force_extract_chk = QCheckBox("Force Re-Extract (overwrite existing AI extractions)")
        gv.addWidget(self.skip_scrape_chk)
        gv.addWidget(self.force_extract_chk)

        kw_row = QHBoxLayout()
        kw_row.addWidget(QLabel("Keywords per faculty:"))
        self.keyword_count_spin = QSpinBox()
        self.keyword_count_spin.setRange(3, 50)
        self.keyword_count_spin.setValue(15)
        self.keyword_count_spin.setToolTip(
            "How many research-domain phrases the LLM should extract per faculty member.\n"
            "Only takes effect on profiles that are (re-)extracted — combine with\n"
            "'Force Re-Extract' to regenerate everyone at the new count (overwrites existing keywords)."
        )
        kw_row.addWidget(self.keyword_count_spin)
        kw_row.addStretch()
        gv.addLayout(kw_row)

        v.addWidget(grp)

        # Targeted scrape
        grp2 = QGroupBox("Targeted Profile Scrape")
        gv2 = QHBoxLayout(grp2)
        gv2.addWidget(QLabel("Profile Slug:"))
        self.target_slug = QLineEdit()
        self.target_slug.setPlaceholderText("e.g. sajid-amit")
        gv2.addWidget(self.target_slug)
        btn = QPushButton("▶ Scrape & Extract")
        btn.setObjectName("sky")
        btn.clicked.connect(self._run_targeted_scrape)
        gv2.addWidget(btn)
        v.addWidget(grp2)

        # Canonicalize keywords — deterministic embedding-nearest-neighbor matching against
        # a controlled vocabulary, instead of trusting the LLM's free-form canonical guess.
        # This is what actually fixes low keyword overlap: the old taxonomy.json was a
        # near-1:1 dump of raw terms (build_taxonomy.py never really clustered anything),
        # so almost nobody's keywords matched anyone else's even when they meant the same
        # thing ("machine learning" vs "Machine Learning" vs "ML").
        grp_canon = QGroupBox("Canonicalize Keywords (Controlled Vocabulary)")
        gv_canon = QVBoxLayout(grp_canon)
        gv_canon.addWidget(QLabel(
            "Merges near-duplicate keywords (case/plural/phrasing variants) into a shared\n"
            "canonical label by embedding similarity, so genuinely-related faculty actually\n"
            "show up as connected. Locked/verified faculty are never touched."
        ))
        canon_row = QHBoxLayout()
        canon_row.addWidget(QLabel("Similarity threshold:"))
        self.canon_threshold_spin = QDoubleSpinBox()
        self.canon_threshold_spin.setRange(0.50, 0.95)
        self.canon_threshold_spin.setSingleStep(0.01)
        self.canon_threshold_spin.setValue(0.72)
        self.canon_threshold_spin.setToolTip(
            "Higher = fewer, safer merges. 0.72 was empirically checked against this dataset:\n"
            "catches case/plural/synonym variants without conflating distinct fields\n"
            "(e.g. Machine Learning stays separate from Computer Vision). Below ~0.70, merges\n"
            "start getting questionable (e.g. 'Financial Management' -> 'financial technology')."
        )
        canon_row.addWidget(self.canon_threshold_spin)

        self.canon_reset_chk = QCheckBox("Rebuild from scratch (ignore existing taxonomy.json)")
        self.canon_reset_chk.setToolTip(
            "The existing taxonomy.json may itself be an unclustered dump from before this\n"
            "feature existed. Checking this ignores it and reclusters from the current\n"
            "extracted_keywords instead of seeding from (and trivially matching) it."
        )
        canon_row.addWidget(self.canon_reset_chk)
        canon_row.addStretch()
        gv_canon.addLayout(canon_row)

        canon_btn_row = QHBoxLayout()
        canonicalize_btn = QPushButton("🏷 Canonicalize + Rebuild Graph")
        canonicalize_btn.setObjectName("green")
        canonicalize_btn.clicked.connect(self._run_canonicalize)
        self.canonicalize_btn = canonicalize_btn
        canon_btn_row.addWidget(canonicalize_btn)
        canon_btn_row.addStretch()
        gv_canon.addLayout(canon_btn_row)

        v.addWidget(grp_canon)

        # Graph builder — the actually-working embeddings/edges pipeline (Node, not the
        # legacy pipeline/build_edges.py which falls back to mock vectors without
        # sentence-transformers installed). Lets you pick which keyword sources feed the
        # graph and re-generate it accordingly.
        grp3 = QGroupBox("Graph Builder (Embeddings + Edges)")
        gv3 = QVBoxLayout(grp3)

        gv3.addWidget(QLabel("Keyword sources to include when building the graph:"))
        src_row = QHBoxLayout()
        self.src_bio_chk = QCheckBox("Bio")
        self.src_pubs_chk = QCheckBox("Publications")
        self.src_interests_chk = QCheckBox("Interests")
        for chk in (self.src_bio_chk, self.src_pubs_chk, self.src_interests_chk):
            chk.setChecked(True)
            src_row.addWidget(chk)
        src_row.addStretch()
        gv3.addLayout(src_row)

        graph_btn_row = QHBoxLayout()
        self.build_graph_btn = QPushButton("🕸 Rebuild Embeddings + Edges")
        self.build_graph_btn.setObjectName("sky")
        self.build_graph_btn.setToolTip(
            "Runs scripts/build-embeddings.mjs then scripts/build-edges.mjs (Node) using only\n"
            "the checked keyword sources. Overwrites data/embeddings.json and data/edges.json."
        )
        self.build_graph_btn.clicked.connect(self._run_graph_builder)
        graph_btn_row.addWidget(self.build_graph_btn)
        graph_btn_row.addStretch()
        gv3.addLayout(graph_btn_row)

        v.addWidget(grp3)

        # Cross-disciplinary map — a separate signal from the similarity graph above.
        # Similarity rewards topical closeness (which clusters by department); this
        # rewards complementarity (method from one field applied to a domain in another),
        # via a curated affinity table generated once by the LLM over the taxonomy.
        grp_cross = QGroupBox("Cross-Disciplinary Map")
        gv_cross = QVBoxLayout(grp_cross)
        gv_cross.addWidget(QLabel(
            "Generates a method↔domain pairing table (e.g. Machine Learning ↔ Linguistics,\n"
            "IoT ↔ Flood Control) via the LLM reasoning over the full keyword vocabulary, then\n"
            "connects faculty in DIFFERENT departments whose keywords match a pairing. Shown on\n"
            "its own 'Cross-Disciplinary' tab on the website, separate from the similarity graph."
        ))

        cross_row1 = QHBoxLayout()
        cross_row1.addWidget(QLabel("Target pairs:"))
        self.affinity_pairs_spin = QSpinBox()
        self.affinity_pairs_spin.setRange(10, 300)
        self.affinity_pairs_spin.setValue(50)
        cross_row1.addWidget(self.affinity_pairs_spin)

        gen_affinity_btn = QPushButton("\U0001f9e0 Generate Affinity Table")
        gen_affinity_btn.setObjectName("sky")
        gen_affinity_btn.setToolTip(
            "Runs pipeline/build_domain_affinity.py using the model selected above. Overwrites\n"
            "data/domain_affinity.json — hand-edit that file afterward to curate it further."
        )
        gen_affinity_btn.clicked.connect(self._run_generate_affinity)
        cross_row1.addWidget(gen_affinity_btn)
        cross_row1.addStretch()
        gv_cross.addLayout(cross_row1)

        cross_row2 = QHBoxLayout()
        build_cross_edges_btn = QPushButton("\U0001f517 Rebuild Cross-Disciplinary Edges")
        build_cross_edges_btn.setObjectName("green")
        build_cross_edges_btn.setToolTip(
            "Runs scripts/build-cross-domain-edges.mjs — instant, pure lookup against the\n"
            "existing affinity table (no LLM calls). Run after editing domain_affinity.json\n"
            "by hand, or after re-extracting/re-canonicalizing keywords."
        )
        build_cross_edges_btn.clicked.connect(self._run_build_cross_edges)
        cross_row2.addWidget(build_cross_edges_btn)
        cross_row2.addStretch()
        gv_cross.addLayout(cross_row2)

        v.addWidget(grp_cross)

        # LLM extraction versions — switch which archived model's keywords are "active"
        # (used by the graph/search/directory) without re-calling the LLM.
        grp4 = QGroupBox("LLM Extraction Versions")
        gv4 = QVBoxLayout(grp4)
        gv4.addWidget(QLabel(
            "Each faculty file can retain extractions from multiple LLMs (extract with a\n"
            "different model selected above, without --force clearing prior history). Switch\n"
            "which one is active below — locked/verified faculty are never touched."
        ))
        active_row = QHBoxLayout()
        active_row.addWidget(QLabel("Model:"))
        self.active_model_combo = QComboBox()
        self.active_model_combo.setEditable(True)
        self.active_model_combo.addItem("llama3:8b")
        active_row.addWidget(self.active_model_combo)

        set_active_btn = QPushButton("⭐ Set as Active (all faculty)")
        set_active_btn.setObjectName("amber")
        set_active_btn.clicked.connect(self._set_active_extraction)
        active_row.addWidget(set_active_btn)
        active_row.addStretch()
        gv4.addLayout(active_row)

        v.addWidget(grp4)

        v.addStretch()

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.Shape.NoFrame)
        # QScrollArea's viewport doesn't inherit the app stylesheet's light background by
        # default (Fusion paints it dark) — transparent lets QMainWindow's own background
        # show through instead of a mismatched dark panel behind the group boxes.
        # IMPORTANT: only style the viewport (an internal widget with no button/combo
        # descendants), never `scroll` or `tab` themselves — calling setStyleSheet() on a
        # container that has descendants relying on the app-wide QPushButton/QComboBox
        # rules breaks their color inheritance (this is what made every button render
        # plain/unstyled last time).
        scroll.viewport().setStyleSheet("background: transparent;")
        scroll.setWidget(tab)
        return scroll

    def _selected_keyword_sources(self):
        sources = []
        if self.src_bio_chk.isChecked():
            sources.append("bio")
        if self.src_pubs_chk.isChecked():
            sources.append("pubs")
        if self.src_interests_chk.isChecked():
            sources.append("interests")
        return sources

    def _run_canonicalize(self):
        threshold = self.canon_threshold_spin.value()
        reset = self.canon_reset_chk.isChecked()

        msg = f"This rewrites extracted_keywords[].canonical across the dataset at threshold {threshold:.2f}"
        msg += " and rebuilds the taxonomy from scratch (--reset)." if reset else " (merging into the existing taxonomy.json)."
        msg += " Locked/verified faculty are skipped. Embeddings and edges are rebuilt afterward. Continue?"
        if QMessageBox.question(self, "Canonicalize keywords", msg) != QMessageBox.StandardButton.Yes:
            return

        web_dir = os.path.join(BASE_DIR, "web")
        npm = "npm.cmd" if os.name == "nt" else "npm"

        cmd = [npm, "run", "canonicalize-keywords", "--", "--threshold", str(threshold)]
        if reset:
            cmd.append("--reset")

        self.canonicalize_btn.setEnabled(False)
        self._log(f"--- Canonicalizing keywords (threshold={threshold:.2f}{', reset' if reset else ''}) ---")

        def run_embeddings(rc):
            if rc != 0:
                self._log("[Error] canonicalize-keywords.mjs failed — skipping embeddings/edges rebuild.")
                self.canonicalize_btn.setEnabled(True)
                return
            w2 = ProcessWorker([npm, "run", "build-embeddings"], web_dir)
            w2.log.connect(self._log)
            w2.finished.connect(run_edges)
            w2.start()
            self._canon_embeddings_worker = w2

        def run_edges(rc):
            if rc != 0:
                self._log("[Error] build-embeddings.mjs failed — skipping edges step.")
                self.canonicalize_btn.setEnabled(True)
                return
            w3 = ProcessWorker([npm, "run", "build-edges"], web_dir)
            w3.log.connect(self._log)
            w3.finished.connect(lambda rc3: (
                self._log("--- Canonicalize + rebuild complete ---" if rc3 == 0 else "--- Rebuild failed ---"),
                self.canonicalize_btn.setEnabled(True)
            ))
            w3.start()
            self._canon_edges_worker = w3

        w1 = ProcessWorker(cmd, web_dir)
        w1.log.connect(self._log)
        w1.finished.connect(run_embeddings)
        w1.start()
        self._canon_worker = w1

    def _run_generate_affinity(self):
        target_pairs = self.affinity_pairs_spin.value()
        confirm = QMessageBox.question(
            self, "Generate affinity table",
            f"This calls the LLM ({self.model_combo.currentText()}) over the full keyword "
            f"vocabulary to propose ~{target_pairs} cross-disciplinary pairings, overwriting "
            f"data/domain_affinity.json. May take a few minutes. Continue?",
        )
        if confirm != QMessageBox.StandardButton.Yes:
            return

        env = {
            "OLLAMA_MODEL": self.model_combo.currentText(),
            "OLLAMA_URL": f"{self.url_edit.text().strip()}/api/generate",
        }
        cmd = [
            sys.executable, os.path.join(BASE_DIR, "pipeline", "build_domain_affinity.py"),
            "--target-pairs", str(target_pairs),
        ]
        self._log(f"--- Generating domain affinity table (~{target_pairs} pairs) ---")
        w = ProcessWorker(cmd, BASE_DIR, env)
        w.log.connect(self._log)
        w.finished.connect(lambda rc: self._log(
            "--- Affinity table generated. Now rebuild cross-disciplinary edges. ---"
            if rc == 0 else "--- Affinity generation failed ---"
        ))
        w.start()
        self._affinity_worker = w

    def _run_build_cross_edges(self):
        web_dir = os.path.join(BASE_DIR, "web")
        npm = "npm.cmd" if os.name == "nt" else "npm"
        self._log("--- Rebuilding cross-disciplinary edges ---")
        w = ProcessWorker([npm, "run", "build-cross-domain-edges"], web_dir)
        w.log.connect(self._log)
        w.finished.connect(lambda rc: self._log(
            "--- Cross-disciplinary edges rebuilt ---" if rc == 0 else "--- Rebuild failed ---"
        ))
        w.start()
        self._cross_edges_worker = w

    def _run_graph_builder(self):
        sources = self._selected_keyword_sources()
        if not sources:
            QMessageBox.warning(self, "No sources selected", "Check at least one keyword source.")
            return

        web_dir = os.path.join(BASE_DIR, "web")
        env = {"KEYWORD_SOURCE_FILTER": ",".join(sources)}
        npm = "npm.cmd" if os.name == "nt" else "npm"

        self.build_graph_btn.setEnabled(False)
        self._log(f"--- Rebuilding graph (sources: {', '.join(sources)}) ---")

        def run_edges(rc):
            if rc != 0:
                self._log("[Error] build-embeddings.mjs failed — skipping edges step.")
                self.build_graph_btn.setEnabled(True)
                return
            w2 = ProcessWorker([npm, "run", "build-edges"], web_dir, env)
            w2.log.connect(self._log)
            w2.finished.connect(lambda rc2: (
                self._log("--- Graph rebuild complete ---" if rc2 == 0 else "--- Graph rebuild failed ---"),
                self.build_graph_btn.setEnabled(True)
            ))
            w2.start()
            self._graph_edges_worker = w2

        w1 = ProcessWorker([npm, "run", "build-embeddings"], web_dir, env)
        w1.log.connect(self._log)
        w1.finished.connect(run_edges)
        w1.start()
        self._graph_embeddings_worker = w1

    def _set_active_extraction(self):
        model = self.active_model_combo.currentText().strip()
        if not model:
            return
        confirm = QMessageBox.question(
            self, "Switch active extraction",
            f"This overwrites extracted_keywords for every faculty that has a stored "
            f"'{model}' extraction (locked/verified faculty are skipped). Continue?",
        )
        if confirm != QMessageBox.StandardButton.Yes:
            return

        self._log(f"--- Switching active extraction to '{model}' ---")
        cmd = [sys.executable, os.path.join(BASE_DIR, "pipeline", "set_active_extraction.py"), "--model", model]
        w = ProcessWorker(cmd, BASE_DIR)
        w.log.connect(self._log)
        w.finished.connect(lambda rc: self._log(
            "--- Switch complete. Rebuild the graph / re-run index generation to reflect it. ---"
            if rc == 0 else "--- Switch failed ---"
        ))
        w.start()
        self._set_active_worker = w

    # ── Faculty Browser tab ───────────────────────────────────────────────────
    def _build_browser_tab(self):
        tab = QWidget()
        v = QVBoxLayout(tab)
        v.setContentsMargins(10, 10, 10, 10)
        v.setSpacing(8)

        # Toolbar
        toolbar = QHBoxLayout()
        self.browser_stats = QLabel("Click Refresh to load faculty data.")
        self.browser_stats.setStyleSheet(f"color: {SLATE_600};")
        toolbar.addWidget(self.browser_stats)
        toolbar.addStretch()

        self.browser_search = QLineEdit()
        self.browser_search.setPlaceholderText("Search name or keyword…")
        self.browser_search.setFixedWidth(240)
        self.browser_search.textChanged.connect(self._apply_browser_filter)
        toolbar.addWidget(self.browser_search)

        refresh_btn = QPushButton("🔄 Refresh")
        refresh_btn.setObjectName("sky")
        refresh_btn.clicked.connect(self._load_faculty_browser)
        toolbar.addWidget(refresh_btn)
        v.addLayout(toolbar)

        # Legend
        legend = QHBoxLayout()
        for color, label in [(GREEN, "Has keywords"), (AMBER, "Bio only, no keywords"), (RED_LIGHT, "Empty profile")]:
            dot = QLabel("●  " + label)
            dot.setStyleSheet(f"color: {color}; font-size: 12px;")
            legend.addWidget(dot)
        legend.addStretch()
        v.addLayout(legend)

        # Splitter for Tree (Left) and Details (Right)
        browser_splitter = QSplitter(Qt.Orientation.Horizontal)
        browser_splitter.setChildrenCollapsible(False)

        # Tree widget — column layout
        self.faculty_tree = QTreeWidget()
        self.faculty_tree.setColumnCount(5)
        self.faculty_tree.setHeaderLabels(["Name / Department", "Title", "Keywords", "Bio", "Pubs"])
        self.faculty_tree.setAlternatingRowColors(True)
        self.faculty_tree.setRootIsDecorated(True)
        self.faculty_tree.setSortingEnabled(False)
        self.faculty_tree.setUniformRowHeights(True)     # critical for performance
        self.faculty_tree.setExpandsOnDoubleClick(True)

        hdr = self.faculty_tree.header()
        hdr.setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        hdr.setSectionResizeMode(1, QHeaderView.ResizeMode.ResizeToContents)
        hdr.setSectionResizeMode(2, QHeaderView.ResizeMode.ResizeToContents)
        hdr.setSectionResizeMode(3, QHeaderView.ResizeMode.ResizeToContents)
        hdr.setSectionResizeMode(4, QHeaderView.ResizeMode.ResizeToContents)

        # Selection change → show details
        self.faculty_tree.itemSelectionChanged.connect(self._browser_item_selected)
        # Double-click a faculty row → populate targeted scrape + switch tab
        self.faculty_tree.itemDoubleClicked.connect(self._browser_item_double_clicked)
        browser_splitter.addWidget(self.faculty_tree)

        # Details pane
        self.browser_detail = QWidget()
        self.browser_detail.setStyleSheet("background: white; border: 1px solid #e2e8f0; border-radius: 6px;")
        dl = QVBoxLayout(self.browser_detail)
        dl.setContentsMargins(15, 15, 15, 15)
        dl.setSpacing(10)

        self.detail_image = QLabel()
        self.detail_image.setFixedSize(120, 120)
        self.detail_image.setStyleSheet("border: 1px solid #cbd5e1; border-radius: 8px; background: #f8fafc;")
        self.detail_image.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.detail_image.setText("No Photo")

        self.detail_name = QLabel("Select a faculty member")
        self.detail_name.setFont(QFont("Segoe UI", 16, QFont.Weight.Bold))
        self.detail_name.setStyleSheet("color: #002B5C; border: none;")

        self.detail_title = QLabel("")
        self.detail_title.setStyleSheet("color: #64748b; font-size: 13px; border: none;")

        header_row = QHBoxLayout()
        header_row.addWidget(self.detail_image)
        
        name_col = QVBoxLayout()
        name_col.addWidget(self.detail_name)
        name_col.addWidget(self.detail_title)
        name_col.addStretch()
        header_row.addLayout(name_col)
        header_row.addStretch()
        
        dl.addLayout(header_row)

        self.detail_bio = QTextEdit()
        self.detail_bio.setReadOnly(True)
        self.detail_bio.setStyleSheet("border: none; font-size: 13px; color: #334155;")
        dl.addWidget(self.detail_bio, stretch=1)

        browser_splitter.addWidget(self.browser_detail)
        browser_splitter.setSizes([600, 300])

        v.addWidget(browser_splitter, stretch=1)

        return tab

    # ── Next.js tab ───────────────────────────────────────────────────────────
    def _build_nextjs_tab(self):
        tab = QWidget()
        v = QVBoxLayout(tab)
        v.setContentsMargins(20, 20, 20, 20)
        v.setSpacing(12)
        v.setAlignment(Qt.AlignmentFlag.AlignTop)

        self.nextjs_btn = QPushButton("▶ Start Dev Server")
        self.nextjs_btn.setObjectName("red")
        self.nextjs_btn.clicked.connect(self._start_nextjs)
        v.addWidget(self.nextjs_btn)

        self.nextjs_stop_btn = QPushButton("⏹ Stop Dev Server")
        self.nextjs_stop_btn.setObjectName("grey")
        self.nextjs_stop_btn.setEnabled(False)
        self.nextjs_stop_btn.clicked.connect(self._stop_nextjs)
        v.addWidget(self.nextjs_stop_btn)

        build_btn = QPushButton("📦 Run Build")
        build_btn.setObjectName("slate")
        build_btn.clicked.connect(self._build_nextjs)
        v.addWidget(build_btn)

        v.addStretch()
        return tab

    # ── Environment tab ───────────────────────────────────────────────────────
    def _build_env_tab(self):
        tab = QWidget()
        v = QVBoxLayout(tab)
        v.setContentsMargins(10, 10, 10, 10)

        self.env_log = QPlainTextEdit()
        self.env_log.setObjectName("log")
        self.env_log.setReadOnly(True)
        v.addWidget(self.env_log, stretch=1)

        btn = QPushButton("Install Pipeline Dependencies")
        btn.setObjectName("green")
        btn.clicked.connect(self._install_deps)
        v.addWidget(btn)

        # Run env check
        QTimer.singleShot(300, self._check_env)
        return tab

    # ── Chat pane (right) ─────────────────────────────────────────────────────
    def _build_chat_pane(self):
        pane = QWidget()
        pane.setMinimumWidth(360)
        v = QVBoxLayout(pane)
        v.setContentsMargins(6, 12, 12, 12)
        v.setSpacing(8)

        # Header row
        row = QHBoxLayout()
        lbl = QLabel("Ollama Playground")
        lbl.setFont(QFont("Segoe UI", 14, QFont.Weight.Bold))
        row.addWidget(lbl)
        row.addStretch()
        self.chat_stop_btn = QPushButton("⏹ Stop")
        self.chat_stop_btn.setObjectName("red")
        self.chat_stop_btn.setEnabled(False)
        self.chat_stop_btn.clicked.connect(self._stop_chat)
        row.addWidget(self.chat_stop_btn)
        v.addLayout(row)

        # History
        self.chat_history = QTextEdit()
        self.chat_history.setObjectName("chat")
        self.chat_history.setReadOnly(True)
        self.chat_history.setHtml(
            "<p style='color:#94a3b8;'>Welcome to the Ollama Playground!<br>"
            "Test prompts here to see how your local model responds.</p>"
        )
        v.addWidget(self.chat_history, stretch=1)

        # Input
        self.chat_input = QTextEdit()
        self.chat_input.setObjectName("chatInput")
        self.chat_input.setFixedHeight(90)
        self.chat_input.setPlaceholderText("Type your message…")
        v.addWidget(self.chat_input)

        send_btn = QPushButton("Send")
        send_btn.setFont(QFont("Segoe UI", 13, QFont.Weight.Bold))
        send_btn.clicked.connect(self._send_chat)
        v.addWidget(send_btn)

        self._chat_active = False
        self._chat_thread = None
        return pane

    # ── Logging ───────────────────────────────────────────────────────────────
    def _log(self, message):
        self.log_area.appendPlainText(message)
        self.log_area.moveCursor(QTextCursor.MoveOperation.End)

    def _env_log(self, message):
        self.env_log.appendPlainText(message)

    # ── Ollama model management ───────────────────────────────────────────────
    def _refresh_models(self):
        base = self.url_edit.text().strip()
        self._log(f"[Network] Fetching models from {base}...")
        w = OllamaWorker(base)
        w.done.connect(self._on_models_loaded)
        w.log.connect(self._log)
        w.start()
        self._ollama_worker = w  # keep reference

    def _on_models_loaded(self, gen_models, active):
        current = self.model_combo.currentText()
        self.model_combo.clear()
        self.model_combo.addItems(gen_models)
        if current in gen_models:
            self.model_combo.setCurrentText(current)
        if active:
            self.active_label.setText(f"Loaded: {', '.join(active)}")
            self.active_label.setStyleSheet(f"color: {GREEN}; font-weight: bold;")
        else:
            self.active_label.setText("Loaded: None")
            self.active_label.setStyleSheet(f"color: {SLATE_400}; font-weight: bold;")

    def _load_model(self):
        model = self.model_combo.currentText()
        url   = f"{self.url_edit.text().strip()}/api/generate"
        self.active_label.setText("Loading…")
        w = ModelActionWorker(url, model, keep_alive=-1)
        w.log.connect(self._log)
        w.done.connect(self._refresh_models)
        w.start()
        self._model_action_worker = w

    def _unload_model(self):
        model = self.model_combo.currentText()
        url   = f"{self.url_edit.text().strip()}/api/generate"
        self.active_label.setText("Unloading…")
        w = ModelActionWorker(url, model, keep_alive=0)
        w.log.connect(self._log)
        w.done.connect(self._refresh_models)
        w.start()
        self._model_action_worker = w

    # ── Pipeline controls ─────────────────────────────────────────────────────
    def _run_full_pipeline(self):
        self.pipe_run_btn.setEnabled(False)
        self.pipe_stop_btn.setEnabled(True)
        self.pipe_progress.setText("Running… (0/6 stages)")

        script = os.path.join(BASE_DIR, "scraper", "run_scrape.py")
        cmd = [sys.executable, script]
        if self.skip_scrape_chk.isChecked():
            cmd.append("--skip-scrape")
        if self.force_extract_chk.isChecked():
            cmd.append("--force")

        env = {
            "OLLAMA_MODEL": self.model_combo.currentText(),
            "OLLAMA_URL":   f"{self.url_edit.text().strip()}/api/generate",
            "KEYWORD_COUNT": str(self.keyword_count_spin.value()),
        }

        STAGES = {
            "Running list scraper...":      "1/6 – Scraping Faculty List",
            "Running profile scraper...":   "2/6 – Scraping Profiles",
            "Extracting keywords...":       "3/6 – Extracting Keywords",
            "Building taxonomy...":         "4/6 – Building Taxonomy",
            "Building edges...":            "5/6 – Building Graph Edges",
            "Re-generating index.json...":  "6/6 – Generating Index",
        }

        def on_log(line):
            self._log(line)
            for k, v in STAGES.items():
                if line.strip() == k:
                    self.pipe_progress.setText(f"Running: {v}")
                    return
            if "Extracting keywords for" in line:
                name = line.split("for ")[-1].replace(".json...", "")
                self.pipe_progress.setText(f"3/6 – Extracting: {name}")

        def on_done(rc):
            self.pipe_run_btn.setEnabled(True)
            self.pipe_stop_btn.setEnabled(False)
            if rc == 0:
                self.pipe_progress.setText("✅ Complete! (6/6 stages)")
                self._status.showMessage("Pipeline complete.", 5000)
            else:
                self.pipe_progress.setText("❌ Stopped / Failed")

        self._pipeline_worker = ProcessWorker(cmd, BASE_DIR, env)
        self._pipeline_worker.log.connect(on_log)
        self._pipeline_worker.finished.connect(on_done)
        self._pipeline_worker.start()

    def _stop_pipeline(self):
        if self._pipeline_worker:
            self._pipeline_worker.stop()
        self.pipe_run_btn.setEnabled(True)
        self.pipe_stop_btn.setEnabled(False)
        self.pipe_progress.setText("Stopped")

    def _run_targeted_scrape(self):
        slug = self.target_slug.text().strip()
        if not slug:
            self._log("[Error] Enter a profile slug first.")
            return
        self._log(f"--- Targeted Scrape for {slug} ---")
        env = {
            "OLLAMA_MODEL": self.model_combo.currentText(),
            "OLLAMA_URL":   f"{self.url_edit.text().strip()}/api/generate",
            "KEYWORD_COUNT": str(self.keyword_count_spin.value()),
        }
        full_env = {**os.environ.copy(), **env}

        def run():
            subprocess.run(
                [sys.executable, os.path.join(BASE_DIR, "scraper", "profile_scraper.py"), "--target", slug],
                cwd=BASE_DIR,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
            )
            subprocess.run(
                [sys.executable, os.path.join(BASE_DIR, "pipeline", "extract_keywords.py"), "--target", slug, "--force"],
                cwd=BASE_DIR, env=full_env,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
            )
            self._log(f"--- Targeted Scrape Finished for {slug} ---")

        threading.Thread(target=run, daemon=True).start()

    def _install_deps(self):
        cmd = [sys.executable, "-m", "pip", "install", "-r", "pipeline/requirements.txt"]
        w = ProcessWorker(cmd, BASE_DIR)
        w.log.connect(self._env_log)
        w.finished.connect(lambda rc: self._env_log("Install complete." if rc == 0 else "Install failed."))
        w.start()
        self._pip_worker = w

    # ── Next.js controls ──────────────────────────────────────────────────────
    def _start_nextjs(self):
        self.nextjs_btn.setEnabled(False)
        self.nextjs_stop_btn.setEnabled(True)
        
        cmd = ["npm.cmd", "run", "dev"] if os.name == "nt" else ["npm", "run", "dev"]
        self._nextjs_worker = ProcessWorker(
            cmd,
            os.path.join(BASE_DIR, "web")
        )
        self._nextjs_worker.log.connect(self._log)
        self._nextjs_worker.finished.connect(self._on_nextjs_done)
        self._nextjs_worker.start()

    def _on_nextjs_done(self, rc):
        self.nextjs_btn.setEnabled(True)
        self.nextjs_stop_btn.setEnabled(False)

    def _stop_nextjs(self):
        if self._nextjs_worker:
            self._nextjs_worker.stop()

    def _build_nextjs(self):
        cmd = ["npm.cmd", "run", "build"] if os.name == "nt" else ["npm", "run", "build"]
        w = ProcessWorker(cmd, os.path.join(BASE_DIR, "web"))
        w.log.connect(self._log)
        w.start()
        self._build_worker = w

    # ── Environment check ─────────────────────────────────────────────────────
    def _check_env(self):
        self._env_log("Running Environment Diagnostics...")
        if shutil.which("node"):
            self._env_log("[OK] Node.js found: " + shutil.which("node"))
        else:
            self._env_log("[ERROR] Node.js NOT found in PATH — Next.js won't work.")
        self._env_log(f"[OK] Python: {sys.executable}")
        self._env_log(f"[OK] PyQt6 in use (high-performance Qt renderer).")
        self._refresh_models()

    # ── Faculty Browser ───────────────────────────────────────────────────────
    def _load_faculty_browser(self):
        self.browser_stats.setText("Loading…")
        self.faculty_tree.clear()
        w = FacultyLoaderWorker(os.path.join(BASE_DIR, "data", "faculty"))
        w.done.connect(self._render_faculty_browser)
        w.log.connect(self._log)
        w.start()
        self._faculty_worker = w

    def _render_faculty_browser(self, records):
        """
        Populate QTreeWidget with departments as top-level items and
        faculty as children. QTreeWidget renders 1000+ rows instantly
        because it paints items, not creates widgets per row.
        """
        self._all_faculty = records
        self._apply_browser_filter()

    def _apply_browser_filter(self):
        search = self.browser_search.text().lower().strip()
        records = self._all_faculty

        if search:
            def match(f):
                if search in f.get("name", "").lower():
                    return True
                for kw in f.get("extracted_keywords", []):
                    if isinstance(kw, dict):
                        if search in kw.get("canonical", "").lower() or search in kw.get("term", "").lower():
                            return True
                    elif search in str(kw).lower():
                        return True
                return False
            records = [f for f in records if match(f)]

        self.faculty_tree.setUpdatesEnabled(False)
        self.faculty_tree.clear()

        dept_map = defaultdict(list)
        for fac in records:
            dept = (fac.get("department") or "Unknown").strip() or "Unknown"
            dept_map[dept].append(fac)

        total = len(records)
        kw_done = sum(1 for f in records if f.get("extracted_keywords"))
        empty   = sum(1 for f in records
                      if not f.get("bio_raw") and not f.get("stated_interests") and not f.get("publications_raw"))

        for dept in sorted(dept_map.keys()):
            members = sorted(dept_map[dept], key=lambda x: x.get("name", ""))
            dept_item = QTreeWidgetItem(self.faculty_tree)
            dept_item.setText(0, f"{dept}  ({len(members)})")
            dept_item.setFont(0, QFont("Segoe UI", 11, QFont.Weight.Bold))
            dept_item.setForeground(0, QColor(ULAB_BLUE))
            dept_item.setBackground(0, QColor(SLATE_100))
            dept_item.setFirstColumnSpanned(True)
            dept_item.setExpanded(True)

            for fac in members:
                has_bio = bool((fac.get("bio_raw") or "").strip())
                has_kw  = bool(fac.get("extracted_keywords"))
                has_pub = bool(fac.get("publications_raw"))

                child = QTreeWidgetItem(dept_item)
                child.setData(0, Qt.ItemDataRole.UserRole, fac.get("id", ""))

                child.setText(0, fac.get("name", fac.get("id", "—")))
                child.setText(1, fac.get("title", ""))

                kws = fac.get("extracted_keywords", [])
                top_kw = []
                for kw in kws[:4]:
                    if isinstance(kw, dict):
                        # `or`, not `.get(key, fallback)` — canonical can be present but explicitly ''.
                        top_kw.append(kw.get("canonical") or kw.get("term") or str(kw))
                    else:
                        top_kw.append(str(kw))
                child.setText(2, "  ·  ".join(top_kw) if top_kw else "—")

                child.setText(3, "✓" if has_bio else "✗")
                child.setText(4, "✓" if has_pub else "✗")

                # Row color based on completeness
                if has_kw:
                    color = QColor("#f0fdf4")   # light green
                elif has_bio:
                    color = QColor("#fffbeb")   # light amber
                else:
                    color = QColor("#fff1f2")   # light red

                TEXT = QColor(SLATE_900)  # always dark text on light backgrounds
                for col in range(5):
                    child.setBackground(col, color)
                    child.setForeground(col, TEXT)  # explicit — never inherit white from palette
                # Override Bio/Pubs columns with status color
                child.setForeground(3, QColor(GREEN if has_bio else RED_LIGHT))
                child.setForeground(4, QColor(GREEN if has_pub else SLATE_400))

        self.faculty_tree.setUpdatesEnabled(True)
        self.browser_stats.setText(
            f"{total} faculty  |  {kw_done} with keywords  |  {empty} empty profiles  |  "
            f"{len(dept_map)} departments"
        )

    def _browser_item_selected(self):
        items = self.faculty_tree.selectedItems()
        if not items:
            return
        item = items[0]
        slug = item.data(0, Qt.ItemDataRole.UserRole)
        if not slug:
            return  # Probably a department row
            
        # Find the faculty record
        fac = next((f for f in self._all_faculty if f.get("id") == slug), None)
        if not fac:
            return

        self.detail_name.setText(fac.get("name", "Unknown"))
        self.detail_title.setText(fac.get("title", ""))
        
        # Load image if exists
        img_path = fac.get("local_image_path")
        if img_path and os.path.exists(img_path):
            pix = QPixmap(img_path)
            # scale keeping aspect ratio, crop if necessary
            pix = pix.scaled(120, 120, Qt.AspectRatioMode.KeepAspectRatioByExpanding, Qt.TransformationMode.SmoothTransformation)
            self.detail_image.setPixmap(pix)
            self.detail_image.setText("")
        else:
            self.detail_image.clear()
            self.detail_image.setText("No Photo")

        # Format bio and keywords
        bio = fac.get("bio_raw", "").strip()
        pubs = fac.get("publications_raw", [])
        interests = fac.get("stated_interests", [])
        
        html = []
        if interests:
            html.append(f"<b>Stated Interests:</b><br>{'<br>'.join(interests)}<br><br>")
        if bio:
            html.append(f"<b>Biography:</b><br>{bio.replace(chr(10), '<br>')}<br><br>")
        if pubs:
            html.append(f"<b>Publications:</b><br>{'<br><br>'.join(pubs)}")
            
        if not html:
            html.append("<i>No profile content scraped.</i>")
            
        self.detail_bio.setHtml("".join(html))

    def _browser_item_double_clicked(self, item, column):
        slug = item.data(0, Qt.ItemDataRole.UserRole)
        if slug:
            self.target_slug.setText(slug)
            self.tabs.setCurrentIndex(0)  # switch to Pipeline tab
            self._log(f"[Browser] Target set to: {slug}")

    # ── Chat playground ───────────────────────────────────────────────────────
    def _send_chat(self):
        prompt = self.chat_input.toPlainText().strip()
        if not prompt:
            return
        self.chat_input.clear()

        self.chat_history.append(f"<p><b style='color:{ULAB_BLUE};'>You:</b> {prompt}</p>")
        self.chat_stop_btn.setEnabled(True)
        self._chat_active = True

        ollama_url = f"{self.url_edit.text().strip()}/api/generate"
        model      = self.model_combo.currentText()

        def run():
            try:
                self.chat_history.append(f"<p><b style='color:{ULAB_RED};'>Ollama:</b> ")
                with requests.post(
                    ollama_url,
                    json={"model": model, "prompt": prompt, "stream": True, "keep_alive": -1},
                    stream=True, timeout=120
                ) as r:
                    r.raise_for_status()
                    for line in r.iter_lines():
                        if not self._chat_active:
                            break
                        if line:
                            data = json.loads(line)
                            chunk = data.get("response", "")
                            if chunk:
                                # Append chunk to last paragraph — use invokeMethod for thread safety
                                from PyQt6.QtCore import QMetaObject, Q_ARG
                                QMetaObject.invokeMethod(
                                    self, "_append_chat_chunk",
                                    Qt.ConnectionType.QueuedConnection,
                                    Q_ARG(str, chunk)
                                )
                            if data.get("done"):
                                break
            except Exception as e:
                QMetaObject.invokeMethod(
                    self, "_append_chat_chunk",
                    Qt.ConnectionType.QueuedConnection,
                    Q_ARG(str, f"[Error: {e}]")
                )
            QMetaObject.invokeMethod(
                self, "_chat_done",
                Qt.ConnectionType.QueuedConnection
            )

        self._chat_thread = threading.Thread(target=run, daemon=True)
        self._chat_thread.start()

    from PyQt6.QtCore import pyqtSlot

    @pyqtSlot(str)
    def _append_chat_chunk(self, chunk):
        cursor = self.chat_history.textCursor()
        cursor.movePosition(QTextCursor.MoveOperation.End)
        cursor.insertText(chunk)
        self.chat_history.setTextCursor(cursor)
        self.chat_history.ensureCursorVisible()

    @pyqtSlot()
    def _chat_done(self):
        self.chat_history.append("")
        self.chat_stop_btn.setEnabled(False)
        self._chat_active = False

    def _stop_chat(self):
        self._chat_active = False
        self.chat_stop_btn.setEnabled(False)

    def closeEvent(self, event):
        if self._pipeline_worker and self._pipeline_worker.isRunning():
            self._pipeline_worker.stop()
        if self._nextjs_worker and self._nextjs_worker.isRunning():
            self._nextjs_worker.stop()
        event.accept()


# ── Entry point ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    app = QApplication(sys.argv)
    app.setStyle("Fusion")          # consistent cross-platform base
    window = ControlPanel()
    window.show()
    sys.exit(app.exec())
