import modal

app = modal.App("text-summarizer")

image = modal.Image.debian_slim().pip_install("transformers", "torch")

SAMPLE_TEXT = """
Modal is a cloud platform that lets you run Python functions on powerful
hardware in the cloud. You can run GPU workloads, schedule jobs, and deploy
web endpoints — all from your local Python code with minimal configuration.
"""

@app.function(image=image, gpu="A10G", timeout=120)
def summarize(text: str, max_length: int) -> str:
    from transformers import pipeline
    summarizer = pipeline("summarization")
    result = summarizer(text, max_length=max_length)
    return result[0]["summary_text"]

@app.local_entrypoint()
def main(max_length: int = 50):
    result = summarize.remote(SAMPLE_TEXT, max_length)
    print(result)
