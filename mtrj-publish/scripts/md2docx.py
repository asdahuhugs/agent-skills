# -*- coding: utf-8 -*-
"""把 SEO 稿件 Markdown 转为 DOCX（供媒体人家后台 Article_add.aspx 上传）"""
import re
import sys
import os

from docx import Document
from docx.shared import Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn


def set_font(run, name="宋体", size=None, bold=None, color=None):
    run.font.name = name
    run._element.rPr.rFonts.set(qn("w:eastAsia"), name)
    if size:
        run.font.size = Pt(size)
    if bold is not None:
        run.font.bold = bold
    if color:
        run.font.color.rgb = RGBColor(*color)


def add_inline(par, text, base_size=11, base_bold=False):
    """处理行内 **粗体** 与 [文字](链接)"""
    # 先切分粗体与链接
    tokens = re.split(r"(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))", text)
    for tk in tokens:
        if not tk:
            continue
        if tk.startswith("**") and tk.endswith("**"):
            r = par.add_run(tk[2:-2])
            set_font(r, "宋体", base_size, True)
        elif re.match(r"^\[[^\]]+\]\([^)]+\)$", tk):
            label = tk[1:tk.index("]")]
            url = tk[tk.index("(") + 1:-1]
            r = par.add_run(label)
            set_font(r, "宋体", base_size, base_bold, (5, 99, 193))
            r2 = par.add_run(f"（{url}）")
            set_font(r2, "宋体", base_size - 1, False, (5, 99, 193))
        else:
            r = par.add_run(tk)
            set_font(r, "宋体", base_size, base_bold)


def md_to_docx(md_path, docx_path):
    text = open(md_path, encoding="utf-8").read()
    doc = Document()

    # 默认样式
    st = doc.styles["Normal"]
    st.font.name = "宋体"
    st.font.size = Pt(11)
    st.element.rPr.rFonts.set(qn("w:eastAsia"), "宋体")

    lines = text.split("\n")
    i = 0
    while i < len(lines):
        ln = lines[i].rstrip()
        s = ln.strip()

        if not s:
            i += 1
            continue

        # 分隔线
        if re.match(r"^-{3,}$", s):
            i += 1
            continue

        # 标题
        m = re.match(r"^(#{1,6})\s+(.*)$", s)
        if m:
            lvl = len(m.group(1))
            content = m.group(2).strip()
            p = doc.add_paragraph()
            if lvl == 1:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                add_inline(p, content, base_size=16, base_bold=True)
                p.paragraph_format.space_after = Pt(12)
            elif lvl == 2:
                add_inline(p, content, base_size=14, base_bold=True)
                p.paragraph_format.space_before = Pt(10)
                p.paragraph_format.space_after = Pt(6)
            else:
                add_inline(p, content, base_size=12, base_bold=True)
                p.paragraph_format.space_before = Pt(8)
                p.paragraph_format.space_after = Pt(4)
            i += 1
            continue

        # 引用
        if s.startswith(">"):
            p = doc.add_paragraph()
            add_inline(p, s.lstrip("> ").strip(), base_size=10)
            p.paragraph_format.left_indent = Pt(12)
            i += 1
            continue

        # 列表
        m = re.match(r"^[-*+]\s+(.*)$", s)
        if m:
            p = doc.add_paragraph(style="List Bullet")
            add_inline(p, m.group(1), base_size=11)
            i += 1
            continue

        m = re.match(r"^(\d+)[.、]\s+(.*)$", s)
        if m:
            p = doc.add_paragraph(style="List Number")
            add_inline(p, m.group(2), base_size=11)
            i += 1
            continue

        # 普通段落
        p = doc.add_paragraph()
        add_inline(p, s, base_size=11)
        p.paragraph_format.first_line_indent = Pt(22)
        p.paragraph_format.space_after = Pt(6)
        i += 1

    doc.save(docx_path)
    return docx_path


if __name__ == "__main__":
    src = sys.argv[1]
    dst = sys.argv[2]
    md_to_docx(src, dst)
    print("OK ->", dst, os.path.getsize(dst), "bytes")
