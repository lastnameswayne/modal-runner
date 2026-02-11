# Modal Runner

VS Code extension that adds a "Run" button above `@app.function()` and `@app.local_entrypoint()` functions in Python files. Clicking it runs `modal run file.py::function_name` and shows output in a VS Code output channel.

## Build

Prerequisites: Rust toolchain, Node.js, npm.

```
./build.sh
```

This builds the Rust backend, compiles the TypeScript frontend, and packages a `.vsix` file.

## Install

```
code --install-extension frontend/modal-run/modal-runner-0.1.0.vsix
```

You also need the [Modal CLI](https://modal.com/docs/guide) installed and authenticated (`modal token new`). The extension auto-detects the `modal` binary from common locations (`.venv/bin/modal`, `~/.local/bin/modal`, etc.), or you can set the path manually in Settings > Modal Run.

## Usage

1. Open a Python file that uses Modal
2. Click "Run" above any `@app.function()` or `@app.local_entrypoint()`
3. Output appears in the "Modal" output channel
4. Status (running/succeeded/failed) shows inline with a link to the Modal dashboard

## How it works

The extension consists of a TypeScript frontend and a Rust backend communicating over stdin.

```
  ┌─────────────────┐      JSON/stdin       ┌─────────────────┐
  │   TypeScript    │ ──────────────────▶   │  Rust Backend   │
  │   Frontend      │                       │                 │
  │                 │ ◀──────────────────   │                 │
  └─────────────────┘    function list      └─────────────────┘
```

The frontend sends the file path to the Rust backend, which parses the Python AST using tree-sitter and returns decorated functions. The frontend renders Run buttons and handles executing `modal run`.

I only picked this architecture because I wanted to use Rust. It would have been a lot easier to do everything in TypeScript.
