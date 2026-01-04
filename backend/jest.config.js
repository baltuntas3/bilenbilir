module.exports = {
  testEnvironment: 'node',

  // Test dosyalarını bul
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/tests/**/*.test.js'
  ],

  // Coverage için dahil edilecek dosyalar
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/__tests__/**',
    '!node_modules/**'
  ],

  // Minimum coverage gereksinimleri
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },

  // Coverage rapor formatları
  coverageReporters: ['text', 'text-summary', 'lcov', 'html'],

  // Coverage çıktı klasörü
  coverageDirectory: 'coverage',

  // Test timeout (ms)
  testTimeout: 10000,

  // Her test dosyasından önce çalıştırılacak setup
  setupFilesAfterEnv: [],

  // Verbose output
  verbose: true
};
