module.exports = {
  preset: 'ts-jest',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  testPathIgnorePatterns: ['<rootDir>/(?:node_modules|dist|coverage|\\.stryker-tmp|reports|generated|tmp|temp)(?:/|$)'],
  modulePathIgnorePatterns: ['<rootDir>/(?:node_modules|dist|coverage|\\.stryker-tmp|reports|generated|tmp|temp)(?:/|$)'],
};
