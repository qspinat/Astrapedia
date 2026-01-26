export default {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.js'],
  moduleFileExtensions: ['js'],
  transform: {},
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  moduleNameMapper: {
    '^three$': '<rootDir>/__mocks__/three.js',
  },
  collectCoverageFrom: [
    'modules/**/*.js',
    '!modules/data/CuratedImages.js',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  verbose: true,
  injectGlobals: true,
};
