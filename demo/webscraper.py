import re
import urllib.request
import modal

app = modal.App(name="example-webscraper")


@app.function()
def get_links(url):
    response = urllib.request.urlopen(url)
    html = response.read().decode("utf8")
    links = []
    for match in re.finditer('href="(.*?)"', html):
        links.append(match.group(1))
    return links








@app.local_entrypoint()
def main(url):
    links = get_links.remote(url)
    print(links)