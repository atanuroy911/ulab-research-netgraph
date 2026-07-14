import requests
from bs4 import BeautifulSoup
import json
import os

url = 'https://ulab.edu.bd/faculty/nafees-mansoor-phd'
res = requests.get(url)
soup = BeautifulSoup(res.text, 'html.parser')

data = {}

# Let's just print all the main divs in the main content area
main_div = soup.find('div', class_='region-content') or soup.find('main') or soup.body
if main_div:
    with open('test_profile.txt', 'w', encoding='utf-8') as f:
        f.write(main_div.prettify())
print("Done")
