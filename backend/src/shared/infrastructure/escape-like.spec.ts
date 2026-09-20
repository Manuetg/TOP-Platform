import { escapeLike } from './escape-like';
describe('escapeLike', () => {
  it.each([['ab', 'ab'], ['a%b', 'a\\%b'], ['a_b', 'a\\_b'], ['a\\b', 'a\\\\b']])('escapa literalmente %s', (input, expected) => {
    expect(escapeLike(input)).toBe(expected);
  });
});
