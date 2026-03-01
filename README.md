# Modal Runner

VS Code extension that adds a "Run" button above Modal functions in Python files. Clicking it runs the function! Useful for easily running functions with -or without parameters.

[Install from VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=swayne.modal-runner)

<video src="https://github.com/user-attachments/assets/2c0cf00c-ece5-441d-9a75-626f935fa7cf" width="100%" controls autoplay loop muted></video>

## Prerequisites

- [Modal CLI](https://modal.com/docs/guide) installed and authenticated (`modal token new`)

## Usage

1. Open a Python file that uses Modal
2. Click "Run" above any `@app.function()` or `@app.local_entrypoint()`
3. Output appears in the "Modal Runner" output channel
4. After the run completes, a status lens shows inline if the run succeeded or failed, with elapsed time and a link to the Modal dashboard

## Modal not found?

The extension looks for the `modal` binary in common locations: `.venv/bin/modal`, `~/.local/bin/modal`, and your `PATH`. If it can't find it, you'll get an error with an "Open Settings" button. Set the path manually via **Settings → Modal Run → Modal Path**.

## How it works

The extension consists of a TypeScript frontend and a Rust backend communicating over stdin.

```
  ┌─────────────────┐      JSON/stdin       ┌─────────────────┐
  │   TypeScript    │ ──────────────────▶   │  Rust Backend   │
  │   Frontend      │                       │                 │
  │                 │ ◀──────────────────   │                 │
  └─────────────────┘    function list      └─────────────────┘
```

The frontend sends the file contents to the Rust backend, which parses the Python AST using tree-sitter and returns decorated functions. The frontend renders Run buttons and handles executing `modal run`.

I only picked this architecture because I wanted to use Rust. It would have been a lot easier to do everything in TypeScript.
