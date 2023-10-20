from fastapi import FastAPI, File, UploadFile, Form
from tempfile import NamedTemporaryFile
from fastapi.middleware.cors import CORSMiddleware
from .loopFinder import loopFinder
from moviepy.editor import VideoFileClip
import os

app = FastAPI()

origins = [
    "http://localhost:3000",
    "localhost:3000"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

@app.get("/", tags=["root"])
async def read_root() -> dict:
    return {"message": "This is a placeholder. DO NOT FORGET TO CHANGE!!!"}

@app.post("/uploadfile")
async def create_upload_file(
    minLen: str = Form(...),
    maxLen: str = Form(...),
    threshold: str = Form(...),
    eval: str = Form(...),
    file: UploadFile = File(...)
):
    temp = NamedTemporaryFile(delete=False)
    try:
        data = await file.read()
        with temp as f:
            f.write(data)
    except Exception:
        return {"message": "There was an error uploading the file"}
    finally:
        file.close()
    video = VideoFileClip(temp.name)
    lf = loopFinder(video, float(minLen), float(maxLen), float(threshold), eval)
    gifs = lf.process_clip()

    os.remove(temp.name)
    return {"gifs": gifs}
