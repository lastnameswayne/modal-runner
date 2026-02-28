import modal

app = modal.App("ascii-demo")

image = modal.Image.debian_slim().pip_install("pyfiglet")

@app.function(image=image)
def to_ascii(text: str, font: str = "slant") -> str:
    import pyfiglet
    return pyfiglet.figlet_format(text, font=font)

@app.local_entrypoint()
def main(text: str = "Modal", font: str = "slant"):
    result = to_ascii.remote(text, font)
    print(result)
