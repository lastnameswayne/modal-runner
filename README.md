# Modal Runner
Runs Modal functions directly from VS Code with a single click.

## How to run



## How it works
The extension consists of a Typescript frontend a Rust backend communicating over stdin.

  ┌─────────────────┐      JSON/stdin       ┌─────────────────┐
  │   TypeScript    │ ──────────────────▶   │  Rust Backend   │
  │   Frontend      │                       │                 │
  │                 │ ◀──────────────────   │                 │
  └─────────────────┘    function list      └─────────────────┘

The Typescript backend reads the python file and sends it to the Rust backend. The Rust backend parses the file and returns all the functions. The Typescript frontend then renders a Run button above those functions. The frontend also handles actually runnning the function with `modal run`.

I only picked this architecture because I wanted to use Rust. It would have been a lot easier to do everything in Typescript.

