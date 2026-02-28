# Modal Runner

Run Modal functions directly from VS Code with a single click.

## Features

Adds a **▶ Run** code lens above every `@modal.function` and `@modal.local_entrypoint` decorated function. Click it to run the function via the Modal CLI. Functions with parameters will prompt for input before running.

## Requirements

- [Modal CLI](https://modal.com/docs/guide) installed (`pip install modal`)
- A Modal account

## Extension Settings

- `modal-run.modalPath`: Path to the modal executable. Leave empty to auto-detect.

## Release Notes

### 0.1.0

Initial release.
