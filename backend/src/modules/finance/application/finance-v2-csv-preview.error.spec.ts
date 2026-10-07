import { FinanceCsvPreviewError } from './finance-v2-csv-preview.error';

describe('CSV error public closed codes (unit; no DB)',()=>{
  it('retains row ordinal and column without producing successful confirmation fields',()=>{
    const error=new FinanceCsvPreviewError([{ordinal:2,column:'amountMinor',code:'MONEY_RANGE_INVALID'},{ordinal:3,column:'bookedOn',code:'DATE_INVALID'}]);
    expect(error.issues).toEqual([{ordinal:2,column:'amountMinor',code:'MONEY_OVERFLOW',message:'MONEY_RANGE_INVALID: amountMinor'},{ordinal:3,column:'bookedOn',code:'INVALID_INPUT',message:'DATE_INVALID: bookedOn'}]);
    expect(error.previewToken).toBeNull();expect(error).not.toHaveProperty('digest');expect(error).not.toHaveProperty('totals');expect(error).not.toHaveProperty('sources');
  });
  it('preserves global ordinal zero and maps a stale account to the published conflict code',()=>{
    const error=new FinanceCsvPreviewError([{ordinal:0,column:'expectedAccountVersion',code:'ACCOUNT_VERSION_STALE'}]);
    expect(error.issues).toEqual([{ordinal:0,column:'expectedAccountVersion',code:'VERSION_CONFLICT',message:'ACCOUNT_VERSION_STALE: expectedAccountVersion'}]);
  });
});
