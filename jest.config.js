export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  transformIgnorePatterns: ['/node_modules/(?!(smol-toml|@decimalturn)/)'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
};
