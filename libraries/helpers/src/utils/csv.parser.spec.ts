import { parseCsv, parseCsvWithHeader } from './csv.parser';

describe('csv.parser', () => {
  it('parses simple rows', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('handles quoted fields with commas and newlines', () => {
    expect(parseCsv('a,"hello, world","line1\nline2"')).toEqual([
      ['a', 'hello, world', 'line1\nline2'],
    ]);
  });

  it('handles escaped quotes', () => {
    expect(parseCsv('"say ""hi""",b')).toEqual([['say "hi"', 'b']]);
  });

  it('skips fully empty trailing rows but keeps empty cells', () => {
    expect(parseCsv('a,,c\n\n')).toEqual([['a', '', 'c']]);
  });

  it('parses with header, lowercasing keys and trimming values', () => {
    const { header, records } = parseCsvWithHeader(
      'Date,Content,Integrations\n2030-01-01, hello ,abc|def'
    );
    expect(header).toEqual(['date', 'content', 'integrations']);
    expect(records).toEqual([
      { date: '2030-01-01', content: 'hello', integrations: 'abc|def' },
    ]);
  });

  it('returns empty for empty input', () => {
    expect(parseCsvWithHeader('')).toEqual({ header: [], records: [] });
  });

  it('pads missing trailing cells as empty strings', () => {
    const { records } = parseCsvWithHeader('a,b,c\n1,2');
    expect(records[0]).toEqual({ a: '1', b: '2', c: '' });
  });
});
