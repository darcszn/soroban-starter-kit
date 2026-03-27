# Implementation Plan: Automated Testing Framework

## Overview

Establish a comprehensive automated testing framework across three layers — Soroban smart contracts (Rust), React/TypeScript frontend, and API/service endpoints — with test data management, mock services, coverage analysis, performance testing, and CI pipeline integration.

## Tasks

- [ ] 1. Set up frontend unit test infrastructure
  - Install and configure Vitest with jsdom environment in `vite.config.ts` / `vitest.config.ts`
  - Install `@testing-library/react` and configure global test setup file
  - Add `vitest` and `@vitest/coverage-v8` scripts to `package.json`
  - _Requirements: 1.1, 1.2, 1.4_

  - [ ] 1.1 Write sample component unit test to validate runner
    - Create `src/__tests__/setup.ts` with global mocks and jsdom configuration
    - Write one smoke-test for an existing React component using `@testing-library/react`
    - _Requirements: 1.1, 1.2_

  - [ ]* 1.2 Write property test for test isolation (no real network calls)
    - **Property 1: All external module imports in unit tests are replaced by test doubles**
    - **Validates: Requirements 1.3**

- [ ] 2. Set up MSW mock service layer
  - Install `msw` and create `src/mocks/` directory
  - Implement handlers for `getAccount`, `submitTransaction`, `getTransaction`, `getLedgerEntries`
  - Create `src/mocks/freighter.ts` mock implementation of `@stellar/freighter-api`
  - Wire MSW server setup/teardown into Vitest `beforeAll`/`afterEach`/`afterAll` hooks
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]* 2.1 Write unit tests for MSW handler reset behaviour
    - Verify handler overrides are cleared after each test
    - Verify error-response handlers return configured errors for matching requests
    - _Requirements: 6.3, 6.4_

- [ ] 3. Implement test data management utilities
  - Create `tests/fixtures/` directory and add base JSON fixture files for wallet address, token amount, and escrow parameters
  - Implement factory functions in `tests/factories/` that read fixture definitions and return unique instances
  - Implement `seedAccounts()` and `cleanupTestData()` helpers for the local Stellar network
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 3.1 Write property test for fixture uniqueness
    - **Property 2: Each call to a factory function returns a distinct object (no shared mutable state)**
    - **Validates: Requirements 5.2**

  - [ ]* 3.2 Write unit tests for fixture loading
    - Test that factory functions correctly parse JSON fixture files from `tests/fixtures/`
    - Test cleanup helper removes only test-created data
    - _Requirements: 5.4, 5.5_

- [ ] 4. Configure Soroban contract unit test suite
  - Verify `Cargo.toml` workspace includes both `escrow` and `token` contracts
  - Add `soroban_sdk::testutils` dev-dependency to each contract's `Cargo.toml`
  - Write contract unit tests using the Soroban SDK test environment (no live network)
  - Add `cargo test` and `cargo-llvm-cov` scripts to workspace `Makefile` or `package.json`
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ] 4.1 Implement escrow contract unit tests
    - Cover escrow creation, release, and dispute paths
    - Assert panic messages are captured and reported on failure
    - _Requirements: 2.2, 2.4_

  - [ ] 4.2 Implement token contract unit tests
    - Cover mint, transfer, and burn paths
    - _Requirements: 2.2_

  - [ ]* 4.3 Write property test for contract coverage gate
    - **Property 3: Line coverage for each contract is ≥ 80% as reported by cargo-llvm-cov**
    - **Validates: Requirements 2.3**

- [ ] 5. Checkpoint — Ensure all unit tests and contract tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Set up integration test environment
  - Create `tests/integration/` directory and a `docker-compose.test.yml` (or extend existing) for the Stellar local network
  - Implement a `waitForHealthy(rpcUrl, timeoutMs)` helper that polls the Stellar RPC health endpoint
  - Wire `seedAccounts()` and `cleanupTestData()` into integration test `beforeAll`/`afterEach` hooks
  - _Requirements: 3.1, 3.2, 3.4, 3.5_

  - [ ] 6.1 Implement integration tests for frontend → Stellar RPC flows
    - Write tests that invoke frontend service calls and assert expected on-chain state changes
    - _Requirements: 3.3_

  - [ ]* 6.2 Write integration tests for environment startup timeout
    - Test that the runner aborts and emits a descriptive error when the environment does not start within 120 s
    - _Requirements: 3.5_

- [ ] 7. Set up Playwright E2E test framework
  - Install Playwright and initialise config (`playwright.config.ts`) targeting the local frontend URL
  - Create `tests/e2e/` directory and implement the mock Freighter wallet extension injection helper
  - _Requirements: 4.1, 4.3_

  - [ ] 7.1 Implement E2E tests for critical user flows
    - Wallet connection flow
    - Token transfer flow
    - Escrow creation flow
    - Escrow release flow
    - _Requirements: 4.2_

  - [ ] 7.2 Implement screenshot and console-log capture on test failure
    - Configure Playwright `onTestFailed` hook to attach screenshot and browser console log to the report
    - _Requirements: 4.4_

  - [ ] 7.3 Configure JUnit XML reporter for Playwright
    - Add `junit` reporter to `playwright.config.ts` and verify XML output path
    - _Requirements: 4.6_

  - [ ]* 7.4 Write property test for E2E suite duration
    - **Property 4: Full E2E suite completes in under 10 minutes on CI**
    - **Validates: Requirements 4.5**

- [ ] 8. Implement test reporting and coverage analysis
  - Configure `@vitest/coverage-v8` to output HTML and `lcov.info` to `coverage/frontend/`
  - Configure `cargo-llvm-cov` to output `lcov.info` to `coverage/contracts/`
  - Implement a `scripts/merge-coverage.ts` (or shell script) that reads both lcov files and writes a consolidated JSON summary (pass/fail/skip counts + per-layer coverage %)
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [ ]* 8.1 Write unit tests for coverage summary generation
    - Test that the consolidated JSON correctly aggregates frontend and contract coverage values
    - Test that the summary correctly reflects pass, fail, and skip counts
    - _Requirements: 7.4_

- [ ] 9. Implement performance and load tests
  - Create `tests/performance/` directory and write k6 scripts for the frontend API service layer
  - Configure scenarios with 50 concurrent VUs for 60 seconds
  - Add threshold assertions: p95 < 500 ms, error rate < 1%
  - Implement summary output containing p50, p95, p99, throughput, and error rate
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ]* 9.1 Write unit tests for k6 threshold configuration
    - Verify threshold definitions match requirements (p95 ≤ 500 ms, error rate ≤ 1%)
    - _Requirements: 8.3, 8.4_

- [ ] 10. Checkpoint — Ensure integration, E2E, and performance tests pass locally
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Implement GitHub Actions CI pipeline
  - Create `.github/workflows/test.yml` with separate jobs: `unit-tests`, `contract-tests`, `integration-tests`, `e2e-tests`, `performance-tests`
  - Configure workflow trigger on `pull_request` (opened and synchronize events)
  - Add `docker-compose` provisioning step before integration and E2E jobs
  - Configure Node.js `node_modules` cache (actions/cache keyed on `package-lock.json`)
  - Configure Rust build artifact cache (actions/cache keyed on `Cargo.lock`)
  - _Requirements: 9.1, 9.2, 9.3, 9.5_

  - [ ] 11.1 Add consolidated status check and artifact upload steps
    - Add a final job that posts a consolidated pass/fail status to the PR
    - Configure `if: always()` artifact upload for all test reports and coverage files
    - Enforce 80% coverage gate: fail the build if any layer is below threshold
    - _Requirements: 7.5, 7.6, 9.4, 9.6_

  - [ ]* 11.2 Write integration tests for CI workflow configuration
    - Validate YAML syntax and job dependency graph using `actionlint` or equivalent
    - _Requirements: 9.1, 9.2_

- [ ] 12. Final checkpoint — Ensure all tests pass and CI pipeline is green
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at logical boundaries
- Property tests validate universal correctness properties; unit tests validate specific examples and edge cases
