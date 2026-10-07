import { FinanceEvidenceError } from './finance-v2-evidence.validation';

export const CSV_BYTE_LIMIT = 512 * 1024;
export interface CsvLimits { rows: number; fieldCharacters: number; bytes: number }
type State = 'FIELD' | 'QUOTED' | 'CLOSED';
class BoundedCsvMachine {
  private state: State = 'FIELD';
  private field = '';
  private record: string[] = [];
  private records: string[][] = [];
  private started = false;
  constructor(private readonly columns: number, private readonly limits: CsvLimits) {}
  private append(character: string): void {
    this.field += character;
    this.started = true;
    if (this.field.length > this.limits.fieldCharacters) throw new FinanceEvidenceError('CSV_FIELD_LIMIT');
  }
  private endField(): void {
    this.record.push(this.field);
    if (this.record.length > this.columns) throw new FinanceEvidenceError('CSV_COLUMN_COUNT');
    this.field = '';
    this.state = 'FIELD';
  }
  private endRecord(): void {
    this.endField();
    if (this.record.length !== this.columns) throw new FinanceEvidenceError('CSV_COLUMN_COUNT');
    this.records.push(this.record);
    if (this.records.length > this.limits.rows + 1) throw new FinanceEvidenceError('CSV_ROW_LIMIT');
    this.record = [];
    this.started = false;
  }
  private quoted(character: string): void {
    if (character === '"') this.state = 'CLOSED';
    else this.append(character);
  }
  private unquoted(character: string): void {
    if (this.state === 'CLOSED') throw new FinanceEvidenceError('CSV_AFTER_QUOTE');
    if (character !== '"') { this.append(character); return; }
    if (this.field) throw new FinanceEvidenceError('CSV_UNEXPECTED_QUOTE');
    this.state = 'QUOTED';
    this.started = true;
  }
  private consume(character: string): void {
    if (this.state === 'QUOTED') { this.quoted(character); return; }
    if (this.state === 'CLOSED' && character === '"') { this.append('"'); this.state = 'QUOTED'; return; }
    if (character === ',') { this.endField(); this.started = true; return; }
    if (character === '\n') { this.endRecord(); return; }
    this.unquoted(character);
  }
  parse(text: string): string[][] {
    for (let index = 0; index < text.length; index++) {
      const character = text[index];
      if (character === '\r' && this.state !== 'QUOTED') {
        if (text[index + 1] !== '\n') throw new FinanceEvidenceError('CSV_NEWLINE_INVALID');
        continue;
      }
      this.consume(character);
    }
    if (this.state === 'QUOTED') throw new FinanceEvidenceError('CSV_UNCLOSED_QUOTE');
    if (this.started) this.endRecord();
    return this.records;
  }
}
function prepareCsv(csv: string, limits: CsvLimits): string {
  if (typeof csv !== 'string' || csv.length === 0) throw new FinanceEvidenceError('CSV_REQUIRED');
  if (csv.length > limits.bytes) throw new FinanceEvidenceError('CSV_BYTE_LIMIT');
  const encoded = Buffer.from(csv, 'utf8');
  if (encoded.byteLength > limits.bytes) throw new FinanceEvidenceError('CSV_BYTE_LIMIT');
  if (encoded.toString('utf8') !== csv) throw new FinanceEvidenceError('CSV_UTF8_INVALID');
  return csv.startsWith('\ufeff') ? csv.slice(1) : csv;
}
function requireHeader(actual: string[] | undefined, expected: readonly string[]): void {
  if (!actual || actual.some((value, index) => value !== expected[index])) throw new FinanceEvidenceError('CSV_HEADER_INVALID');
}
export function parseBoundedCsv(csv: string, header: readonly string[], overrides: Partial<CsvLimits> = {}): string[][] {
  const limits = { rows: 1000, fieldCharacters: 500, bytes: CSV_BYTE_LIMIT, ...overrides };
  const records = new BoundedCsvMachine(header.length, limits).parse(prepareCsv(csv, limits));
  const actual = records.shift();
  requireHeader(actual, header);
  if (!records.length) throw new FinanceEvidenceError('CSV_ROWS_REQUIRED');
  return records;
}
