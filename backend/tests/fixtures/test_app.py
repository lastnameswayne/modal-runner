import modal

app = modal.App("test")

@app.function()
def my_function():
    pass

@app.local_entrypoint()
def main():
    pass

@app.cls()
class MyModel:
    pass
