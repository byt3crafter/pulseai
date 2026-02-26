FROM python:3.12-slim

RUN pip install --no-cache-dir \
    requests httpx aiohttp \
    pandas openpyxl xlsxwriter \
    sqlalchemy psycopg2-binary pymysql \
    beautifulsoup4 lxml \
    pydantic python-dateutil pytz \
    jinja2 tabulate \
    cryptography python-dotenv

WORKDIR /workspace
USER nobody
