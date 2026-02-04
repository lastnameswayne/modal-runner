import modal
import time
app = modal.App("example-get-started")


@app.function()
def square(x: int):
    print("This code is running on a remote worker!")
    return x**2


@app.local_entrypoint()
def main():
    time.sleep(10)
    print("the square is", square.remote(42))
