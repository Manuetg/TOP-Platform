const ignoredPaths = [
  '<rootDir>/(?:node_modules|dist|coverage|\\.stryker-tmp|reports|generated|tmp|temp)(?:/|$)',
  '<rootDir>/prisma/generated(?:/|$)',
];

const coverageIgnoredPaths = [
  ...ignoredPaths,
  '<rootDir>/src/main.ts',
  '<rootDir>/src/config(?:/|$)',
];

const commonProjectConfig = {
  preset: 'ts-jest',
  testPathIgnorePatterns: ignoredPaths,
  modulePathIgnorePatterns: ignoredPaths,
  coveragePathIgnorePatterns: coverageIgnoredPaths,
  watchPathIgnorePatterns: ignoredPaths,
  collectCoverageFrom: [
    '<rootDir>/src/**/*.ts',
    '!<rootDir>/src/main.ts',
    '!<rootDir>/src/config/**/*.ts',
  ],
};

module.exports = {
  projects: [
    {
      ...commonProjectConfig,
      displayName: 'unit',
      testMatch: ['<rootDir>/src/**/*.spec.ts'],
      coverageThreshold: { global: { lines: 85, statements: 85, functions: 85, branches: 80 } },
    },
    { ...commonProjectConfig, displayName: 'integration', testMatch: ['<rootDir>/test/integration/**/*.spec.ts'] },
    { ...commonProjectConfig, displayName: 'e2e', testMatch: ['<rootDir>/test/e2e/**/*.e2e-spec.ts'] },
  ],
};
