import modal

app = modal.App("openai-demo")

image = modal.Image.debian_slim().pip_install("openai")

@app.function(image=image, secrets=[modal.Secret.from_name("openai-secret")])
def complete(prompt: str) -> str:
    from openai import OpenAI
    client = OpenAI()
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}]
    )
    return response.choices[0].message.content

@app.local_entrypoint()
def main(prompt: str = "What is Modal?"):
    result = complete.remote(prompt)
    print(result)
