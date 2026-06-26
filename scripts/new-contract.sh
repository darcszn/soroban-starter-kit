#!/usr/bin/env bash
# new-contract.sh — scaffold a new Soroban contract from the common skeleton
#
# Usage: ./scripts/new-contract.sh <contract-name>
#
# <contract-name>  Lowercase kebab-case label for the new contract (e.g. "payment-splitter").
#
# What this script does:
#   1. Creates contracts/<contract-name>/ with src/, src/bin/, and all required source files.
#   2. Writes a Cargo.toml configured as a cdylib+rlib WASM contract.
#   3. Registers the new crate in the workspace Cargo.toml members list.
#
# The generated contract compiles immediately and ships two passing unit tests.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ── Helpers ───────────────────────────────────────────────────────────────────

log()  { printf '\033[1;34m[new-contract]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m[ok]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

# ── Argument validation ───────────────────────────────────────────────────────

[[ $# -eq 1 ]] || die "Usage: $0 <contract-name>
Example: $0 payment-splitter"

NAME="$1"

# Lowercase letters, digits, hyphens; must start with a letter
[[ "$NAME" =~ ^[a-z][a-z0-9-]*$ ]] || \
  die "Contract name must be lowercase kebab-case (e.g. 'payment-splitter'). Got: '$NAME'"

[[ "$NAME" != "common" ]] || die "'common' is reserved for the shared library."

TARGET="$ROOT/contracts/$NAME"
[[ ! -d "$TARGET" ]] || die "contracts/$NAME already exists."

WORKSPACE_TOML="$ROOT/Cargo.toml"
grep -q "^\s*\"contracts/$NAME\"" "$WORKSPACE_TOML" && \
  die "contracts/$NAME is already registered in the workspace."

# ── kebab-case → PascalCase ───────────────────────────────────────────────────
# "payment-splitter" → "PaymentSplitter"

PASCAL="$(echo "$NAME" | sed 's/-/ /g' | \
  awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2)}1' | \
  tr -d ' ')"

log "Scaffolding contracts/$NAME (struct: ${PASCAL}Contract) ..."

# ── Directory skeleton ────────────────────────────────────────────────────────

mkdir -p "$TARGET/src/bin"

# ── Cargo.toml ────────────────────────────────────────────────────────────────

cat > "$TARGET/Cargo.toml" << CARGO
[package]
name = "soroban-$NAME-template"
version = "0.1.0"
edition = "2021"
authors.workspace = true
description = "A production-ready Soroban $NAME contract template"
license.workspace = true

[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
soroban-sdk = { workspace = true }
soroban-common = { workspace = true }

[dev-dependencies]
soroban-sdk = { workspace = true, features = ["testutils"] }

[[bin]]
name = "deploy"
path = "src/bin/deploy.rs"
doc = false

[lints]
workspace = true
CARGO

# ── src/errors.rs ─────────────────────────────────────────────────────────────

cat > "$TARGET/src/errors.rs" << RUST
use soroban_sdk::contracterror;

#[contracterror]
#[derive(Clone, Debug, PartialEq)]
pub enum ${PASCAL}Error {
    AlreadyInitialized = 1,
    NotInitialized     = 2,
    Unauthorized       = 3,
}
RUST

# ── src/events.rs ─────────────────────────────────────────────────────────────

cat > "$TARGET/src/events.rs" << RUST
use soroban_sdk::{symbol_short, Address, Env};

pub fn initialized(env: &Env, admin: &Address) {
    env.events().publish((symbol_short!("init"),), (admin,));
}
RUST

# ── src/storage.rs ────────────────────────────────────────────────────────────

cat > "$TARGET/src/storage.rs" << RUST
use soroban_sdk::contracttype;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
}
RUST

# ── src/lib.rs ────────────────────────────────────────────────────────────────

cat > "$TARGET/src/lib.rs" << RUST
#![no_std]

use soroban_sdk::{contract, contractimpl, Address, Env};

mod errors;
mod events;
mod storage;

pub use errors::${PASCAL}Error;
pub use storage::DataKey;

use soroban_common::{LEDGER_BUMP_AMOUNT, LEDGER_LIFETIME_THRESHOLD};

fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(LEDGER_LIFETIME_THRESHOLD, LEDGER_BUMP_AMOUNT);
}

/// TODO: Add contract documentation.
#[contract]
pub struct ${PASCAL}Contract;

#[contractimpl]
impl ${PASCAL}Contract {
    /// Initialize the contract, setting the admin.
    ///
    /// Returns \`${PASCAL}Error::AlreadyInitialized\` if called more than once.
    pub fn initialize(env: Env, admin: Address) -> Result<(), ${PASCAL}Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(${PASCAL}Error::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        bump_instance(&env);
        events::initialized(&env, &admin);
        Ok(())
    }
}

mod test;
RUST

# ── src/test.rs ───────────────────────────────────────────────────────────────

cat > "$TARGET/src/test.rs" << RUST
#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env};

#[test]
fn test_initialize() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(${PASCAL}Contract, ());
    let client = ${PASCAL}ContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);
}

#[test]
fn test_initialize_twice_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(${PASCAL}Contract, ());
    let client = ${PASCAL}ContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    assert_eq!(
        client.try_initialize(&admin),
        Err(Ok(${PASCAL}Error::AlreadyInitialized)),
    );
}
RUST

# ── src/bin/deploy.rs ─────────────────────────────────────────────────────────

cat > "$TARGET/src/bin/deploy.rs" << RUST
//! Deploy helper for soroban-$NAME-template.
//!
//! Usage:
//!   cargo run --bin deploy -- --network testnet --source alice
//!   cargo run --bin deploy -- --network mainnet --source alice --wasm path/to/$NAME.wasm

use std::process::{Command, ExitCode};

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();

    let has_wasm_flag = args.windows(2).any(|w| w[0] == "--wasm");
    if !has_wasm_flag {
        let status = Command::new("stellar")
            .args(["contract", "build"])
            .status()
            .expect("failed to run \`stellar contract build\`");
        if !status.success() {
            eprintln!("Build failed.");
            return ExitCode::FAILURE;
        }
    }

    let status = Command::new("stellar")
        .args(["contract", "deploy"])
        .args(&args)
        .status()
        .expect("failed to run \`stellar contract deploy\`");

    if status.success() {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}
RUST

# ── Register in workspace Cargo.toml ─────────────────────────────────────────
# Inserts after the last "contracts/" member line, preserving file order.

# Match only member-array lines (start with whitespace then quote), not dependency lines.
LAST_LINE="$(grep -n '^\s*"contracts/' "$WORKSPACE_TOML" | tail -1 | cut -d: -f1)"

awk -v line="$LAST_LINE" -v entry="  \"contracts/$NAME\"," '
  NR == line { print; print entry; next }
  { print }
' "$WORKSPACE_TOML" > "${WORKSPACE_TOML}.tmp" && mv "${WORKSPACE_TOML}.tmp" "$WORKSPACE_TOML"

ok "Created contracts/$NAME/"
ok "Registered in workspace Cargo.toml."
log ""
log "Next steps:"
log "  cd contracts/$NAME && cargo test"
log "  stellar contract build --manifest-path contracts/$NAME/Cargo.toml"
