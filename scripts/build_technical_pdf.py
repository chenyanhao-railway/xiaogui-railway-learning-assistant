from pathlib import Path
import re

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    KeepTogether,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "技术文档.md"
OUTPUT = ROOT / "docs" / "技术文档.pdf"
SCREENSHOT = ROOT / "preview.png"

NAVY = colors.HexColor("#10242D")
ORANGE = colors.HexColor("#C76A2E")
CREAM = colors.HexColor("#F3EFE7")
MIST = colors.HexColor("#E8EFF1")
INK = colors.HexColor("#10242D")
GRAY = colors.HexColor("#68777D")
LINE = colors.HexColor("#D8D1C5")

pdfmetrics.registerFont(TTFont("Deng", r"C:\Windows\Fonts\Deng.ttf"))
pdfmetrics.registerFont(TTFont("DengBold", r"C:\Windows\Fonts\Dengb.ttf"))


def clean_inline(text: str) -> str:
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return re.sub(r"`([^`]+)`", r"<font name='DengBold' color='#2E6579'>\1</font>", text)


body = ParagraphStyle(
    "Body",
    fontName="Deng",
    fontSize=10.4,
    leading=17.2,
    textColor=INK,
    wordWrap="CJK",
    spaceAfter=8,
)
heading1 = ParagraphStyle(
    "Heading1",
    fontName="DengBold",
    fontSize=16,
    leading=22,
    textColor=INK,
    wordWrap="CJK",
    spaceBefore=10,
    spaceAfter=8,
)
heading2 = ParagraphStyle(
    "Heading2",
    fontName="DengBold",
    fontSize=12.4,
    leading=18,
    textColor=colors.HexColor("#2E6579"),
    wordWrap="CJK",
    spaceBefore=8,
    spaceAfter=5,
)
bullet = ParagraphStyle(
    "Bullet",
    parent=body,
    leftIndent=16,
    firstLineIndent=-10,
    spaceAfter=4,
)
code = ParagraphStyle(
    "Code",
    fontName="Deng",
    fontSize=8.8,
    leading=13.5,
    textColor=INK,
    wordWrap="CJK",
    leftIndent=8,
    rightIndent=8,
    spaceBefore=4,
    spaceAfter=10,
    backColor=colors.HexColor("#F0EDE7"),
    borderColor=LINE,
    borderWidth=0.5,
    borderPadding=8,
)
small = ParagraphStyle(
    "Small",
    fontName="Deng",
    fontSize=8.4,
    leading=12,
    textColor=GRAY,
    wordWrap="CJK",
)


class TechnicalDoc(BaseDocTemplate):
    def __init__(self, filename):
        super().__init__(
            filename,
            pagesize=A4,
            leftMargin=20 * mm,
            rightMargin=20 * mm,
            topMargin=19 * mm,
            bottomMargin=18 * mm,
        )
        width, height = A4
        cover = PageTemplate(
            id="cover",
            frames=[Frame(20 * mm, 18 * mm, width - 40 * mm, height - 36 * mm)],
            onPage=self.draw_cover,
        )
        content = PageTemplate(
            id="content",
            frames=[Frame(20 * mm, 18 * mm, width - 40 * mm, height - 36 * mm)],
            onPage=self.draw_header_footer,
        )
        self.addPageTemplates([cover, content])

    @staticmethod
    def draw_cover(canvas, doc):
        width, height = A4
        canvas.saveState()
        canvas.setFillColor(CREAM)
        canvas.rect(0, 0, width, height, fill=1, stroke=0)
        canvas.setFillColor(NAVY)
        # Keep the title and subtitle on the navy field. The previous 235 pt
        # band ended above both lines, leaving white text on the cream page.
        canvas.rect(0, height - 340, width, 340, fill=1, stroke=0)
        canvas.setFillColor(colors.white)
        canvas.setFont("Deng", 10.5)
        canvas.drawString(20 * mm, height - 42 * mm, "2026第九届传智杯")
        canvas.drawString(20 * mm, height - 49 * mm, "AI创新应用挑战赛 · C组")
        canvas.setFont("DengBold", 28)
        canvas.drawString(20 * mm, height - 96 * mm, "小轨线路工学习助手")
        canvas.setFont("Deng", 14)
        canvas.setFillColor(colors.HexColor("#E8EFF1"))
        canvas.drawString(20 * mm, height - 116 * mm, "技术文档")
        canvas.restoreState()

    @staticmethod
    def draw_header_footer(canvas, doc):
        width, height = A4
        canvas.saveState()
        canvas.setFillColor(GRAY)
        canvas.setFont("Deng", 8)
        canvas.drawString(20 * mm, height - 11 * mm, "小轨线路工学习助手 · 技术文档")
        canvas.drawRightString(width - 20 * mm, height - 11 * mm, "2026-11-11")
        canvas.setStrokeColor(LINE)
        canvas.line(20 * mm, 13 * mm, width - 20 * mm, 13 * mm)
        canvas.drawString(20 * mm, 8 * mm, "陈研浩")
        canvas.drawRightString(width - 20 * mm, 8 * mm, str(doc.page))
        canvas.restoreState()


def story_from_markdown():
    lines = SOURCE.read_text(encoding="utf-8").splitlines()
    story = [
        NextPageTemplate("content"),
        Spacer(1, 1),
        PageBreak(),
        Paragraph("作品信息", heading1),
        Paragraph("作者：陈研浩", body),
        Paragraph("学校：哈尔滨铁道职业技术学院", body),
        Paragraph("专业：高速铁路施工与维护", body),
        Paragraph("赛道：AI创新应用挑战赛 · C组", body),
        Paragraph("版本：2026年11月11日", body),
        Spacer(1, 8),
        Image(str(SCREENSHOT), width=165 * mm, height=190 * mm),
        Paragraph("图 1 小轨线路工学习助手首页", small),
        PageBreak(),
    ]

    in_code = False
    code_lines = []
    paragraph = []

    def flush_paragraph():
        nonlocal paragraph
        if paragraph:
            story.append(Paragraph(clean_inline(" ".join(paragraph)), body))
            paragraph = []

    for raw in lines:
        line = raw.rstrip()
        if line.startswith("```"):
            flush_paragraph()
            if in_code:
                story.append(Paragraph("<br/>".join(clean_inline(x) for x in code_lines), code))
                code_lines = []
                in_code = False
            else:
                in_code = True
            continue
        if in_code:
            code_lines.append(line)
            continue
        if not line:
            flush_paragraph()
            continue
        if line.startswith("# "):
            continue
        if line.startswith("## "):
            flush_paragraph()
            story.append(Paragraph(clean_inline(line[3:]), heading1))
            continue
        if line.startswith("### "):
            flush_paragraph()
            story.append(Paragraph(clean_inline(line[4:]), heading2))
            continue
        if re.match(r"^\d+\.\s+", line):
            flush_paragraph()
            story.append(Paragraph(clean_inline(line), bullet))
            continue
        if line.startswith("- "):
            flush_paragraph()
            story.append(Paragraph("• " + clean_inline(line[2:]), bullet))
            continue
        paragraph.append(line)
    flush_paragraph()
    return story


def build():
    doc = TechnicalDoc(str(OUTPUT))
    cover_story = [
        Spacer(1, 1),
        PageBreak(),
    ]
    # The cover is drawn by the template. The body content starts on a new page.
    doc.build(story_from_markdown())
    print(OUTPUT)


if __name__ == "__main__":
    build()
