// What a scan reads off each kind of paper, and how the model is told to
// read it. One schema per document type; every field is nullable so a
// crumpled receipt with half a date still comes back clean, and the form
// only fills what was actually read.

import { z } from 'zod';

const str = z.string().nullable();
const num = z.number().nullable();
const date = z.string().nullable().describe('YYYY-MM-DD, or null if not shown');

export const SCAN_KINDS = ['registration', 'fuel', 'receipt', 'maintenance', 'repair'] as const;
export type ScanKind = (typeof SCAN_KINDS)[number];

export const SCAN_SCHEMAS = {
  registration: z.object({
    year: num.describe('model year as a number'),
    make: str,
    model: str,
    vin: str.describe('17 characters; read carefully, never guess a character'),
    plate: str.describe('plate number without the state'),
    plate_state: str.describe('two-letter state code of the plate'),
    unit_number: str.describe('fleet/unit number if printed, else null'),
    registration_number: str.describe('registration or document number'),
    issued_at: date,
    expires_at: date,
    owner_name: str,
    confidence: z.enum(['high', 'medium', 'low']),
    notes: str.describe('anything unclear or worth a human look, else null'),
  }),
  fuel: z.object({
    at: z.string().nullable().describe('date and time of the sale as YYYY-MM-DDTHH:MM, or just YYYY-MM-DD'),
    gallons: num,
    total: num.describe('total paid in dollars'),
    price_per_gallon: num,
    state: str.describe('two-letter state the station is in, from the address'),
    vendor: str.describe('station name and town'),
    odometer: num.describe('odometer if printed or written on it'),
    fuel_type: str.describe('diesel, DEF, gas, etc.'),
    confidence: z.enum(['high', 'medium', 'low']),
    notes: str,
  }),
  receipt: z.object({
    at: date,
    amount: num.describe('the total paid'),
    category: z.enum(['toll', 'scale', 'parts', 'repair', 'lodging', 'meals', 'supplies', 'other']),
    vendor: str,
    description: str.describe('what it was for, in a few words'),
    confidence: z.enum(['high', 'medium', 'low']),
    notes: str,
  }),
  maintenance: z.object({
    kind: z.enum(['oil_change', 'tires', 'brakes', 'dot_annual', 'service', 'other']),
    done_at: date,
    odometer: num,
    cost: num.describe('the total'),
    vendor: str.describe('the shop'),
    work_done: str.describe('the line items in a sentence or two'),
    next_due_at: date.describe('a next-service date if printed on it'),
    next_due_odometer: num.describe('a next-service odometer if printed on it'),
    unit_number: str.describe('unit/truck number if written on it'),
    vin: str,
    confidence: z.enum(['high', 'medium', 'low']),
    notes: str,
  }),
  repair: z.object({
    description: str.describe('what was wrong / what was repaired, in one line'),
    done_at: date,
    cost: num.describe('the total'),
    vendor: str.describe('the shop'),
    details: str.describe('parts and labor lines in a sentence or two'),
    unit_number: str,
    vin: str,
    confidence: z.enum(['high', 'medium', 'low']),
    notes: str,
  }),
};

export const SCAN_PROMPTS: Record<ScanKind, string> = {
  registration: 'This is a vehicle registration card or document for a truck. Read the vehicle identification and the registration dates.',
  fuel: 'This is a fuel receipt from a truck stop or gas station. Read the sale.',
  receipt: 'This is a receipt or bill a truck driver is turning in — a toll, a scale, parts, a motel, a meal, supplies. Read what was paid, to whom, and pick the closest category.',
  maintenance: 'This is a service invoice or maintenance record for a truck: an oil change, tires, brakes, an inspection, a PM service. Read what was done, when, at what odometer, and what it cost.',
  repair: 'This is a repair shop bill or work order for a truck. Read what was repaired, when, where, and what it cost.',
};

export const SCAN_SYSTEM = `You read paperwork for a trucking company and fill in a form from it. Read exactly what is on the document; never invent or guess a value. Dates come back as YYYY-MM-DD. US states come back as the two-letter code. Money and quantities come back as plain numbers with no symbols. Anything not shown on the document is null. A VIN is 17 characters with no I, O or Q; if a character is unclear, say so in notes and set confidence to low. If the image is not the kind of document described, set every field to null, confidence to low, and say what it actually is in notes.`;
