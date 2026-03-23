const { Score } = require('../Score');

describe('Score edge cases', () => {
  it('should throw for score exceeding MAX_SCORE', () => {
    expect(() => new Score(10000001)).toThrow('cannot exceed');
  });

  it('add should throw for NaN points', () => {
    const s = new Score(100);
    expect(() => s.add(NaN)).toThrow('Points must be a number');
  });

  it('add should throw for resulting negative score', () => {
    const s = new Score(100);
    expect(() => s.add(-200)).toThrow('cannot be negative');
  });

  it('add should cap at MAX_SCORE', () => {
    const s = new Score(9999999);
    const spy = jest.spyOn(console, 'warn').mockImplementation();
    const result = s.add(100);
    expect(result.value).toBe(10000000);
    spy.mockRestore();
  });
});
