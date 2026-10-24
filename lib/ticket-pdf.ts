// The haul ticket as a PDF — laid out to mirror the Jon Stubbs Trucking paper
// pad it replaced: the company header with the ticket number top right, the
// carrier/contractor/pit/job/material block beside the day/date/driver/truck
// block, the 28-row load table (two columns of fourteen) with the driver's
// daily safety check down the right, the totals and notes boxes, and the
// terms with the foreman's and driver's signatures on their lines.
//
// Generated server-side when a ticket is approved/invoiced or shared, stored
// next to the ticket's photos in the work-tickets bucket, attached to the
// QuickBooks invoice, and linked in the factoring hand-off.
//
// Deliberately carries NO rates or dollar amounts — same as the paper form.
// The same document rides with the customer's invoice, the hauler's
// factoring packet, and whoever the driver texts it to.

import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  totalHours, onSiteHours, countLoads, lastUnloadAt,
  MAX_LOADS, SAFETY_CHECK_ITEMS,
  type WorkOrder, type WorkOrderLoad,
} from '@/lib/work-orders';

// The printed header, hardcoded on purpose to mirror the paper pad. This is
// the ONE place the company's identity lives on the ticket — copied from the
// pad itself.
export const COMPANY = {
  name: 'Jon Stubbs Trucking',
  addressLine: '60 SOUTH SLANT RD MAPLETON, UTAH 84664',
  phoneLine: 'TRUCKING: JON - 801-428-7222   OFFICE: JEN - 801-919-4404, MEGAN - 435-681-0144',
  emailLine: 'EMAIL: JONSTUBBSTRUCKINGLLC@GMAIL.COM',
};

// The fine print at the foot of the pad, word for word.
const FINANCE_TERMS =
  'This account is due and payable on the 15th of each month. If the account becomes delinquent, '
  + '15th of the following month, I or we, the undersigned agree to pay a FINANCE CHARGE AT THE RATE OF '
  + '2% PER MONTH WHICH IS 24% PER ANNUM, before and after judgement, until paid. That if this account is '
  + 'placed in the hands of an attorney for collection, with or without suit, to pay a reasonable attorney\'s fee.';
const DELIVERY_TERMS =
  'I understand that loaded trucks can cause damage to concrete, landscaping, sprinkler systems, and other '
  + 'items that may be on property designated for delivery and I, therefore, specifically agree to hold '
  + `${COMPANY.name} and its agent harmless for any damage caused by movement of the delivery vehicle while `
  + `accessing or egressing the location I have designated delivery. ${COMPANY.name} will pay Lessor within `
  + '10 days of receiving payment from contractor.';

const BUCKET = 'work-tickets';

const INK = rgb(0, 0, 0);
const GRAY = rgb(0.88, 0.88, 0.88);

const DAY_LABELS = ['SUN', 'MON', 'TUES', 'WED', 'THURS', 'FRI', 'SAT'];

// "7:30 AM" — the START/END lines and the totals.
const fmtClock = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  let h = d.getHours();
  const mer = h >= 12 ? 'PM' : 'AM';
  h = ((h + 11) % 12) + 1;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')} ${mer}`;
};
// "7:30a" — the load table, where a cell holds two of them.
const fmtShort = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  let h = d.getHours();
  const mer = h >= 12 ? 'p' : 'a';
  h = ((h + 11) % 12) + 1;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')}${mer}`;
};
const fmtStamp = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${fmtClock(iso)}`;
};
// The day of the week the ticket's date falls on, as the pad's circled day.
// job_date is a plain calendar date, so it's parsed as one — not as UTC
// midnight, which would put a Monday on Sunday west of Greenwich.
function dayIndex(jobDate: string | null): number | null {
  if (!jobDate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(jobDate);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d.getDay();
}
const hoursText = (n: number) => (n > 0 ? n.toFixed(2).replace(/\.?0+$/, '') : '');

// Build the PDF bytes for one ticket.
export async function buildTicketPdf(
  db: SupabaseClient,
  wo: WorkOrder,
  loads: WorkOrderLoad[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]); // US Letter
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const serifBold = await doc.embedFont(StandardFonts.TimesRomanBold);

  const L = 40;   // outer left
  const R = 572;  // outer right

  const text = (s: string, x: number, y: number, size = 8, f: PDFFont = font) => {
    if (s) page.drawText(s, { x, y, size, font: f, color: INK });
  };
  const centered = (s: string, cx: number, y: number, size: number, f: PDFFont) => {
    if (s) text(s, cx - f.widthOfTextAtSize(s, size) / 2, y, size, f);
  };
  const rightAligned = (s: string, rx: number, y: number, size: number, f: PDFFont) => {
    if (s) text(s, rx - f.widthOfTextAtSize(s, size), y, size, f);
  };
  const hline = (x1: number, x2: number, y: number, w = 0.7) =>
    page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: w, color: INK });
  const vline = (x: number, y1: number, y2: number, w = 0.7) =>
    page.drawLine({ start: { x, y: y1 }, end: { x, y: y2 }, thickness: w, color: INK });
  const box = (x1: number, y1: number, x2: number, y2: number, w = 1) =>
    page.drawRectangle({ x: x1, y: y1, width: x2 - x1, height: y2 - y1, borderColor: INK, borderWidth: w });
  // A labeled fill-in line, the backbone of the paper form: a serif capitals
  // label, a rule, and the value written on it. Returns where the rule
  // starts so a signature can sit on it.
  const fill = (label: string, x: number, lineEnd: number, y: number, value: string | null, labelSize = 8, valueSize = 8.5) => {
    text(label, x, y, labelSize, serifBold);
    const lx = x + serifBold.widthOfTextAtSize(label, labelSize) + 4;
    hline(lx, lineEnd, y - 1.5, 0.6);
    if (value) {
      // Trim to the line rather than running past it.
      let v = String(value);
      while (v.length > 1 && font.widthOfTextAtSize(v, valueSize) > lineEnd - lx - 4) v = v.slice(0, -1);
      text(v, lx + 2, y + 0.5, valueSize);
    }
    return lx;
  };
  // Word-wrap a paragraph to a width, at most `max` lines.
  const wrap = (s: string, f: PDFFont, size: number, width: number, max = 50): string[] => {
    const out: string[] = [];
    let line = '';
    for (const w of s.replace(/\s+/g, ' ').trim().split(' ')) {
      const probe = line ? `${line} ${w}` : w;
      if (f.widthOfTextAtSize(probe, size) <= width) { line = probe; continue; }
      if (line) out.push(line);
      line = w;
      if (out.length >= max) break;
    }
    if (line && out.length < max) out.push(line);
    return out.slice(0, max);
  };

  // ---- Header, as printed on the pad ----
  centered(COMPANY.name, 306, 760, 22, serifBold);
  centered(COMPANY.addressLine, 306, 746, 8, serifBold);
  centered(COMPANY.phoneLine, 306, 735, 8, serifBold);
  centered(COMPANY.emailLine, 306, 724, 8, serifBold);
  // The pre-printed ticket number, top right.
  rightAligned(wo.ticket_number || '', R - 2, 756, 12, font);

  // ---- The two header boxes ----
  const hbTop = 712;
  const hbBottom = 604;
  const midGap = 304;
  box(L, hbBottom, midGap - 2, hbTop);
  box(midGap + 2, hbBottom, R, hbTop);

  // Left: who, where, what.
  let y = hbTop - 17;
  const lx = L + 8;
  const lEnd = midGap - 10;
  fill('CARRIER NAME', lx, lEnd, y, wo.trucking_company); y -= 15.4;
  fill('CONTRACTOR NAME', lx, lEnd, y, wo.customer_number); y -= 15.4;
  fill('PIT ADDRESS', lx, lEnd, y, wo.pit_address); y -= 15.4;
  fill('JOB NAME', lx, lEnd, y, wo.job_name); y -= 15.4;
  fill('JOB ADDRESS', lx, lEnd, y, wo.job_address); y -= 15.4;
  fill('MATERIAL', lx, lEnd, y, wo.material);

  // Right: the day circled, then the driver and the truck.
  const rx = midGap + 10;
  const rEnd = R - 8;
  y = hbTop - 13;
  const today = dayIndex(wo.job_date);
  const slot = (rEnd - rx) / DAY_LABELS.length;
  DAY_LABELS.forEach((d, i) => {
    const cx = rx + slot * i + slot / 2;
    centered(d, cx, y, 7.5, serifBold);
    if (today === i) {
      page.drawEllipse({
        x: cx, y: y + 2.6,
        xScale: serifBold.widthOfTextAtSize(d, 7.5) / 2 + 4, yScale: 6,
        borderColor: INK, borderWidth: 0.9,
      });
    }
  });
  y -= 12.4;
  fill('DATE', rx, rEnd, y, wo.job_date); y -= 12.4;
  fill('DRIVER', rx, rEnd, y, wo.driver_name); y -= 12.4;
  fill('TRUCK NO.', rx, rEnd, y, wo.unit_number); y -= 12.4;
  fill('TYPE OF TRUCK', rx, rEnd, y, wo.truck_type); y -= 12.4;
  fill('PLATE #', rx, rEnd, y, wo.plate_number); y -= 12.4;
  // Two START/END rows, like the pad: the billable haul first (what the
  // stamps and the totals run on), then the driver's own clock if it
  // differs or the day split in two.
  const rMid = rx + (rEnd - rx) / 2;
  fill('START', rx, rMid - 8, y, fmtClock(wo.start_at), 8, 8);
  fill('END', rMid, rEnd, y, fmtClock(wo.stop_at), 8, 8);
  y -= 12.4;
  fill('START', rx, rMid - 8, y, fmtClock(wo.driver_start_at), 8, 8);
  fill('END', rMid, rEnd, y, fmtClock(wo.driver_end_at), 8, 8);

  // ---- The load table: two blocks of fourteen, safety check down the side ----
  const tTop = hbBottom - 8;          // 604
  const headH = 12;
  const rowH = 15.5;
  const perBlock = MAX_LOADS / 2;     // 14
  const bodyTop = tTop - headH;
  const tBottom = bodyTop - perBlock * rowH;
  const blockW = 210;
  const blockX = [L, L + blockW + 6];
  const colOff = [0, 22, 78, 128, 166, blockW];
  const heads = ['LOAD #', 'LOAD TIME', 'TICKET', 'TONS', 'MATERIAL'];
  const byNo = new Map(loads.map((l) => [l.load_no, l]));

  for (let b = 0; b < 2; b++) {
    const x0 = blockX[b];
    const cols = colOff.map((o) => x0 + o);
    // Header row, shaded like the pad.
    page.drawRectangle({ x: x0, y: bodyTop, width: blockW, height: headH, color: GRAY });
    heads.forEach((h, i) => centered(h, (cols[i] + cols[i + 1]) / 2, bodyTop + 3.5, 5.5, serifBold));
    for (let i = 0; i < perBlock; i++) {
      const no = b * perBlock + i + 1;
      const rowY = bodyTop - (i + 1) * rowH;
      const l = byNo.get(no);
      centered(String(no), (cols[0] + cols[1]) / 2, rowY + 4.5, 9, serif);
      if (l) {
        // The time loaded, and when it was dumped — the first and last stamp
        // on the line, so a reader sees the whole run at a glance.
        const inAt = fmtShort(l.load_in_at);
        const outAt = fmtShort(l.unload_out_at || l.unload_in_at);
        const when = inAt && outAt ? `${inAt}-${outAt}` : (inAt || outAt || fmtShort(l.load_out_at));
        text(when, cols[1] + 2, rowY + 5, 6.5);
        text((l.ticket_number || '').slice(0, 12), cols[2] + 2, rowY + 5, 7);
        if (l.tons != null) text(Number(l.tons).toFixed(2), cols[3] + 2, rowY + 5, 7);
        // The pad's ditto mark: a load with no material of its own carried
        // what the ticket says.
        const mat = l.material || (countLoads([l]) ? wo.material : null) || '';
        text(mat.slice(0, 10), cols[4] + 2, rowY + 5, 6.5);
      }
    }
    // Rules.
    for (const x of cols) vline(x, tBottom, tTop);
    hline(x0, x0 + blockW, tTop);
    hline(x0, x0 + blockW, bodyTop);
    for (let i = 1; i <= perBlock; i++) hline(x0, x0 + blockW, bodyTop - i * rowH, 0.5);
  }

  // The safety check column.
  const sX = blockX[1] + blockW + 6;
  box(sX, tBottom, R, tTop);
  const sMid = (sX + R) / 2;
  centered('DRIVERS DAILY SAFETY CHECK', sMid, tTop - 10, 5.6, serifBold);
  const ticked = new Set(wo.safety_check || []);
  let sy = tTop - 20.5;
  for (const item of SAFETY_CHECK_ITEMS) {
    rightAligned(item.label.toUpperCase(), R - 16, sy, 4.9, serifBold);
    hline(R - 14, R - 3, sy - 1, 0.5);
    if (ticked.has(item.key)) text('X', R - 11, sy - 0.3, 6, bold);
    sy -= 7.3;
  }
  sy -= 1;
  for (const line of wrap('DRIVER MUST REPORT MECHANICAL DEFECTS TO SHOP SUPERVISOR BEFORE DRIVING VEHICLE', serifBold, 4.6, R - sX - 8, 4)) {
    rightAligned(line, R - 4, sy, 4.6, serifBold); sy -= 5.4;
  }
  sy -= 2;
  for (const line of wrap('I HAVE CHECKED EACH ITEM ON THE ABOVE LIST AND WILL REPORT TO THE SHOP FOREMAN ANY DEFECTS FOUND.', serifBold, 4.6, R - sX - 8, 5)) {
    rightAligned(line, R - 4, sy, 4.6, serifBold); sy -= 5.4;
  }
  sy = Math.min(sy - 2, tBottom + 14);
  rightAligned('DRIVER\'S INITIALS', R - 4, sy, 4.9, serifBold);
  hline(sX + 6, R - 4, tBottom + 4, 0.6);
  if (wo.safety_initials) centered(wo.safety_initials.slice(0, 6), sMid, tBottom + 5.5, 9, font);

  // ---- Totals and notes ----
  const nTop = tBottom - 6;
  const nBottom = nTop - 80;
  box(L, nBottom, blockX[1] - 6, nTop);
  box(blockX[1], nBottom, R, nTop);
  let ty = nTop - 14;
  const tEnd = blockX[1] - 14;
  const truckHours = onSiteHours(wo.start_at, wo.stop_at);
  fill('TOTAL LOADS', lx, tEnd, ty, String(countLoads(loads) || ''), 9, 9); ty -= 15.5;
  fill('TRUCK HOURS', lx, tEnd, ty, hoursText(truckHours), 9, 9); ty -= 15.5;
  fill('TRAVEL TIME', lx, tEnd, ty, wo.travel_hours != null ? hoursText(Number(wo.travel_hours)) : '', 9, 9); ty -= 15.5;
  fill('TOTAL HOURS', lx, tEnd, ty, hoursText(totalHours(wo)), 9, 9); ty -= 15.5;
  fill('LAST LOAD UNLOADED', lx, tEnd, ty, fmtClock(lastUnloadAt(loads)), 9, 9);

  // Notes: the driver's, the office's, and anything the pad has no line for.
  const extras: string[] = [];
  if (Number(wo.down_hours || 0) > 0) extras.push(`Down time ${hoursText(Number(wo.down_hours))} hrs`);
  if (wo.tonnage != null && Number(wo.tonnage) > 0 && loads.every((l) => l.tons == null)) {
    extras.push(`Tonnage ${Number(wo.tonnage).toFixed(2)} ${wo.tonnage_type || ''}`.trim());
  }
  const notes = [wo.notes, wo.office_comments, ...extras].filter(Boolean).join('  ·  ');
  const noteX = blockX[1] + 8;
  const noteLabelW = serifBold.widthOfTextAtSize('NOTES', 9) + 6;
  const noteLines = wrap(notes, font, 7, R - noteX - noteLabelW - 10, 5);
  text('NOTES', noteX, nTop - 14, 9, serifBold);
  for (let i = 0; i < 5; i++) {
    const ly = nTop - 14 - i * 15.5;
    hline(i === 0 ? noteX + noteLabelW : noteX, R - 8, ly - 1.5, 0.5);
    if (noteLines[i]) text(noteLines[i], (i === 0 ? noteX + noteLabelW : noteX) + 2, ly + 0.5, 7);
  }

  // ---- Terms and signatures ----
  const kTop = nBottom - 6;
  const kBottom = kTop - 122;
  box(L, kBottom, R, kTop);
  let ky = kTop - 11;
  for (const line of wrap(FINANCE_TERMS, font, 6.3, R - L - 16, 4)) { text(line, L + 8, ky, 6.3); ky -= 7.4; }
  ky -= 6;
  text('DELIVERY TERMS AND CONDITIONS', L + 8, ky, 6.6, bold); ky -= 8;
  for (const line of wrap(DELIVERY_TERMS, font, 6.3, R - L - 16, 4)) { text(line, L + 8, ky, 6.3); ky -= 7.4; }

  // The signature line: foreman, the time they signed, driver.
  const sigY = kBottom + 34;
  const sigImgH = 24;
  const fsx = fill('JOB FOREMAN\'S SIGNATURE', L + 8, 252, sigY, '', 7);
  await drawSigOnLine(db, doc, page, wo.foreman_signature_path, fsx, sigY, 252 - fsx - 6, sigImgH);
  if (wo.foreman_signature_name) text(`${wo.foreman_signature_name} · ${fmtStamp(wo.foreman_signature_signed_at)}`, fsx + 2, sigY - 8, 5.5);
  fill('TIME', 260, 330, sigY, fmtClock(wo.foreman_signature_signed_at), 7, 7.5);
  const dsx = fill('DRIVER\'S SIGNATURE', 338, R - 8, sigY, '', 7);
  await drawSigOnLine(db, doc, page, wo.signature_path, dsx, sigY, R - 8 - dsx - 6, sigImgH);
  if (wo.signature_name) text(`${wo.signature_name} · ${fmtStamp(wo.signature_signed_at)}`, dsx + 2, sigY - 8, 5.5);

  // The carbon-copy legend along the bottom of the box.
  const legendY = kBottom + 6;
  text('WHITE- BILLING', 150, legendY, 6.5, serifBold);
  text('YELLOW-TRUCK COPY', 262, legendY, 6.5, serifBold);
  text('PINK-CUSTOMER COPY', 392, legendY, 6.5, serifBold);

  return doc.save();
}

// A signature PNG drawn sitting on its fill-in line. Missing or unreadable
// just leaves the line — a PDF that fails over a signature fetch helps
// nobody.
async function drawSigOnLine(
  db: SupabaseClient,
  doc: PDFDocument,
  page: PDFPage,
  sigPath: string | null,
  x: number,
  lineY: number,
  maxW: number,
  maxH: number,
) {
  if (!sigPath) return;
  try {
    const { data } = await db.storage.from(BUCKET).download(sigPath);
    if (!data) return;
    const bytes = new Uint8Array(await data.arrayBuffer());
    const img: PDFImage = await doc.embedPng(bytes);
    const s = Math.min(maxW / img.width, maxH / img.height);
    page.drawImage(img, { x: x + 4, y: lineY - 2, width: img.width * s, height: img.height * s });
  } catch { /* line stays blank */ }
}

// Generate (or regenerate) the ticket's PDF, store it next to the ticket's
// photos, and remember the path on the row. Returns the storage path, or null
// when generation failed — callers treat that like any other best-effort miss.
export async function ensureTicketPdf(
  db: SupabaseClient,
  workOrderId: string,
): Promise<{ path: string; bytes: Uint8Array } | null> {
  try {
    const [{ data: row }, { data: loadRows }] = await Promise.all([
      db.from('work_orders').select('*').eq('id', workOrderId).maybeSingle(),
      db.from('work_order_loads').select('*').eq('work_order_id', workOrderId).order('load_no'),
    ]);
    if (!row) return null;
    const wo = row as WorkOrder;
    const bytes = await buildTicketPdf(db, wo, (loadRows as WorkOrderLoad[]) || []);

    const pdfPath = `work-orders/${workOrderId}/haul-ticket.pdf`;
    const { error: upErr } = await db.storage
      .from(BUCKET)
      .upload(pdfPath, bytes as unknown as ArrayBuffer, { contentType: 'application/pdf', upsert: true });
    if (upErr) return null;
    await db.from('work_orders').update({ ticket_pdf_path: pdfPath }).eq('id', workOrderId);
    return { path: pdfPath, bytes };
  } catch {
    return null;
  }
}
