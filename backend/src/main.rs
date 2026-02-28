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
    params: Vec<Param>,
}

#[derive(Serialize)]
struct Param {
    name: String,
    param_type: String,
    default: String,
}

const SUPPORTED_DECORATORS: &[&str] = &["local_entrypoint", "function"];
const EXCLUDED_DECORATORS: &[&str] = &["web_endpoint", "schedule"];

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
        match read_functions_from_file(&line) {
            Ok(response) => {
                write_response_to_stdout(&mut stdout, response);
            }
            Err(e) => {
                eprintln!("Could not read functions in file: {e}");
                let id = serde_json
                    ::from_str::<Request>(&line)
                    .map(|r| r.id)
                    .unwrap_or_default();
                write_error_to_stdout(&mut stdout, id, format!("{e}"));
            }
        };
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
        if !has_supported_decorator(&child, &source_code) {
            continue;
        }
        let def = match child.child_by_field_name("definition") {
            Some(d) => d,
            None => {
                continue;
            }
        };
        if let Some(name) = def.child_by_field_name("name") {
            let function_name: String = source_code[name.byte_range()].to_string();
            let params = extract_params(&def, &source_code);
            let function: Function = Function {
                name: function_name,
                line: child.start_position().row + 1,
                params,
            };
            functions.push(function);
        }
    }
    return functions;
}

fn extract_params(def_node: &Node, source_code: &str) -> Vec<Param> {
    let mut params = Vec::new();
    let parameters = match def_node.child_by_field_name("parameters") {
        Some(p) => p,
        None => {
            return params;
        }
    };
    for param in parameters.children(&mut parameters.walk()) {
        let (name, param_type, default) = match param.kind() {
            // eg. for 'f(count: int = 3)' name is "count", ptype is "int" and default is "3"
            "typed_parameter" | "typed_default_parameter" => {
                let name = get_first_child_of_kind(&param, "identifier", source_code);
                let ptype = get_first_child_of_kind(&param, "type", source_code);
                let default = if param.kind() == "typed_default_parameter" {
                    // find the last child
                    param
                        .children(&mut param.walk())
                        .last()
                        .filter(
                            |c|
                                c.kind() != "=" &&
                                c.kind() != "type" &&
                                c.kind() != ":" &&
                                c.kind() != "identifier"
                        )
                        .map(|c| source_code[c.byte_range()].to_string())
                        .unwrap_or_default()
                } else {
                    String::new()
                };
                (name, ptype, default)
            }
            // eg. 'f(name = "world")'
            "default_parameter" => {
                let name = get_first_child_of_kind(&param, "identifier", source_code);
                let default = param
                    .children(&mut param.walk())
                    .last()
                    .map(|c| source_code[c.byte_range()].to_string())
                    .unwrap_or_default();
                (name, String::new(), default)
            }
            // eg. 'f(name)'
            "identifier" => {
                (source_code[param.byte_range()].to_string(), String::new(), String::new())
            }
            _ => {
                continue;
            }
        };
        if name.is_empty() || name == "self" {
            continue;
        }
        params.push(Param { name, param_type, default });
    }
    params
}

fn get_first_child_of_kind(node: &Node, kind: &str, source_code: &str) -> String {
    for child in node.children(&mut node.walk()) {
        if child.kind() == kind {
            return source_code[child.byte_range()].to_string();
        }
    }
    String::new()
}

fn has_supported_decorator(node: &Node, source_code: &str) -> bool {
    let mut has_supported = false;
    for decorator in node.children(&mut node.walk()) {
        if decorator.kind() != "decorator" {
            continue;
        }
        let decorator_text: &str = &source_code[decorator.byte_range()];
        for name in EXCLUDED_DECORATORS {
            if decorator_text.contains(name) {
                return false;
            }
        }
        for name in SUPPORTED_DECORATORS {
            if decorator_text.contains(name) {
                has_supported = true;
            }
        }
    }
    return has_supported;
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

fn write_error_to_stdout(stdout: &mut Stdout, id: String, error: String) {
    let error_json = serde_json::json!({"id": id, "error": error}).to_string();
    stdout.write_all(error_json.as_bytes()).unwrap();
    stdout.write_all(b"\n").unwrap();
    stdout.flush().unwrap();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_read_functions_from_file() {
        let fixture_path = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/test_app.py");
        let input =
            serde_json::json!({
            "file": fixture_path,
            "id": "test-1"
        }).to_string();

        let response = read_functions_from_file(&input).unwrap();

        assert_eq!(response.id, "test-1");
        assert_eq!(response.functions.len(), 3);
        assert_eq!(response.functions[0].name, "my_function");
        assert_eq!(response.functions[0].line, 5);
        assert_eq!(response.functions[0].params.len(), 0);
        assert_eq!(response.functions[1].name, "main");
        assert_eq!(response.functions[1].line, 9);
        assert_eq!(response.functions[2].name, "with_params");
        assert_eq!(response.functions[2].line, 17);
        assert_eq!(response.functions[2].params.len(), 2);
        assert_eq!(response.functions[2].params[0].name, "name");
        assert_eq!(response.functions[2].params[0].param_type, "str");
        assert_eq!(response.functions[2].params[0].default, "");
        assert_eq!(response.functions[2].params[1].name, "count");
        assert_eq!(response.functions[2].params[1].param_type, "int");
        assert_eq!(response.functions[2].params[1].default, "3");
    }
}
