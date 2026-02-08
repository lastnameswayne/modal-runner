use std::io::{ self, BufRead, Stdout, Write };
use std::fs;
use serde::{ Deserialize, Serialize };
use tree_sitter::{ LanguageError, Node, Parser };

#[derive(Deserialize)]
struct Request {
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
        let response = match read_functions_from_file(&line) {
            Ok(r) => r,
            Err(e) => {
                eprintln!("Could not read functions in file: {e}");
                return;
            }
        };
        write_response_to_stdout(&mut stdout, response);
    }
}

fn read_functions_from_file(line: &str) -> Result<Response, Box<dyn std::error::Error>> {
    let request: Request = serde_json::from_str(line)?;
    let source_code = fs::read_to_string(&request.file)?;
    let mut parser = get_python_parser()?;
    let tree = parser.parse(&source_code, None).ok_or("Failed to parse")?;

    let functions = parse_all_decorated_functions(tree.root_node(), source_code);

    Ok(Response {
        id: request.id,
        functions,
    })
}

fn parse_all_decorated_functions(root_node: Node, source_code: String) -> Vec<Function> {
    let mut functions: Vec<Function> = vec! {};

    for (_i, child) in root_node.children(&mut root_node.walk()).enumerate() {
        if child.kind() != "decorated_definition" {
            continue;
        }
        if
            let Some(name) = child
                .child_by_field_name("definition")
                .and_then(|def| def.child_by_field_name("name"))
        {
            let function_name: String = source_code[name.byte_range()].to_string();
            let function: Function = Function {
                name: function_name,
                line: child.start_position().row + 1,
            };
            functions.push(function);
        }
    }
    return functions;
}

fn get_python_parser() -> Result<Parser, LanguageError> {
    let mut parser = Parser::new();
    let language: tree_sitter::Language = tree_sitter_python::LANGUAGE.into();
    parser.set_language(&language)?;
    Ok(parser)
}

fn write_response_to_stdout(stdout: &mut Stdout, response: Response) {
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

#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {
        assert_eq!(2 + 2, 4);
    }
}
