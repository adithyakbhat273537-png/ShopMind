"""Build a branded, print-ready A4 ShopMind invoice without third-party PDF packages."""
from datetime import datetime
import os
from pathlib import Path
import struct
import unicodedata
import zlib
from zoneinfo import ZoneInfo


PAGE_W, PAGE_H = 595, 842
NAVY = (0.055, 0.16, 0.28)
BLUE = (0.12, 0.39, 0.65)
ORANGE = (0.98, 0.43, 0.12)
PALE = (0.93, 0.96, 0.99)
INK = (0.11, 0.18, 0.26)
MUTED = (0.39, 0.48, 0.57)
LINE = (0.84, 0.89, 0.93)
WHITE = (1, 1, 1)


def _pdf_text(value):
    text = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode("ascii")
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)").replace("\r", " ").replace("\n", " ")


def _color(color, stroke=False):
    return f"{color[0]} {color[1]} {color[2]} {'RG' if stroke else 'rg'}\n"


def _rect(x, y, width, height, color):
    return f"{_color(color)}{x} {y} {width} {height} re f\n"


def _stroke_rect(x, y, width, height, color=LINE, line_width=0.7):
    return f"{_color(color, True)}{line_width} w {x} {y} {width} {height} re S\n"


def _text(value, x, y, size=10, bold=False, color=INK):
    return f"{_color(color)}BT /{'F2' if bold else 'F1'} {size} Tf {x} {y} Td ({_pdf_text(value)}) Tj ET\n"


def _line(x1, y1, x2, y2, color=LINE, width=0.65):
    return f"{_color(color, True)}{width} w {x1} {y1} m {x2} {y2} l S\n"


def _rupee(x, y, size=8, color=INK):
    scale = size / 12
    return (f"q {_color(color, True)}{scale} 0 0 {scale} {x} {y} cm 1 w "
            "1 10 m 9 10 l S 1 7.2 m 8 7.2 l S "
            "7.2 10 m 7 8.5 6 7.7 4 7.2 c S 4 7.2 m 8 0 l S "
            "1 0 m 8 0 l S Q\n")


def _amount(value, x, y, size=9, bold=False, color=INK):
    symbol_size = max(7, size * 0.82)
    return _rupee(x, y + 1, symbol_size, color) + _text(f"{float(value or 0):,.2f}", x + symbol_size + 3, y, size, bold, color)


def _format_date(value):
    if not value:
        return "-"
    try:
        parsed = value if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        ist = ZoneInfo("Asia/Kolkata")
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=ZoneInfo("UTC"))
        return parsed.astimezone(ist).strftime("%d %b %Y  |  %I:%M %p IST")
    except (TypeError, ValueError):
        return str(value)[:32]


def _png_logo():
    """Decode the repository's RGBA/RGB PNG into PDF-ready compressed image data."""
    path = Path(__file__).resolve().parents[2] / "logo.png"
    if not path.exists():
        return None
    raw = path.read_bytes()
    if not raw.startswith(b"\x89PNG\r\n\x1a\n"):
        return None
    pos, idat, ihdr = 8, bytearray(), None
    while pos + 12 <= len(raw):
        length = struct.unpack(">I", raw[pos:pos + 4])[0]
        kind = raw[pos + 4:pos + 8]
        data = raw[pos + 8:pos + 8 + length]
        if kind == b"IHDR":
            ihdr = struct.unpack(">IIBBBBB", data)
        elif kind == b"IDAT":
            idat.extend(data)
        elif kind == b"IEND":
            break
        pos += length + 12
    if not ihdr:
        return None
    width, height, depth, color_type, compression, filtering, interlace = ihdr
    channels = {2: 3, 6: 4}.get(color_type)
    if depth != 8 or channels is None or compression or filtering or interlace:
        return None
    stride = width * channels
    packed = zlib.decompress(bytes(idat))
    rows, prev, offset = [], bytearray(stride), 0
    for _ in range(height):
        filt = packed[offset]
        scan = bytearray(packed[offset + 1:offset + 1 + stride])
        offset += stride + 1
        for i in range(stride):
            left = scan[i - channels] if i >= channels else 0
            up = prev[i]
            upper_left = prev[i - channels] if i >= channels else 0
            if filt == 1:
                scan[i] = (scan[i] + left) & 255
            elif filt == 2:
                scan[i] = (scan[i] + up) & 255
            elif filt == 3:
                scan[i] = (scan[i] + ((left + up) >> 1)) & 255
            elif filt == 4:
                p = left + up - upper_left
                pa, pb, pc = abs(p - left), abs(p - up), abs(p - upper_left)
                predictor = left if pa <= pb and pa <= pc else up if pb <= pc else upper_left
                scan[i] = (scan[i] + predictor) & 255
            elif filt != 0:
                return None
        rows.append(scan)
        prev = scan
    if channels == 3:
        pixels = [bytes(row) for row in rows]
        alpha = None
        left, top, right, bottom = 0, 0, width, height
    else:
        left, top, right, bottom = width, height, 0, 0
        for y, row in enumerate(rows):
            for x in range(width):
                if row[x * 4 + 3] > 8:
                    left, top = min(left, x), min(top, y)
                    right, bottom = max(right, x + 1), max(bottom, y + 1)
        if right <= left or bottom <= top:
            return None
        pixels, alpha = [], []
        for row in rows[top:bottom]:
            rgb = bytearray(); a = bytearray()
            for x in range(left, right):
                rgb.extend(row[x * 4:x * 4 + 3]); a.append(row[x * 4 + 3])
            pixels.append(bytes(rgb)); alpha.append(bytes(a))
        width, height = right - left, bottom - top
    return {
        "width": width,
        "height": height,
        "rgb": zlib.compress(b"".join(pixels), 9),
        "alpha": zlib.compress(b"".join(alpha), 9) if alpha else None,
    }


def _header(invoice, order, page_number, logo):
    commands = [
        _rect(0, PAGE_H - 3, PAGE_W, 3, BLUE),
    ]
    if logo:
        scale = min(156 / logo["width"], 46 / logo["height"])
        w, h = logo["width"] * scale, logo["height"] * scale
        commands.append(f"q {w:.2f} 0 0 {h:.2f} {42 + (160-w)/2:.2f} {748 + (48-h)/2:.2f} cm /Im1 Do Q\n")
    else:
        commands.extend([
            _text("SHOPMIND", 42, 770, 18, True, NAVY),
            _text("HARDWARE  /  STORE SALES", 43, 753, 6.5, True, BLUE),
        ])
    store_name = os.getenv("SHOPMIND_STORE_NAME", "ShopMind Hardware Store")
    commands.extend([
        _text(store_name[:42], 38, 725, 8, True, NAVY),
        _text("INVOICE", 394, 778, 20, True, NAVY),
        _text(f"No.  {invoice.get('invoice_number') or '-'}", 394, 756, 9, True, BLUE),
        _text(f"Order  {order.get('order_number') or '-'}", 394, 738, 8, False, MUTED),
        _text(f"Page {page_number}", 518, 708, 7, False, MUTED),
    ])
    contact = [value for value in (
        os.getenv("SHOPMIND_STORE_PHONE", "").strip(),
        os.getenv("SHOPMIND_STORE_EMAIL", "").strip(),
        os.getenv("SHOPMIND_STORE_ADDRESS", "").strip(),
    ) if value]
    if not contact:
        contact = ["Hardware  /  Electrical  /  Home improvement"]
    for line_index, value in enumerate(contact[:3]):
        commands.append(_text(value[:76], 38, 709 - line_index * 12, 7, False, MUTED))
    gstin = os.getenv("SHOPMIND_GSTIN", "").strip()
    if gstin:
        commands.append(_text(f"GSTIN  {gstin[:24]}", 38, 673, 7, True, MUTED))
    commands.append(_line(38, 650, 558, 650, LINE, 0.8))
    return commands


def create_invoice_pdf(order, items, invoice):
    """Return a branded A4 invoice PDF using immutable order and invoice snapshots."""
    items = list(items or [])
    pages, remaining = [items[:10]], items[10:]
    while remaining:
        pages.append(remaining[:10])
        remaining = remaining[10:]
    logo = _png_logo()
    streams = []
    for page_index, page_items in enumerate(pages):
        page_no = page_index + 1
        commands = _header(invoice, order, page_no, logo)
        if page_index == 0:
            commands.extend([
                _stroke_rect(37, 558, 521, 82, LINE, 0.7),
                _text("BILLED TO", 52, 622, 7, True, BLUE),
                _text("CUSTOMER", 52, 604, 6.5, True, MUTED),
                _text((invoice.get("customer_name") or order.get("customer_name") or "Walk-in customer")[:32], 52, 586, 9, True, INK),
                _text("MOBILE", 245, 604, 6.5, True, MUTED),
                _text((invoice.get("customer_mobile") or order.get("customer_mobile") or "-")[:24], 245, 586, 8.5, True, INK),
                _text("EMAIL", 395, 604, 6.5, True, MUTED),
                _text((invoice.get("customer_email") or order.get("customer_email") or "-")[:34], 395, 586, 7.2, True, INK),
                _text((invoice.get("customer_email") or order.get("customer_email") or "")[34:68], 395, 575, 7.2, True, INK),
                _text("ISSUED", 38, 540, 6.5, True, MUTED),
                _text(_format_date(invoice.get("issued_at") or order.get("created_at")), 38, 526, 8, True, INK),
                _text(f"PAYMENT  {(invoice.get('payment_status') or 'paid').upper()}", 408, 526, 7, True, BLUE),
                _text(f"PAYMENT METHOD  {str(invoice.get('payment_method') or order.get('payment_method') or 'unspecified').replace('_', ' ').title()[:28]}", 38, 510, 6.5, True, MUTED),
            ])
            table_top, row_y, row_h = 501, 467, 22
        else:
            commands.append(_text(f"ITEMS CONTINUED  /  PAGE {page_no}", 38, 665, 8, True, BLUE))
            table_top, row_y, row_h = 636, 602, 19
        commands.extend([
            _line(37, table_top - 22, 558, table_top - 22, NAVY, 1),
            _text("PRODUCT / DESCRIPTION", 49, table_top - 14, 7, True, NAVY),
            _text("SKU", 280, table_top - 14, 7, True, NAVY),
            _text("QTY", 372, table_top - 14, 7, True, NAVY),
            _text("UNIT PRICE", 410, table_top - 14, 7, True, NAVY),
            _text("LINE TOTAL", 493, table_top - 14, 7, True, NAVY),
        ])
        y = row_y
        for i, item in enumerate(page_items):
            commands.extend([
                _text(str(item.get("product_name", "Item"))[:34], 49, y, 8, True, INK),
                _text(str(item.get("sku", "-"))[:15], 280, y, 7.3, False, MUTED),
                _text(f"{item.get('quantity', 0)} {item.get('unit_of_measure') or 'piece'}", 372, y, 8, False, INK),
                _amount(item.get("unit_price"), 410, y, 7.4),
                _amount(item.get("line_total"), 493, y, 7.4, True, NAVY),
                _line(37, y - 7, 558, y - 7, LINE, 0.45),
            ])
            y -= row_h
        commands.append(_line(37, y + 8, 558, y + 8))
        if page_index == len(pages) - 1:
            panel_y = max(139, y - 114)
            total_value = invoice.get("total") if invoice.get("total") is not None else order.get("total")
            commands.extend([
                _stroke_rect(327, panel_y, 231, 112, LINE, 0.7),
                _line(327, panel_y + 108, 558, panel_y + 108, BLUE, 1.2),
                _text("PAYMENT SUMMARY", 343, panel_y + 92, 7, True, BLUE),
                _text("Subtotal", 343, panel_y + 72, 8, False, MUTED),
                _amount(invoice.get("subtotal", order.get("subtotal")), 471, panel_y + 72, 8),
                _text("Tax / GST", 343, panel_y + 55, 8, False, MUTED),
                _amount(invoice.get("tax_amount", order.get("tax_amount")), 471, panel_y + 55, 8),
                _text("Discount", 343, panel_y + 38, 8, False, MUTED),
                _amount(invoice.get("discount_amount", order.get("discount_amount", 0)), 471, panel_y + 38, 8),
                _line(343, panel_y + 29, 541, panel_y + 29, (0.72, 0.82, 0.90)),
                _text("GRAND TOTAL", 343, panel_y + 11, 8, True, NAVY),
                _amount(total_value, 465, panel_y + 9, 11, True, NAVY),
                _rect(37, 70, 521, 1, LINE),
                _text("Thank you for shopping with ShopMind.", 38, 53, 8, True, BLUE),
                _text("We appreciate your business.", 38, 39, 7, False, MUTED),
                _text("Generated electronically  |  Keep this invoice for your records", 290, 39, 6.5, False, MUTED),
            ])
        else:
            commands.append(_text("Continued on the next page", 38, 42, 7, False, MUTED))
        streams.append("".join(commands).encode("ascii"))

    objects = [b"<< /Type /Catalog /Pages 2 0 R >>", b""]
    objects[1] = b"<< /Type /Pages /Kids [] /Count 0 >>"  # replaced after page objects are assembled
    objects.extend([b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"])
    xobjects = []
    if logo:
        logo_id = len(objects) + 1
        if logo["alpha"]:
            mask_id = logo_id
            objects.append(f"<< /Type /XObject /Subtype /Image /Width {logo['width']} /Height {logo['height']} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length {len(logo['alpha'])} >>\nstream\n".encode() + logo["alpha"] + b"\nendstream")
            objects.append(f"<< /Type /XObject /Subtype /Image /Width {logo['width']} /Height {logo['height']} /ColorSpace /DeviceRGB /BitsPerComponent 8 /SMask {mask_id} 0 R /Filter /FlateDecode /Length {len(logo['rgb'])} >>\nstream\n".encode() + logo["rgb"] + b"\nendstream")
            xobjects = [("Im1", logo_id + 1)]
        else:
            objects.append(f"<< /Type /XObject /Subtype /Image /Width {logo['width']} /Height {logo['height']} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length {len(logo['rgb'])} >>\nstream\n".encode() + logo["rgb"] + b"\nendstream")
            xobjects = [("Im1", logo_id)]
    page_ids = [len(objects) + 1 + i * 2 for i in range(len(streams))]
    objects[1] = b"<< /Type /Pages /Kids [" + b" ".join(f"{page_id} 0 R".encode() for page_id in page_ids) + b"] /Count " + str(len(streams)).encode() + b" >>"
    for index, stream in enumerate(streams):
        page_id = page_ids[index]
        stream_id = page_id + 1
        image_resource = (" /XObject << " + " ".join(f"/{name} {object_id} 0 R" for name, object_id in xobjects) + " >>") if xobjects else ""
        objects.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {PAGE_W} {PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>{image_resource} >> /Contents {stream_id} 0 R >>".encode())
        objects.append(f"<< /Length {len(stream)} >>\nstream\n".encode() + stream + b"endstream")

    pdf = bytearray(b"%PDF-1.4\n%ShopMind A4 invoice\n")
    offsets = [0]
    for object_id, body in enumerate(objects, 1):
        offsets.append(len(pdf))
        pdf.extend(f"{object_id} 0 obj\n".encode() + body + b"\nendobj\n")
    xref_offset = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode())
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode())
    pdf.extend(f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode())
    return bytes(pdf)
