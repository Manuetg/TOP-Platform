module.exports = {
  preset: 'ts-jest',
  roots: ['<rootDir>/src'],
  // roots limita a src; el glob relativo evita separadores mixtos del sandbox Stryker en Windows.
  testMatch: ['**/*.spec.ts'],
  testPathIgnorePatterns: ['<rootDir>/(?:node_modules|dist|coverage|reports|stryker-tmp|generated|tmp|temp)(?:/|$)'],
  modulePathIgnorePatterns: ['<rootDir>/(?:node_modules|dist|coverage|reports|stryker-tmp|generated|tmp|temp)(?:/|$)'],
  coveragePathIgnorePatterns: ['<rootDir>/(?:node_modules|dist|coverage|reports|stryker-tmp|generated|tmp|temp)(?:/|$)'],
  watchPathIgnorePatterns: ['<rootDir>/(?:node_modules|dist|coverage|reports|stryker-tmp|generated|tmp|temp)(?:/|$)'],
};
