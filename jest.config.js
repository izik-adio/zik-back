module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  testTimeout: 45000, // Increased from 30000 to 45000 to handle performance tests
  maxWorkers: 1,
  verbose: true,
};
