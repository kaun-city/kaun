# inspect Wikipedia GHMC election tables
import sys
import os
import urllib.request
from html.parser import HTMLParser

sys.stdout.reconfigure(encoding='utf-8')

class TableParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.depth = 0
        self.in_table = False
        self.in_cell = False
        self.current_cell = ''
        self.current_row = []
        self.current_table = []
        self.tables = []
    def handle_starttag(self, tag, attrs):
        if tag == 'table':
            self.depth += 1
            if self.depth == 1:
                self.in_table = True
                self.current_table = []
        elif tag in ('tr',) and self.in_table:
            self.current_row = []
        elif tag in ('td','th') and self.in_table:
            self.in_cell = True
            self.current_cell = ''
    def handle_endtag(self, tag):
        if tag == 'table':
            if self.depth == 1 and self.current_table:
                self.tables.append(self.current_table)
            self.depth -= 1
            if self.depth == 0: self.in_table = False
        elif tag == 'tr' and self.in_table:
            if self.current_row: self.current_table.append(self.current_row)
            self.current_row = []
        elif tag in ('td','th') and self.in_table:
            self.current_row.append(self.current_cell.strip())
            self.in_cell = False
    def handle_data(self, data):
        if self.in_cell: self.current_cell += data

req = urllib.request.Request(
    'https://en.wikipedia.org/wiki/2020_Greater_Hyderabad_Municipal_Corporation_election',
    headers={'User-Agent':'KaunBot/1.0'}
)
with urllib.request.urlopen(req, timeout=15) as r:
    html = r.read().decode('utf-8','replace')

p = TableParser()
p.feed(html)
print(f'Tables found: {len(p.tables)}')
for i, t in enumerate(p.tables):
    print(f'\nTable {i}: {len(t)} rows, {len(t[0]) if t else 0} cols')
    for row in t[:5]:
        row_str = str(row[:6])
        print(f'  {row_str[:200]}')
