use std::io::{ self, BufRead, Write }; // Combine io imports
use std::env;
use std::fs;
use serde::{ Deserialize, Serialize };
use tree_sitter::{ Parser, Query, QueryCursor };

#[derive(Deserialize)]
struct Request {
    command: String,
    file: String,
    id: String,
}

#[derive(Serialize)]
struct Response {
    id: String,
    functions: Vec<Function>,
}
#[derive(Serialize)]
struct Function {
    name: String,
    line: usize,
}

fn main() {
    let stdin = io::stdin();
    let mut stdout = io::stdout();

    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => {
                break;
            }
        };

        if line.trim().is_empty() {
            continue;
        }

        let request: Request = match serde_json::from_str(&line) {
            Ok(r) => r,
            Err(e) => {
                eprintln!("Invalid JSON: {}", e);
                return;
            }
        };

        // eprintln!("Command: {}", request.command);
        // eprintln!("File: {:?}", request.file);

        if request.command == "parse" {
            let source_code = match fs::read_to_string(request.file) {
                Ok(r) => r,
                Err(e) => {
                    eprintln!("Can't read file: {}", e);
                    return;
                }
            };
            let mut parser = Parser::new();
            let language: tree_sitter::Language = tree_sitter_python::LANGUAGE.into();
            match parser.set_language(&language) {
                Ok(_) => {}
                Err(e) => {
                    eprintln!("Failed to set language: {}", e);
                    return;
                }
            }

            let tree = match parser.parse(&source_code, None) {
                Some(t) => t,
                None => {
                    eprintln!("Failed to parse");
                    return;
                }
            };

            let root_node = tree.root_node();
            // eprintln!("Root: {}", root_node.kind());

            let mut functions: Vec<Function> = vec! {};

            for (i, child) in root_node.children(&mut root_node.walk()).enumerate() {
                if child.kind() == "decorated_definition" {
                    let source_code: String = source_code[child.byte_range()].to_string();
                    let function: Function = Function {
                        name: source_code,
                        line: child.start_position().row + 1,
                    };
                    functions.push(function);
                }
            }

            let response = Response {
                id: request.id,
                functions: functions,
            };

            let response_json = match serde_json::to_string(&response) {
                Ok(r) => r,
                Err(e) => {
                    eprintln!("Can't write file: {}", e);
                    return;
                }
            };

            stdout.write_all(response_json.as_bytes()).unwrap();
            stdout.write_all(b"\n").unwrap();
            stdout.flush().unwrap();
        }
    }
}
