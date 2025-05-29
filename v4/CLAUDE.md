# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Run tests**: `npm test` (uses Node.js built-in test runner)
- **Type check**: No dedicated command - the project implements its own type checker
- **Build/analyze**: `node index.mjs [directory]` (defaults to current directory)

## Project Architecture

**TJS** is a custom JavaScript/TypeScript static analysis tool that performs name checking and type inference on JavaScript modules. It's built as a two-phase compiler:

### Core Pipeline (src/build.mjs)

1. **File Discovery**: Recursively finds `.js` and `.mjs` files
2. **Parsing**: Uses Meriyah to parse each file into ASTs
3. **Dependency Resolution**: Builds import/export graphs and topologically sorts modules
4. **Name Checking**: Validates variable declarations and usage (src/namecheck.mjs)
5. **Type Checking**: Performs type inference using Hindley-Milner algorithm (src/typecheck/)

### Type System Architecture (src/typecheck/)

- **Environment (env.mjs)**: Stack-based scope management for variable bindings
- **Types (types/index.mjs)**: Core type representations and operations
- **Inference Engine**: 
  - `infer/module.mjs`: Top-level module type inference
  - `infer/expression.mjs`: Expression-level type inference
  - `infer/statements.mjs`: Statement-level processing
- **Unification (types/unfify.mjs)**: Type constraint solving
- **Generalization (types/generalize.mjs)**: Polymorphic type scheme creation

### Error System

- **Structured Errors**: All errors use a consistent ADT pattern with rendering functions
- **Rich Error Messages**: Location-aware error reporting with suggestions (Levenshtein distance)
- **Error Categories**: Undefined variables, duplicate declarations, missing exports, unsupported syntax

### Module System

- Supports ES6 imports/exports with full dependency tracking
- Handles cyclic dependency detection
- Module interfaces are built incrementally during type checking
- Import resolution follows Node.js semantics for relative paths

### Key Design Patterns

- **Result Type**: Consistent error handling using Result.ok/Result.error pattern
- **Visitor Pattern**: AST traversal for both name checking and type inference
- **Immutable Substitutions**: Type unification uses persistent data structures
- **Scope Stack**: Lexical scoping implemented via environment stack