module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/lambda"],
  testMatch: ["**/*.test.ts"],
};
