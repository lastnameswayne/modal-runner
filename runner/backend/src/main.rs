use std::io;
use std::io::Write;


fn main(){
    println!("Hello, world!");
    let mut buffer = String::new();
    io::stdin().read_line(&mut buffer);
    io::stdout().write(buffer.as_bytes());
}
