import modal
import time

app = modal.App("example-get-started")

# -----------------------------------------------------------------------------
# 1. Basic function
# -----------------------------------------------------------------------------
@app.function()
def square(x: int):
    print("This code is running on a remote worker!")
    return x**2


# -----------------------------------------------------------------------------
# 2. Local entrypoint
# -----------------------------------------------------------------------------
@app.local_entrypoint()
def main():
    time.sleep(2)
    print("the square is", square.remote(42))


# -----------------------------------------------------------------------------
# 3. Function with parameters (multiple typed args)
# -----------------------------------------------------------------------------
@app.function()
def greet(name: str, times: int = 1):
    for _ in range(times):
        print(f"Hello, {name}!")
    return f"Greeted {name} {times} time(s)"


# -----------------------------------------------------------------------------
# 4. GPU function
# -----------------------------------------------------------------------------
@app.function(gpu="T4")
def gpu_task():
    import subprocess
    result = subprocess.run(["nvidia-smi"], capture_output=True, text=True)
    print(result.stdout)
    return "GPU task completed"


# -----------------------------------------------------------------------------
# 5. Scheduled function
# -----------------------------------------------------------------------------
@app.function(schedule=modal.Cron("0 9 * * *"))  # Every day at 9am UTC
def daily_job():
    print(f"Running scheduled job at {time.strftime('%Y-%m-%d %H:%M:%S')}")
    return "Scheduled job completed"


# -----------------------------------------------------------------------------
# 6. Web endpoint (FastAPI)
# -----------------------------------------------------------------------------
@app.function()
@modal.web_endpoint()
def web_hello(name: str = "World"):
    return {"message": f"Hello, {name}!"}


# -----------------------------------------------------------------------------
# 7. Parametrized class with methods
# -----------------------------------------------------------------------------
@app.cls(gpu="T4")
class Model:
    def __init__(self):
        self.model_name = "example-model"

    @modal.enter()
    def load_model(self):
        print(f"Loading {self.model_name}...")
        self.loaded = True

    @modal.method()
    def predict(self, input_text: str):
        return f"Prediction for '{input_text}' using {self.model_name}"

    @modal.method()
    def batch_predict(self, inputs: list):
        return [self.predict(x) for x in inputs]


# -----------------------------------------------------------------------------
# Entrypoint to test class methods
# -----------------------------------------------------------------------------
@app.local_entrypoint()
def test_class():
    model = Model()
    result = model.predict.remote("test input")
    print(result)
