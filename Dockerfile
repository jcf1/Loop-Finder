FROM python:3.9
 
WORKDIR /code

RUN apt-get update && apt-get install ffmpeg libsm6 libxext6  -y

COPY backend/requirements.txt /code/requirements.txt

RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

COPY backend/app /code/app

CMD ["uvicorn", "app.api:app", "--host", "0.0.0.0", "--port", "8000"]