"""One-screen, local-first experimental CAM workbench.

Preview is a top projection of the real STEP mesh and mathematically generated
facing tool centre line, not a stock-removal or collision simulation.
"""
from __future__ import annotations

import hashlib
from pathlib import Path
import tkinter as tk
from tkinter import ttk, filedialog, messagebox

from .cad import Part, inspect_step
from .core import Setup, Tool, Plan, plan_facing
from .post import review_gcode, export_plan_json

BG, PANEL, CANVAS_BG = "#000000", "#0b0b0b", "#050505"
TEXT, MUTED, LIME, TEAL = "#eeeeee", "#acacac", "#a6ca8d", "#a0aebd"


class Desktop:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.part: Part | None = None
        self.plan: Plan | None = None
        self.demo = True
        self.replay_job = None
        self.root.title("EZ CAM | Intelligent Machining Workbench | Experimental")
        self.root.geometry("1120x720")
        self.root.minsize(900, 590)
        self.root.configure(bg=BG)
        # Keep platform comboboxes dark, including their read-only selection field.
        style = ttk.Style(self.root)
        style.configure("EZDark.TCombobox", foreground=TEXT, fieldbackground="#090909",
                        background="#1b1b1b", bordercolor="#333333", arrowcolor=TEXT,
                        selectforeground=TEXT, selectbackground="#202020")
        style.map("EZDark.TCombobox",
                  fieldbackground=[("readonly", "#090909")],
                  foreground=[("readonly", TEXT)])
        self.margin_mm = 3.0
        self.vars = {
            "stock_w": tk.StringVar(value="86"),
            "stock_h": tk.StringVar(value="56"),
            "allowance": tk.StringVar(value="1.0"),
            "diameter": tk.StringVar(value="10"),
            "stepover": tk.StringVar(value="60"),
            "stepdown": tk.StringVar(value="0.5"),
            "feed": tk.StringVar(value="450"),
            "plunge": tk.StringVar(value="100"),
            "clearance": tk.StringVar(value="5"),
            "origin": tk.StringVar(value="front-left"),
        }
        self.play_pct = tk.DoubleVar(value=100)
        self.status = tk.StringVar(value="Synthetic demo | Load STEP or build a facing preview")
        self.source_info = tk.StringVar(value="Fictional 80 × 50 × 12 mm plate")
        self._make_ui()
        for variable in self.vars.values():
            variable.trace_add("write", self._invalidate)
        self.canvas.bind("<Configure>", lambda _: self.redraw())
        self.redraw()

    def _make_ui(self):
        head = tk.Frame(self.root, bg=BG, padx=18, pady=10)
        head.pack(side="top", fill="x")
        tk.Label(head, text="EZ CAM", bg=BG, fg=LIME, font=("Segoe UI", 22, "bold")).pack(side="left")
        tk.Label(head, text="  STEP IN  •  SET DATUM  •  SELECT TOOL  •  PREVIEW",
                 bg=BG, fg=MUTED, font=("Segoe UI", 10)).pack(side="left", pady=6)
        tk.Label(head, text="V0.1 · REVIEW ONLY", bg=BG, fg="#decf9e",
                 font=("Segoe UI", 10, "bold")).pack(side="right")

        body = tk.Frame(self.root, bg=BG)
        body.pack(fill="both", expand=True, padx=12)
        side = tk.Frame(body, bg=PANEL, width=286, padx=16, pady=10)
        side.pack(side="left", fill="y", padx=(0, 10))
        side.pack_propagate(False)

        self._heading(side, "01  MODEL")
        self._button(side, "OPEN STEP MODEL", self.open_step, strong=True)
        self._button(side, "Load fictional demo", self.load_demo)
        tk.Label(side, textvariable=self.source_info, bg=PANEL, fg=MUTED,
                 anchor="w", justify="left", wraplength=240, font=("Segoe UI", 9)).pack(fill="x", pady=(3, 9))

        self._heading(side, "02  STOCK / DATUM")
        self._entry(side, "Stock X (mm)", "stock_w")
        self._entry(side, "Stock Y (mm)", "stock_h")
        self._entry(side, "Top to remove (mm)", "allowance")
        self._combo(side, "G54 XY datum", "origin", ("front-left", "center"))
        tk.Label(side, text="Z0 = top of raw stock.  +Z = up.", bg=PANEL,
                 fg=MUTED, font=("Segoe UI", 8)).pack(anchor="w", pady=(0, 5))

        self._heading(side, "03  TOOL / CUT")
        self._combo(side, "Flat end mill Ø (mm)", "diameter", ("6", "8", "10", "12", "16"))
        self._entry(side, "Stepover (%)", "stepover")
        self._entry(side, "Stepdown (mm)", "stepdown")
        self._entry(side, "Feed XY (mm/min)", "feed")
        self._entry(side, "Plunge (mm/min)", "plunge")
        self._entry(side, "Clearance above stock (mm)", "clearance")

        self._heading(side, "04  PATH")
        self._button(side, "BUILD FACING PATH", self.build, strong=True)
        self._button(side, "Export preview JSON", self.export_json)
        self._button(side, "Export review-only G-code TXT", self.export_review)

        right = tk.Frame(body, bg=CANVAS_BG)
        right.pack(side="left", fill="both", expand=True)
        bar = tk.Frame(right, bg=PANEL, padx=12, pady=8)
        bar.pack(fill="x")
        tk.Label(bar, text="TOP VIEW / TOOL CENTRE PREVIEW", bg=PANEL, fg=TEXT,
                 font=("Segoe UI", 11, "bold")).pack(side="left")
        self.detail = tk.Label(bar, text="No path generated", bg=PANEL, fg=TEAL,
                               font=("Segoe UI", 9))
        self.detail.pack(side="right")
        self.canvas = tk.Canvas(right, bg=CANVAS_BG, bd=0, highlightthickness=0)
        self.canvas.pack(fill="both", expand=True)
        playback = tk.Frame(right, bg=PANEL, padx=12, pady=8)
        playback.pack(fill="x")
        tk.Label(playback, text="Path playback", bg=PANEL, fg=MUTED).pack(side="left")
        tk.Scale(playback, from_=0, to=100, orient="horizontal", showvalue=False,
                 bg=PANEL, fg=TEXT, troughcolor=BG, activebackground=LIME,
                 highlightthickness=0, variable=self.play_pct,
                 command=lambda _: self.redraw()).pack(side="left", fill="x", expand=True, padx=8)
        self._button(playback, "▶ Replay", self.replay, compact=True)
        foot = tk.Label(self.root, textvariable=self.status, bg=BG, fg=TEXT,
                        anchor="w", padx=16, pady=9, font=("Segoe UI", 9))
        foot.pack(side="bottom", fill="x")

    @staticmethod
    def _heading(parent, title):
        tk.Label(parent, text=title, bg=PANEL, fg=LIME,
                 font=("Segoe UI", 10, "bold"), anchor="w").pack(fill="x", pady=(5, 2))

    def _button(self, parent, title, action, strong=False, compact=False):
        button = tk.Button(parent, text=title, command=action, relief="flat",
                           bg=LIME if strong else "#1b1b1b", fg="#101010" if strong else TEXT,
                           activebackground=TEAL, activeforeground="#101010", cursor="hand2",
                           font=("Segoe UI", 9, "bold" if strong else "normal"), pady=5,
                           padx=8)
        button.pack(side="left" if compact else "top", fill="x" if not compact else "none", pady=1)
        return button

    def _entry(self, parent, title, key):
        row = tk.Frame(parent, bg=PANEL)
        row.pack(fill="x", pady=0)
        tk.Label(row, text=title, bg=PANEL, fg=TEXT, anchor="w",
                 font=("Segoe UI", 9)).pack(side="left")
        tk.Entry(row, textvariable=self.vars[key], bg="#090909", fg=TEXT,
                 insertbackground=LIME, highlightthickness=0, width=8,
                 justify="right").pack(side="right")

    def _combo(self, parent, title, key, choices):
        row = tk.Frame(parent, bg=PANEL)
        row.pack(fill="x", pady=0)
        tk.Label(row, text=title, bg=PANEL, fg=TEXT, anchor="w",
                 font=("Segoe UI", 9)).pack(side="left")
        ttk.Combobox(row, textvariable=self.vars[key], values=choices,
                     state="readonly", style="EZDark.TCombobox", width=9).pack(side="right")

    def _invalidate(self, *_):
        self.plan = None
        self._cancel_replay()
        self.detail.config(text="Settings changed; rebuild path")
        self.redraw()

    def _cancel_replay(self):
        if self.replay_job is not None:
            self.root.after_cancel(self.replay_job)
            self.replay_job = None

    def load_demo(self):
        self.part = None
        self.demo = True
        self.vars["stock_w"].set("86")
        self.vars["stock_h"].set("56")
        self.source_info.set("FICTIONAL demo: 80 × 50 mm plate, illustrative holes")
        self.status.set("Synthetic demonstration, not a machined part")
        self.redraw()

    def open_step(self):
        path = filedialog.askopenfilename(title="Open a STEP solid", filetypes=[("STEP CAD", "*.step *.stp")])
        if not path:
            return
        try:
            part = inspect_step(path)
            self.part, self.demo = part, False
            self.vars["stock_w"].set(f"{part.width_mm + 2*self.margin_mm:.3f}")
            self.vars["stock_h"].set(f"{part.height_mm + 2*self.margin_mm:.3f}")
            self.source_info.set(f"{Path(path).name} | {part.width_mm:.1f} × {part.height_mm:.1f} × {part.depth_mm:.1f} mm | {len(part.top_faces)} top faces")
            self.status.set("Real STEP geometry imported; verify orientation, fixturing and stock")
            self.redraw()
        except Exception as exc:
            messagebox.showerror("STEP import", str(exc))

    def _read_inputs(self):
        get = lambda k: float(self.vars[k].get())
        setup = Setup(get("stock_w"), get("stock_h"), get("allowance"), self.vars["origin"].get())
        tool = Tool(get("diameter"), get("stepover") / 100, get("stepdown"),
                    get("feed"), get("plunge"), get("clearance"))
        if self.part and (setup.width_mm < self.part.width_mm or setup.height_mm < self.part.height_mm):
            raise ValueError("Stock XY cannot be smaller than the imported STEP model")
        return setup, tool

    def _verify_source(self):
        if self.part:
            source = Path(self.part.path)
            if not source.is_file() or hashlib.sha256(source.read_bytes()).hexdigest() != self.part.sha256:
                raise ValueError("STEP file changed since import. Reopen before generating or exporting")

    def build(self):
        try:
            self._verify_source()
            setup, tool = self._read_inputs()
            self.plan = plan_facing(setup, tool, self.part.sha256 if self.part else None)
            self.play_pct.set(100)
            self.detail.config(text=f"{self.plan.passes} Z levels · {len(self.plan.moves)} moves")
            self.status.set("Facing path preview generated. NOT a gouge, clamp or stock-removal simulation")
            self.redraw()
        except (ValueError, RuntimeError, OSError) as exc:
            self.plan = None
            messagebox.showerror("Build failed", str(exc))

    def export_json(self):
        self._export("ezcam_plan_preview.json", export_plan_json)

    def export_review(self):
        self._export("ezcam_gcode_REVIEW_ONLY.txt", review_gcode)

    def _export(self, default_name, serializer):
        if self.plan is None:
            messagebox.showwarning("No path", "Build a toolpath first")
            return
        try:
            self._verify_source()
            dest = filedialog.asksaveasfilename(title="Export for offline review only",
                                                initialfile=default_name,
                                                defaultextension=Path(default_name).suffix)
            if dest:
                Path(dest).write_text(serializer(self.plan), encoding="utf-8")
                self.status.set(f"Review data saved: {Path(dest).name} (not machine validated)")
        except (OSError, ValueError) as exc:
            messagebox.showerror("Export blocked", str(exc))

    def replay(self):
        if self.plan is None:
            return
        self._cancel_replay()
        self.play_pct.set(0)
        self._play_next()

    def _play_next(self):
        value = self.play_pct.get() + 2
        self.play_pct.set(min(100, value))
        self.redraw()
        if value < 100:
            self.replay_job = self.root.after(40, self._play_next)
        else:
            self.replay_job = None

    def redraw(self):
        if not hasattr(self, "canvas"):
            return
        c = self.canvas
        c.delete("all")
        w, h = max(c.winfo_width(), 2), max(c.winfo_height(), 2)
        try:
            setup, tool = self._read_inputs()
        except (ValueError, TypeError):
            c.create_text(w/2, h/2, text="Enter valid stock and tool values", fill=MUTED)
            return
        # Keep the stock and any outside-stock tool-centre path in view.
        pad = max(tool.diameter_mm, 6)
        scale = min((w - 70) / (setup.width_mm + 2*pad), (h - 70) / (setup.height_mm + 2*pad))
        if scale <= 0:
            return
        base_x = (w - setup.width_mm * scale) / 2
        base_y = (h + setup.height_mm * scale) / 2
        xy = lambda x, y: (base_x + x * scale, base_y - y * scale)
        x0,y0 = xy(0,0)
        x1,y1 = xy(setup.width_mm,setup.height_mm)
        c.create_rectangle(x0,y1,x1,y0, fill="#303030", outline="#bbbbbb", width=2)
        # Imported STEP tessellation is an actual CAD-derived 2D projection.
        if self.part:
            p = self.part
            mx = (setup.width_mm - p.width_mm) / 2
            my = (setup.height_mm - p.height_mm) / 2
            ordered = sorted(p.triangles, key=lambda t: sum(v[2] for v in t) / 3)
            for tri in ordered:
                pts = []
                for vertex in tri:
                    pts.extend(xy(vertex[0] - p.bounds_mm[0] + mx, vertex[1] - p.bounds_mm[1] + my))
                shade = "#565656" if sum(v[2] for v in tri) / 3 > (p.bounds_mm[2] + p.bounds_mm[5]) / 2 else "#383838"
                c.create_polygon(*pts, fill=shade, outline="")
            c.create_text(w/2, 22, text="Imported STEP · top projection · not collision verified", fill=MUTED)
        else:
            mx, my = (setup.width_mm - 80)/2, (setup.height_mm - 50)/2
            pa,pb = xy(mx,my)
            pc,pd = xy(mx+80,my+50)
            c.create_rectangle(pa,pd,pc,pb,fill="#525252",outline="#aaaaaa",width=1)
            for ix in (20,60):
                cx,cy = xy(mx+ix,my+25)
                rr = 3*scale
                c.create_oval(cx-rr,cy-rr,cx+rr,cy+rr,fill=CANVAS_BG,outline="#cccccc",width=2)
            c.create_text(w/2, 22, text="FICTIONAL PART / PREVIEW ONLY", fill=MUTED)
        # Datum indicator: centered-origin or front-left, both Z0 on stock top.
        ox,oy = (0,0) if setup.origin == "front-left" else (setup.width_mm/2,setup.height_mm/2)
        dx,dy = xy(ox,oy)
        c.create_line(dx-10,dy,dx+12,dy,fill=LIME,width=2,arrow="last")
        c.create_line(dx,dy+10,dx,dy-12,fill=TEAL,width=2,arrow="last")
        c.create_text(dx+12,dy+12,text="G54",anchor="nw",fill=LIME)
        if self.plan:
            total = max(1, int(len(self.plan.moves)*self.play_pct.get()/100))
            last = None
            for move in self.plan.moves[:total]:
                if last is not None:
                    sx,sy = xy(last.x,last.y)
                    ex,ey = xy(move.x,move.y)
                    if move.mode == "feed" and abs(move.z-last.z) < 1e-7:
                        c.create_line(sx,sy,ex,ey,fill=LIME,width=1.4)
                    elif move.mode == "rapid":
                        c.create_line(sx,sy,ex,ey,fill="#c8a17d",dash=(3,4))
                last = move
            if last is not None:
                px,py = xy(last.x,last.y)
                rr = max(2,tool.diameter_mm*scale/2)
                c.create_oval(px-rr,py-rr,px+rr,py+rr,outline="#ead7a0",width=2)
                c.create_text(w-12,h-12,text=f"TOOL Z {last.z:.2f} mm",anchor="se",fill=TEXT)
        c.create_text(12,h-12,text=f"STOCK {setup.width_mm:g} × {setup.height_mm:g} mm",
                      anchor="sw",fill=TEXT)


def main():
    root = tk.Tk()
    Desktop(root)
    root.mainloop()
